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

// Convierte una hora de reloj local (en una zona IANA) al instante UTC que
// representa, con el truco estandar de doble conversion: se adivina un UTC
// igual al reloj local, se formatea ese UTC EN la zona destino para ver que
// hora de reloj resulto, y la diferencia es el offset real de esa zona en
// ese instante. Nunca se le pide resolver las 2am de un cambio de horario
// (la unica hora ambigua o inexistente en un DST de EE.UU.): startOfLocalDay
// solo pide medianoche, que nunca cae en esa hora.
function zonedWallClockToUtcMs(isoDate, timeStr, timeZone) {
  const guessUtc = new Date(`${isoDate}T${timeStr}.000Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  fmt.formatToParts(guessUtc).forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });
  const asIfUtc = new Date(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}.000Z`
  );
  return guessUtc.getTime() + (guessUtc.getTime() - asIfUtc.getTime());
}

function addDaysIso(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Formatea un instante UTC en milisegundos como lo manda Toast: offset
// numerico de 4 digitos, no "Z". Mismo valor, mismo formato que Toast ya
// nos envia en sus propias fechas (ver parseToastDate arriba), para no
// introducir una forma que nunca se probo contra su API.
function toToastUtcString(ms) {
  return new Date(ms).toISOString().replace("Z", "+0000");
}

// Medianoche a medianoche en la zona real de la tienda, no un offset fijo.
// -0500 coincidia por casualidad con Texas/Tennessee en verano, pero es 2-3
// horas incorrecto todo el año para California y Arizona, y se vuelve
// incorrecto para Texas/Tennessee tambien en cuanto termina el horario de
// verano. Un turno cerca de medianoche local ya se contaba bien en el
// reporte (report.js/throughput.js recalculan el dia real de cada turno con
// la zona de la tienda al leer), pero la ventana que se le pedia a Toast y
// la que decidia que fila borrar como huerfana no eran esa misma zona.
function localDayWindowForToast(isoDate, timeZone) {
  const startMs = zonedWallClockToUtcMs(isoDate, "00:00:00", timeZone);
  const nextMidnightMs = zonedWallClockToUtcMs(addDaysIso(isoDate, 1), "00:00:00", timeZone);
  return {
    startDate: toToastUtcString(startMs),
    endDate: toToastUtcString(nextMidnightMs - 1000),
  };
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
    // Marca de tiempo de ARRANQUE de esta corrida, capturada antes de tocar
    // Toast o la base. Se usa mas abajo para decidir que filas de labor son
    // huerfanas: cualquier fila con synced_at anterior a esta marca no la
    // toco NINGUNA corrida (ni esta ni una corriendo en paralelo) desde que
    // esta empezo, asi que es segura de borrar.
    const runStartedAt = new Date(started).toISOString();

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
    //
    // Medianoche a medianoche en la zona REAL de la tienda (ya resuelta
    // arriba), no un offset fijo. Un -0500 fijo coincidia por casualidad con
    // Texas/Tennessee en horario de verano, pero es 2-3 horas incorrecto
    // todo el año para California y Arizona, y se vuelve incorrecto tambien
    // para Texas/Tennessee en cuanto cambia el horario en noviembre.
    const { startDate, endDate } = localDayWindowForToast(isoDate, timezone);

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

    // El upsert va SIEMPRE primero. Con el orden anterior (leer huerfanos ->
    // borrar -> upsert), un crash entre el borrado y el upsert dejaba a la
    // tienda sin ninguna fila de labor para ese dia hasta el proximo sync -
    // perdida real, no solo temporal. Con este orden, el peor caso de un
    // crash a mitad de camino es una fila vieja que sigue un ciclo mas de lo
    // necesario: nunca una fila legitima desaparecida.
    //
    // La limpieza de huerfanos se decide por synced_at, no por pertenencia
    // al set que ESTA corrida acaba de traer de Toast. Dos corridas sobre el
    // mismo dia (un dispatch manual mientras corre el cron, o el daily sync
    // pisando al weekly reload) siempre escriben con su propio synced_at,
    // que es >= su propio arranque - asi que ninguna puede borrar lo que la
    // otra acaba de escribir, sin importar cual arranco primero o cual
    // termina despues. Comparar solo por ID no daba esa garantia: si la
    // corrida A no traia un turno que la corrida B si trajo (Toast cambio
    // entre medio), A podia borrar ese turno pensando que era huerfano.
    let deletedStale = 0;
    if (laborRows.length) {
      const { error: laborErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .upsert(laborRows, { onConflict: "toast_entry_id" });
      if (laborErr) throw new Error("Guardar labor fallo: " + laborErr.message);

      const { error: delErr, count: deletedCount } = await supabaseAdmin
        .from("toast_labor_shifts")
        .delete({ count: "exact" })
        .eq("store_id", String(storeCode))
        .gte("clock_in", startDate)
        .lte("clock_in", endDate)
        .lt("synced_at", runStartedAt);
      if (delErr) throw new Error("Borrar huerfanos fallo: " + delErr.message);
      deletedStale = deletedCount || 0;
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

    // labor y ventas ya son un hecho consumado si llegamos aca: cualquier
    // falla en esas dos tira un throw mas arriba y corta todo antes de
    // escribir nada (comportamiento sin cambios). transactions y hourly
    // SI pueden fallar sin cortar el resto (kitchen tambien, y ademas puede
    // saltarse a proposito) - pero un ok:true con esos dos en error dejaba
    // creer que la corrida cubrio esta tienda cuando en realidad faltan
    // datos que el TPLH y la curva por hora si necesitan. La verificacion de
    // cobertura en el workflow depende de que este campo sea honesto.
    const ok = !transactionError && !hourlyError;

    return Response.json({
      ok,
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
      writes: {
        labor: { ok: true, rowsSynced: laborRows.length, staleRemoved: deletedStale },
        sales: { ok: true, grossSales },
        transactions: { ok: !transactionError, count: transactionCount, error: transactionError },
        hourly: { ok: !hourlyError, rowsWritten: hourlyRowsWritten, error: hourlyError },
        // Cocina es deliberadamente aparte: opcional desde siempre (se puede
        // saltar con skipKitchen, o Toast puede no tener nada que devolver),
        // y su falla nunca tumbo el sync ni debe tumbar "ok" ahora.
        kitchen: skipKitchen
          ? { ok: true, skipped: true }
          : { ok: !kitchenError, skipped: false, stationCount, error: kitchenError },
      },
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}