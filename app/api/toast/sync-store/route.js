import { getToastToken, getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// Un ticket que tarda mas de esto no es lento, es que nunca se marco
// cumplido en el KDS. Se excluye del promedio y se cuenta aparte.
const STUCK_THRESHOLD_MIN = 30;

// Si una tienda no tiene timezone en la tabla stores, asumimos Central.
// La mayoria son de Texas, y una tienda sin timezone es un bug de datos
// que se arregla en stores, no aqui.
const DEFAULT_TZ = "America/Chicago";

// Toast manda fechas como 2026-08-19T13:45:12.000+0000. El offset sin
// dos puntos no es ISO 8601 estricto y Date.parse lo trata distinto segun
// el runtime. Lo normalizamos antes de parsear en vez de confiar en Node.
function parseToastDate(value) {
  if (!value) return null;
  const iso = String(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(iso);
  return isFinite(ms) ? new Date(ms) : null;
}

// La hora se calcula en la zona horaria de LA TIENDA. Si se bucketeara en
// UTC o en Central fijo, la curva de Santa Monica saldria corrida 2 horas,
// y una curva corrida es peor que no tener curva porque el GM se la cree.
function makeHourFormatter(timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
}

function localHour(formatter, date) {
  if (!date) return null;
  const h = Number(formatter.format(date));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}

// Cuenta checks cerrados (no orders). Un check = una transaccion real de
// cliente pagando, misma unidad que usa gross sales. Si se contara por
// order, una mesa que se divide la cuenta en varios checks se subcontaria.
//
// El desglose por hora sale del MISMO recorrido y con los MISMOS filtros
// de void/deleted/deferred. Si el hourly filtrara distinto que el daily,
// las dos vistas se pelearian y nadie sabria cual creer.
async function computeSalesTransactionsAndHours(businessDate, restaurantGuid, token, timezone) {
  const headers = {
    Authorization: "Bearer " + token,
    "Toast-Restaurant-External-ID": restaurantGuid,
  };

  const fmt = makeHourFormatter(timezone);

  let grossSales = 0;
  let transactionCount = 0;
  const hourlySales = new Array(24).fill(0);
  const hourlyTxns = new Array(24).fill(0);

  // Ventas que no se pudieron ubicar en una hora porque el check y la
  // order venian sin ninguna fecha usable. Se reporta en la respuesta en
  // vez de esconderse: si esto crece, el query de reconciliacion lo marca.
  let unattributedSales = 0;
  let unattributedTxns = 0;

  const PAGE_SIZE = 100;
  let page = 1;

  while (page <= 200) {
    const url =
      process.env.TOAST_API_HOST +
      "/orders/v2/ordersBulk?businessDate=" + businessDate +
      "&pageSize=" + PAGE_SIZE +
      "&page=" + page;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("ordersBulk fallo: " + (await res.text()));
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) break;

    orders.forEach((order) => {
      if (!order || order.voided || order.deleted || order.excessFood) return;

      const orderDate =
        parseToastDate(order.openedDate) ||
        parseToastDate(order.paidDate) ||
        parseToastDate(order.closedDate);

      (order.checks || []).forEach((check) => {
        if (check.voided || check.deleted) return;

        // El check manda sobre la order: en una mesa que abre a las 6pm y
        // paga a las 8pm, cada check tiene su propio momento.
        const when = parseToastDate(check.openedDate) || orderDate;
        const hour = localHour(fmt, when);

        transactionCount += 1;
        if (hour === null) unattributedTxns += 1;
        else hourlyTxns[hour] += 1;

        let checkSales = 0;
        (check.selections || []).forEach((sel) => {
          if (sel.voided) return;
          if (sel.deferred) return;
          checkSales += (sel.preDiscountPrice || 0);
        });

        grossSales += checkSales;
        if (hour === null) unattributedSales += checkSales;
        else hourlySales[hour] += checkSales;
      });
    });

    if (orders.length < PAGE_SIZE) break;
    page++;
  }

  return {
    grossSales: Math.round(grossSales * 100) / 100,
    transactionCount,
    hourlySales: hourlySales.map((v) => Math.round(v * 100) / 100),
    hourlyTxns,
    unattributedSales: Math.round(unattributedSales * 100) / 100,
    unattributedTxns,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function summarize(durationsMin, stuckCount) {
  durationsMin.sort((a, b) => a - b);
  return {
    itemCount: durationsMin.length + stuckCount,
    medianMin: durationsMin.length ? Math.round(percentile(durationsMin, 0.5) * 10) / 10 : null,
    avgMin: durationsMin.length
      ? Math.round((durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length) * 10) / 10
      : null,
    p90Min: durationsMin.length ? Math.round(percentile(durationsMin, 0.9) * 10) / 10 : null,
    stuckCount,
  };
}

// Devuelve el agregado general Y el desglose por estacion de preparacion.
// El desglose es lo que le dice a un GM DONDE esta el cuello de botella,
// en vez de solo darle un numero general que no dice nada de por que.
async function computeKitchenMetrics(businessDate, restaurantGuid, token) {
  const headers = {
    Authorization: "Bearer " + token,
    "Toast-Restaurant-External-ID": restaurantGuid,
  };

  const url =
    process.env.TOAST_API_HOST +
    "/kitchen/v1/export/itemFulfillments?businessDate=" + businessDate;

  const res = await fetch(url, { headers });
  if (res.status === 204) {
    return { overall: summarize([], 0), byStation: [] };
  }
  if (!res.ok) throw new Error("kitchen fulfillments fallo: " + (await res.text()));

  const items = await res.json();
  if (!Array.isArray(items) || !items.length) {
    return { overall: summarize([], 0), byStation: [] };
  }

  const overallDur = [];
  let overallStuck = 0;
  const byStation = {}; // stationName -> { durs: [], stuck: 0 }

  items.forEach((it) => {
    if (!it.ticketFiredAt || !it.itemFulfilledAt) return;
    const fired = new Date(it.ticketFiredAt).getTime();
    const done = new Date(it.itemFulfilledAt).getTime();
    if (!isFinite(fired) || !isFinite(done) || done < fired) return;

    const min = (done - fired) / 60000;
    const station = it.prepStationName || "Unassigned";
    if (!byStation[station]) byStation[station] = { durs: [], stuck: 0 };

    if (min > STUCK_THRESHOLD_MIN) {
      overallStuck++;
      byStation[station].stuck++;
      return;
    }
    overallDur.push(min);
    byStation[station].durs.push(min);
  });

  const overall = summarize(overallDur, overallStuck);
  const stationList = Object.keys(byStation).map((name) => {
    const s = summarize(byStation[name].durs, byStation[name].stuck);
    return { prepStationName: name, ...s };
  });

  return { overall, byStation: stationList };
}

export async function POST(request) {
  try {
    const secret = request.headers.get("x-sync-secret");
    if (secret !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
    const body = await request.json();
    const { storeCode, restaurantGuid, businessDate, isoDate, skipKitchen } = body;
    if (!storeCode || !restaurantGuid || !businessDate || !isoDate) {
      return Response.json(
        { ok: false, error: "Faltan storeCode, restaurantGuid, businessDate (YYYYMMDD) o isoDate (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const started = Date.now();

    // La zona horaria se lee aqui y no se pide en el body a proposito: asi
    // los dos crons que ya llaman a este endpoint no cambian, y la tienda
    // es la unica fuente de verdad de su propia zona.
    let timezone = DEFAULT_TZ;
    const { data: tzRows, error: tzErr } = await supabaseAdmin
      .from("stores")
      .select("timezone")
      .eq("code", Number(storeCode))
      .limit(1);
    if (tzErr) throw new Error("Leer timezone fallo: " + tzErr.message);
    if (tzRows && tzRows.length && tzRows[0].timezone) timezone = tzRows[0].timezone;

    // Esta ventana se usa para DOS cosas: pedirle los turnos a Toast y
    // decidir que filas borrar. Tienen que ser identicas, si no se borran
    // turnos legitimos de la jornada anterior.
    const startDate = isoDate + "T00:00:00.000-0500";
    const endDate = isoDate + "T23:59:59.000-0500";

    const token = await getToastToken();

    // Las tres lecturas a Toast son independientes, van en paralelo.
    // Las ESCRITURAS siguen despues y en secuencia: si alguna lectura
    // falla, no se escribe nada, igual que antes.
    const [translated, salesResult, kitchenResult] = await Promise.all([
      getTimeEntries({ restaurantGuid, startDate, endDate })
        .then((raw) => translateTimeEntries(raw, restaurantGuid)),
      computeSalesTransactionsAndHours(businessDate, restaurantGuid, token, timezone),
      skipKitchen
        ? Promise.resolve(null)
        : computeKitchenMetrics(businessDate, restaurantGuid, token)
            .then((k) => ({ ok: true, data: k }))
            .catch((e) => ({ ok: false, error: e.message })),
    ]);

    const {
      grossSales,
      transactionCount,
      hourlySales,
      hourlyTxns,
      unattributedSales,
      unattributedTxns,
    } = salesResult;

    const laborRows = translated.map((t) => ({
      toast_entry_id: t.guid,
      store_id: String(storeCode),
      employee_name: t.employee,
      employee_id: null,
      job_title: t.jobTitle,
      clock_in: t.inDate,
      clock_out: t.outDate,
      hours: (t.regularHours || 0) + (t.overtimeHours || 0),
      raw_data: t,
      synced_at: new Date().toISOString(),
    }));

    let deletedStale = 0;
    if (laborRows.length) {
      const keepIds = new Set(laborRows.map((r) => r.toast_entry_id));

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .select("toast_entry_id")
        .eq("store_id", String(storeCode))
        .gte("clock_in", startDate)
        .lte("clock_in", endDate);
      if (exErr) throw new Error("Leer existentes fallo: " + exErr.message);

      const stale = (existing || [])
        .map((r) => r.toast_entry_id)
        .filter((id) => !keepIds.has(id));

      if (stale.length) {
        const { error: delErr } = await supabaseAdmin
          .from("toast_labor_shifts")
          .delete()
          .in("toast_entry_id", stale);
        if (delErr) throw new Error("Borrar huerfanos fallo: " + delErr.message);
        deletedStale = stale.length;
      }

      const { error: laborErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .upsert(laborRows, { onConflict: "toast_entry_id" });
      if (laborErr) throw new Error("Guardar labor fallo: " + laborErr.message);
    }

    const { error: salesErr } = await supabaseAdmin
      .from("daily_sales")
      .upsert(
        [{ store_code: storeCode, business_date: isoDate, gross_sales: grossSales, synced_at: new Date().toISOString() }],
        { onConflict: "store_code,business_date" }
      );
    if (salesErr) throw new Error("Guardar ventas fallo: " + salesErr.message);

    // Transacciones van en su PROPIA tabla y en su propio try/catch, igual
    // que cocina. Si daily_transactions no existe todavia o falla la escritura,
    // esto NO tumba labor ni ventas. El reporte diario (Dia/WTD/PTD) no
    // depende de esto para nada.
    let transactionError = null;
    try {
      const { error: txnErr } = await supabaseAdmin
        .from("daily_transactions")
        .upsert(
          [{
            store_code: storeCode,
            business_date: isoDate,
            transaction_count: transactionCount,
            synced_at: new Date().toISOString(),
          }],
          { onConflict: "store_code,business_date" }
        );
      if (txnErr) transactionError = txnErr.message;
    } catch (e) {
      transactionError = e.message;
    }

    // El desglose por hora sigue el mismo patron: tabla propia, try/catch
    // propio. Se escriben SIEMPRE las 24 filas, incluso en cero, para que
    // el upsert sea idempotente y no queden horas huerfanas de un sync
    // anterior cuando una venta se cancela despues.
    let hourlyError = null;
    let hourlyRowsWritten = 0;
    try {
      const syncedAt = new Date().toISOString();
      const hourlyRows = hourlySales.map((sales, hour) => ({
        store_code: storeCode,
        business_date: isoDate,
        hour,
        gross_sales: sales,
        transaction_count: hourlyTxns[hour],
        synced_at: syncedAt,
      }));

      const { error: hErr } = await supabaseAdmin
        .from("hourly_sales")
        .upsert(hourlyRows, { onConflict: "store_code,business_date,hour" });
      if (hErr) hourlyError = hErr.message;
      else hourlyRowsWritten = hourlyRows.length;
    } catch (e) {
      hourlyError = e.message;
    }

    // Kitchen es opcional: si falla o se salta, no tumba el sync.
    let kitchen = null;
    let stationCount = 0;
    let kitchenError = null;
    if (kitchenResult) {
      if (kitchenResult.ok) {
        kitchen = kitchenResult.data.overall;
        const stations = kitchenResult.data.byStation;

        const { error: kErr } = await supabaseAdmin
          .from("kitchen_metrics")
          .upsert(
            [{
              store_code: storeCode,
              business_date: isoDate,
              item_count: kitchen.itemCount,
              median_minutes: kitchen.medianMin,
              avg_minutes: kitchen.avgMin,
              p90_minutes: kitchen.p90Min,
              stuck_count: kitchen.stuckCount,
              synced_at: new Date().toISOString(),
            }],
            { onConflict: "store_code,business_date" }
          );
        if (kErr) kitchenError = kErr.message;

        if (stations.length) {
          const stationRows = stations.map((s) => ({
            store_code: storeCode,
            business_date: isoDate,
            prep_station_name: s.prepStationName,
            item_count: s.itemCount,
            median_minutes: s.medianMin,
            avg_minutes: s.avgMin,
            p90_minutes: s.p90Min,
            stuck_count: s.stuckCount,
            synced_at: new Date().toISOString(),
          }));
          const { error: sErr } = await supabaseAdmin
            .from("kitchen_station_metrics")
            .upsert(stationRows, { onConflict: "store_code,business_date,prep_station_name" });
          if (sErr && !kitchenError) kitchenError = sErr.message;
          else stationCount = stations.length;
        }
      } else {
        kitchenError = kitchenResult.error;
      }
    }

    return Response.json({
      ok: true,
      storeCode,
      date: isoDate,
      timezone,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      laborEntriesSynced: laborRows.length,
      staleRemoved: deletedStale,
      grossSales,
      transactionCount,
      transactionError,
      hourlyRowsWritten,
      hourlyError,
      unattributedSales,
      unattributedTxns,
      kitchen,
      stationCount,
      kitchenSkipped: !!skipKitchen,
      kitchenError,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}