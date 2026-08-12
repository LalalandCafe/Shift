// HME DXS client and transforms for drive-thru timer data.
// Goes in lib/hme.js

const BASE = "https://api.hmecloud.com";

// HME caps a single request window at 72h. Ask for slightly less so that
// clock skew never trips the 400 "dates_is_out_of_range".
export const WINDOW_HOURS = 70;

// Cloud data runs at least 15 min behind. Never request the last 20.
export const LAG_MINUTES = 20;

// HME rejects the SAME request 3+ times within 60 min. Nudging Limit on
// every call guarantees no two requests are ever byte-identical.
let _nudge = 0;
export function nextLimit() {
  return 5000 - (_nudge++ % 50);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  return {
    accept: "application/json; charset=utf-8",
    "auth-key": process.env.HME_AUTH_KEY,
    "service-account": process.env.HME_SERVICE_ACCOUNT,
    "account-email": process.env.HME_ACCOUNT_EMAIL,
  };
}

export async function hmeCall(path, params = {}, attempt = 1) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url, { headers: headers(), cache: "no-store" });

  if (res.status === 429) {
    if (attempt > 3) throw new Error("HME rate limit after 3 attempts");
    await sleep(3000 * attempt);
    return hmeCall(path, { ...params, Limit: nextLimit() }, attempt + 1);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`HME ${res.status}: ${text.slice(0, 300)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("HME returned a non-JSON response");
  }
}

export function listHmeStores() {
  return hmeCall("/dxsmgmt/v2/store/list/default", { Limit: 1000, Offset: 0 });
}

// ---------------------------------------------------------------------
// Detector name normalization
//
// Names differ between ZOOM Nitro and other timer models, and between lane
// configurations. Collapse every alias into the five segments we chart.
// ---------------------------------------------------------------------
const SEGMENTS = {
  menu_board_time: [
    "menu board", "menu board1", "menu board2", "menu 1", "menu 2",
    "menu1", "menu2", "order", "order 1", "order 2",
    "order point", "order point 1", "order point 2",
  ],
  greet_time: ["greet", "greet 1", "greet 2", "greet1", "greet2"],
  cashier_time: ["cashier", "cashier 1", "cashier 2", "window 2"],
  service_time: [
    "service", "service 1", "service 2", "service1", "service2",
    "delivery", "delivery 1", "delivery 2",
    "window", "window 1", "window1",
    "present", "present 1", "present 2", "presenter",
    "pickup", "pickup window",
  ],
  pull_forward_time: [
    "pull forward", "pull forward 1", "pull forward 2",
    "wait area", "wait area 1", "wait area 2", "wait area 3", "wait area 4",
    "pf window",
  ],
};

const SEGMENT_LOOKUP = {};
for (const [col, names] of Object.entries(SEGMENTS)) {
  for (const n of names) SEGMENT_LOOKUP[n] = col;
}
const SEGMENT_COLUMNS = Object.keys(SEGMENTS);

/**
 * The store-local business date is already inside the raw ISO string.
 *
 * HME returns "2026-08-11T23:59:23-05:00" using the TIMER's own UTC offset,
 * so the first 10 characters ARE the local date and characters 11-13 ARE
 * the local hour. Slicing the string is correct. Converting from UTC is not,
 * and that is exactly what caused the CA store date misattribution in the
 * labor sync.
 */
export function localDateParts(iso) {
  if (typeof iso !== "string" || iso.length < 13) return null;

  if (iso.endsWith("Z")) {
    const d = new Date(iso);
    return {
      business_date: d.toISOString().slice(0, 10),
      departure_hour: d.getUTCHours(),
    };
  }

  return {
    business_date: iso.slice(0, 10),
    departure_hour: parseInt(iso.slice(11, 13), 10),
  };
}

/** Flatten one HME car record into 0..n rows for hme_car_events. */
export function flattenRecord(rec, storeCode) {
  const out = [];
  if (!rec || !rec.RecordId) return out;

  const events = Array.isArray(rec.Events) ? rec.Events : [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev?.DepartureTime) continue;

    const parts = localDateParts(ev.DepartureTime);
    if (!parts) continue;

    // A record carrying multiple events needs unique primary keys.
    const recordId = i === 0 ? rec.RecordId : `${rec.RecordId}:${i}`;

    const row = {
      record_id: recordId,
      store_code: storeCode,
      lane_config: rec.LaneConfig ?? null,
      lane: ev.Lane ?? null,
      event_type: ev.EventType ?? null,
      departure_time: ev.DepartureTime,
      business_date: parts.business_date,
      departure_hour: parts.departure_hour,
      total_time_in_lane: ev.TotalTimeInLane ?? null,
      queue_time_in_lane: ev.QueueTimeInLane ?? null,
      total2_time_in_lane: ev.Total2TimeInLane ?? null,
      queue2_time_in_lane: ev.Queue2TimeInLane ?? null,
      cars_in_queue: ev.CarsInQueue ?? null,
      detectors: Array.isArray(ev.Detectors) ? ev.Detectors : [],
      evd_car_id: ev.EvdCarId ?? null,
    };

    for (const c of SEGMENT_COLUMNS) row[c] = null;

    for (const d of row.detectors) {
      const key = String(d?.EventName ?? "").toLowerCase().trim();
      const col = SEGMENT_LOOKUP[key];
      if (col && row[col] == null) row[col] = d.TimeOnDetector ?? null;
    }

    out.push(row);
  }

  return out;
}

/** Flatten a full RCD endpoint response. */
export function flattenResponse(body, storeCode) {
  const payload = body?.data ?? {};
  const records = payload.data ?? [];
  const rows = [];
  for (const rec of records) rows.push(...flattenRecord(rec, storeCode));
  return {
    rows,
    total: payload.total ?? 0,
    moreData: !!payload.moreData,
    offsetNext: payload.offsetNext ?? null,
  };
}

/**
 * Fetch one window (<= 70h) for one store, paging through Offset.
 * Returns rows ready to upsert into hme_car_events.
 */
export async function fetchWindow(hmeStoreNumber, storeCode, startIso, endIso) {
  const all = [];
  let offset = 0;
  let pages = 0;

  for (;;) {
    const body = await hmeCall("/dxs/v1/rcd/report", {
      StartDateTime: startIso,
      EndDateTime: endIso,
      StoreNumberList: JSON.stringify([String(hmeStoreNumber)]),
      IncludePullOuts: "true",
      IncludeIndependents: "true",
      Limit: nextLimit(),
      Offset: offset,
    });

    const { rows, moreData, offsetNext } = flattenResponse(body, storeCode);
    all.push(...rows);
    pages++;

    if (!moreData || offsetNext == null || pages > 20) break;
    offset = offsetNext;
    await sleep(250);
  }

  return all;
}