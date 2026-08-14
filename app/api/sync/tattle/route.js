// app/api/sync/tattle/route.js
//
// Automates the manual Tattle Report: pull Google and Yelp reviews,
// key them by store, and let SQL do the period rollup that used to be
// an Excel pivot.
//
// Validated against the P4-P7 manual report: 33 of 34 stores matched
// exactly and no store changed bonus tier.
//
// Params:
//   ?full=1    page everything instead of stopping at the watermark
//   ?days=45   overlap window for edited and late-arriving reviews
//   ?cer=1     also sync Tattle CER survey scores
//
// Two things that look like bugs but are not:
//   - /online-reviews ignores every date param, so filtering is client side.
//   - review_date is the raw UTC date, never converted to store local time.
//     Yelp sends midnight timestamps, so converting pushes those reviews to
//     the previous day and breaks the match with Tattle's own reporting.

import { supabaseAdmin } from '@/lib/supabase';
import { tattleFetch } from '@/lib/tattle-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MERCHANT_ID = process.env.TATTLE_MERCHANT_ID || '2777';
const PAGE_SIZE = 100;
const MAX_PAGES = 400;
const PREPACKAGED_CHANNEL = 12;

async function fetchPage(path, params) {
  const qs = new URLSearchParams({ merchantId: MERCHANT_ID, ...params });
  const res = await tattleFetch(`${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Tattle ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchLocations() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const json = await fetchPage('locations', { page, pageSize: PAGE_SIZE });
    out.push(...(json.data || []));
    if (!json.hasNextPage) break;
  }
  return out;
}

function mapReview(r, storeIdByLocation) {
  const storeId = storeIdByLocation[r.locationId];
  if (!storeId) return null;

  const latest = Array.isArray(r.responses) && r.responses.length
    ? r.responses[r.responses.length - 1]
    : null;

  return {
    review_id: r.id,
    store_id: storeId,
    tattle_location_id: r.locationId,
    provider: r.provider,
    rating: Number(r.rating),
    review_date: String(r.date).slice(0, 10),
    review_utc: r.date,
    reviewer: r.reviewer || null,
    review_text: r.text || null,
    review_url: r.url || null,
    response_text: latest?.text || null,
    response_utc: latest?.date || null,
    response_status: latest?.status || null,
    response_username: latest?.username || null,
    updated_at: new Date().toISOString(),
  };
}

async function upsertChunked(table, rows, onConflict) {
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

async function syncReviews({ full, overlapDays, storeIdByLocation }) {
  const { data: state } = await supabaseAdmin
    .from('tattle_sync_state')
    .select('max_review_id')
    .eq('id', 1)
    .maybeSingle();

  const watermark = full ? null : state?.max_review_id ?? null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - overlapDays);
  const cutoffIso = cutoff.toISOString();

  const rows = [];
  let maxId = watermark || 0;
  let pages = 0;
  let stoppedBecause = 'end of data';

  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await fetchPage('online-reviews', { page, pageSize: PAGE_SIZE });
    const data = json.data || [];
    pages = page;
    if (!data.length) break;

    for (const r of data) {
      if (r.id > maxId) maxId = r.id;
      const mapped = mapReview(r, storeIdByLocation);
      if (mapped) rows.push(mapped);
    }

    if (!json.hasNextPage) break;

    // Newest first. Stop once the page is fully older than the overlap
    // window AND below the watermark.
    const oldest = data[data.length - 1];
    const pastOverlap = oldest?.date && oldest.date < cutoffIso;
    const pastWatermark = watermark !== null && oldest?.id <= watermark;

    if (!full && pastOverlap && pastWatermark) {
      stoppedBecause = 'reached watermark and overlap window';
      break;
    }
  }

  const written = await upsertChunked('tattle_reviews', rows, 'review_id');

  await supabaseAdmin.from('tattle_sync_state').upsert(
    {
      id: 1,
      max_review_id: maxId || null,
      last_run_at: new Date().toISOString(),
      last_status: `ok, ${written} reviews, ${pages} pages`,
    },
    { onConflict: 'id' }
  );

  return { written, pages, maxId, stoppedBecause };
}

async function syncCer({ storeIdByLocation, days }) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const params = {
    experienceStartDate: start.toISOString().slice(0, 10),
    experienceEndDate: end.toISOString().slice(0, 10),
  };

  const surveys = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await fetchPage('surveys', { ...params, page, pageSize: PAGE_SIZE });
    surveys.push(...(json.data || []));
    if (!json.hasNextPage) break;
  }

  const buckets = new Map();
  for (const s of surveys) {
    const storeId = storeIdByLocation[s.locationId];
    const date = s.experienceDateTimeLocal?.slice(0, 10);
    const rating = Number(s.rating);
    if (!storeId || !date || !Number.isFinite(rating)) continue;

    const key = `${storeId}|${date}`;
    const b = buckets.get(key) || { sumAll: 0, nAll: 0, sumCafe: 0, nCafe: 0 };
    b.sumAll += rating;
    b.nAll += 1;
    if (s.channelId !== PREPACKAGED_CHANNEL) {
      b.sumCafe += rating;
      b.nCafe += 1;
    }
    buckets.set(key, b);
  }

  const rows = [...buckets.entries()].map(([key, b]) => {
    const [store_id, business_date] = key.split('|');
    return {
      store_id,
      business_date,
      cer_all: b.nAll ? Number((b.sumAll / b.nAll).toFixed(2)) : null,
      count_all: b.nAll,
      cer_cafe: b.nCafe ? Number((b.sumCafe / b.nCafe).toFixed(2)) : null,
      count_cafe: b.nCafe,
      updated_at: new Date().toISOString(),
    };
  });

  const written = await upsertChunked('tattle_cer_daily', rows, 'store_id,business_date');
  return { surveys: surveys.length, written };
}

async function handler(request) {
  if (request.headers.get('x-sync-secret') !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const full = searchParams.get('full') === '1';
  const withCer = searchParams.get('cer') === '1';
  const overlapDays = Number(searchParams.get('days') || 45);

  const startedAt = Date.now();

  try {
    const locations = await fetchLocations();

    // externalId is already the SHIFT store_id, so no mapping table.
    const storeIdByLocation = {};
    for (const l of locations) {
      if (l.externalId) storeIdByLocation[l.id] = String(l.externalId);
    }

    const reviews = await syncReviews({ full, overlapDays, storeIdByLocation });
    const cer = withCer
      ? await syncCer({ storeIdByLocation, days: Math.max(overlapDays, 45) })
      : null;

    return Response.json({
      ok: true,
      mode: full ? 'full' : 'incremental',
      locations: locations.length,
      mapped: Object.keys(storeIdByLocation).length,
      reviews,
      cer,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    await supabaseAdmin.from('tattle_sync_state').upsert(
      { id: 1, last_run_at: new Date().toISOString(), last_status: `error: ${err.message}` },
      { onConflict: 'id' }
    );
    return Response.json(
      { ok: false, error: err.message, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return handler(request);
}

export async function GET(request) {
  return handler(request);
}
