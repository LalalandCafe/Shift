// Curva intradia del planeador.
//
// La idea central: este modulo NO vuelve a pronosticar nada. Toma las horas
// que el planeador ya calculo para el dia y las reparte entre las horas del
// dia usando la FORMA historica de la venta, no su monto.
//
//   horas_de_la_hora_h = horas_del_dia * (venta_hora_h / venta_del_dia)
//
// Por construccion la curva suma exactamente las horas que el header ya
// muestra. Ese es el punto. Si esto reimplementara la seleccion de fechas
// o el promedio, tarde o temprano se separaria de buildForecast y el GM
// veria 76 arriba y 74 abajo, y ese dia deja de usar la pantalla.
//
// Por eso llamamos a buildForecast y consumimos su sampleDates y su
// allowedHours en vez de recalcularlos.

import { supabaseAdmin } from "./supabase.js";
import { buildForecast } from "./forecast.js";

const HOURS_IN_DAY = 24;

// Ancho de la ventana pico que se reporta en texto. Dos horas es lo que un
// gerente puede accionar de verdad: "entra alguien mas de 9 a 11". Una sola
// hora es ruido, cuatro ya es medio turno.
const PEAK_WINDOW = 2;

// Cortes de intensidad, relativos al pico de ESE dia. Relativos y no
// absolutos porque "a tope" en Royal Lane y "a tope" en El Dorado son
// numeros muy distintos, pero la sensacion en piso es la misma.
const SLAMMED_AT = 0.75;
const BUSY_AT = 0.40;

// Supabase corta en 1000 filas por consulta. Con lookback 12 son 84 fechas
// x 24 horas = 2016 filas, y la mitad se perderia en silencio. Ya nos paso
// una vez con la paginacion de daily_sales, no se repite.
const PAGE_SIZE = 1000;

function hourLabel(hour) {
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return h12 + suffix;
}

// Reparte un entero total entre pesos usando restos mayores, para que la
// suma de los enteros sea EXACTAMENTE el total. Redondear cada hora por
// separado daria 74 u 78 donde el header dice 76.
function distributeWholeHours(weights, total) {
  const out = new Array(weights.length).fill(0);
  const target = Math.round(total);
  if (!(target > 0)) return out;

  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return out;

  const raw = weights.map((w) => (w / sum) * target);
  raw.forEach((v, i) => { out[i] = Math.floor(v); });

  let left = target - out.reduce((a, b) => a + b, 0);

  // Solo suben horas con peso real. Sin este filtro, un sobrante podria
  // caer en una hora cerrada y sugerir personal a las 3am.
  const candidates = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v), weight: weights[i] }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.frac - a.frac || b.weight - a.weight);

  let k = 0;
  while (left > 0 && candidates.length) {
    out[candidates[k % candidates.length].i] += 1;
    left -= 1;
    k += 1;
  }

  return out;
}

// La banda vive aqui y no en el componente para que haya una sola verdad.
// Si maniana agregamos el reporte por correo, usa estos mismos cortes.
function bandOf(staff, peak) {
  if (!(staff > 0) || !(peak > 0)) return null;
  const ratio = staff / peak;
  if (ratio >= SLAMMED_AT) return "slammed";
  if (ratio >= BUSY_AT) return "busy";
  return "quiet";
}

// Mejor bloque contiguo de `size` horas. Se reporta como ventana y no como
// hora suelta porque un turno se mueve en bloques, no en instantes.
function bestWindow(staff, size) {
  let best = null;
  for (let h = 0; h + size <= HOURS_IN_DAY; h++) {
    let sum = 0;
    for (let k = 0; k < size; k++) sum += staff[h + k];
    if (!best || sum > best.staff) best = { from: h, to: h + size - 1, staff: sum };
  }
  if (!best || best.staff <= 0) return null;
  return {
    from: best.from,
    to: best.to,
    staff: best.staff,
    fromLabel: hourLabel(best.from),
    toLabel: hourLabel(best.to + 1),
  };
}

// Primera hora despues del pico en la que el dia baja a tranquilo y ya no
// vuelve a subir. Es la que le dice al gerente donde puede empezar a cortar.
function calmsDownAt(bands, peakHour) {
  if (peakHour === null) return null;
  for (let h = peakHour + 1; h < HOURS_IN_DAY; h++) {
    if (bands[h] !== "quiet") continue;
    let staysQuiet = true;
    for (let k = h + 1; k < HOURS_IN_DAY; k++) {
      if (bands[k] && bands[k] !== "quiet") { staysQuiet = false; break; }
    }
    if (staysQuiet) return h;
  }
  return null;
}

async function fetchHourlyRows(storeCode, dates) {
  if (!dates.length) return [];

  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const wanted = new Set(dates);

  const rows = [];
  let offset = 0;

  // Se pide por rango y se filtra en memoria a las fechas exactas. Un
  // rango es un solo indice-scan; un IN de 84 fechas no lo es.
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("hourly_sales")
      .select("business_date, hour, gross_sales, transaction_count")
      .eq("store_code", storeCode)
      .gte("business_date", from)
      .lte("business_date", to)
      .order("business_date", { ascending: true })
      .order("hour", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error("hourly_sales: " + error.message);
    if (!data || !data.length) break;

    data.forEach((r) => { if (wanted.has(r.business_date)) rows.push(r); });

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function buildHourlyPlan(storeCode, weekStartIso, lookbackWeeks = 4) {
  const code = Number(storeCode);

  const forecast = await buildForecast(code, weekStartIso, lookbackWeeks);

  const { data: capRows, error: capErr } = await supabaseAdmin
    .from("stores")
    .select("max_staff_capacity")
    .eq("code", code)
    .limit(1);
  if (capErr) throw new Error("stores: " + capErr.message);
  const maxStaffCapacity =
    capRows && capRows.length && capRows[0].max_staff_capacity
      ? Number(capRows[0].max_staff_capacity)
      : null;

  // Union de todas las fechas que el pronostico realmente uso.
  const allDates = [];
  forecast.days.forEach((d) => {
    (d.sampleDates || []).forEach((iso) => {
      if (!allDates.includes(iso)) allDates.push(iso);
    });
  });

  const rows = await fetchHourlyRows(code, allDates);

  const salesByDate = {};
  const txnsByDate = {};
  rows.forEach((r) => {
    const h = Number(r.hour);
    if (!(h >= 0 && h < HOURS_IN_DAY)) return;
    if (!salesByDate[r.business_date]) {
      salesByDate[r.business_date] = new Array(HOURS_IN_DAY).fill(0);
      txnsByDate[r.business_date] = new Array(HOURS_IN_DAY).fill(0);
    }
    salesByDate[r.business_date][h] += Number(r.gross_sales) || 0;
    txnsByDate[r.business_date][h] += Number(r.transaction_count) || 0;
  });

  let openFrom = null;
  let openTo = null;

  const days = forecast.days.map((day) => {
    const sampleDates = (day.sampleDates || []).filter((iso) => salesByDate[iso]);
    const covered = sampleDates.length;

    const base = {
      date: day.date,
      dayName: day.dayName,
      shortDay: day.shortDay,
      allowedHours: day.allowedHours,
      expectedSales: day.expectedSales,
      target: day.target,
      samples: day.samples,
      hourlyDays: covered,
    };

    const empty = {
      ...base, hasCurve: false, hours: [],
      peakHour: null, peakStaff: null, peakWindow: null, calmsAt: null,
      overCapacityHours: [],
    };

    if (!covered || !day.hasForecast) return empty;

    // Promedio por hora sobre las MISMAS fechas del pronostico.
    const avgSales = new Array(HOURS_IN_DAY).fill(0);
    const avgTxns = new Array(HOURS_IN_DAY).fill(0);
    sampleDates.forEach((iso) => {
      salesByDate[iso].forEach((v, h) => { avgSales[h] += v; });
      txnsByDate[iso].forEach((v, h) => { avgTxns[h] += v; });
    });
    for (let h = 0; h < HOURS_IN_DAY; h++) {
      avgSales[h] = avgSales[h] / covered;
      avgTxns[h] = avgTxns[h] / covered;
    }

    const dayTotal = avgSales.reduce((a, b) => a + b, 0);
    if (!(dayTotal > 0)) return empty;

    const staff = distributeWholeHours(avgSales, day.allowedHours);
    const peakStaff = staff.reduce((a, b) => Math.max(a, b), 0);
    let peakHour = null;
    staff.forEach((s, h) => { if (s === peakStaff && peakHour === null && s > 0) peakHour = h; });

    const bands = staff.map((s) => bandOf(s, peakStaff));

    const hours = avgSales.map((sales, h) => {
      const share = sales / dayTotal;
      if (sales > 0) {
        if (openFrom === null || h < openFrom) openFrom = h;
        if (openTo === null || h > openTo) openTo = h;
      }
      return {
        hour: h,
        label: hourLabel(h),
        endLabel: hourLabel((h + 1) % HOURS_IN_DAY),
        expectedSales: Math.round(day.expectedSales * share),
        expectedTransactions: Math.round(avgTxns[h]),
        staff: staff[h],
        band: bands[h],
        overCapacity: maxStaffCapacity !== null && staff[h] > maxStaffCapacity,
      };
    });

    const calmsAt = calmsDownAt(bands, peakHour);

    return {
      ...base,
      hasCurve: true,
      hours,
      peakHour,
      peakStaff,
      peakWindow: bestWindow(staff, PEAK_WINDOW),
      calmsAt,
      calmsAtLabel: calmsAt === null ? null : hourLabel(calmsAt),
      overCapacityHours: hours.filter((h) => h.overCapacity).map((h) => h.label),
    };
  });

  return {
    ok: true,
    store: forecast.store,
    weekStart: forecast.weekStart,
    weekEnd: forecast.weekEnd,
    lookbackWeeks: forecast.lookbackWeeks,
    historyFrom: forecast.historyFrom,
    historyTo: forecast.historyTo,
    maxStaffCapacity,
    // Ventana de apertura observada. La UI recorta la grafica a esto en vez
    // de dibujar 24 columnas donde 7 estan siempre en cero.
    openFrom: openFrom === null ? 6 : openFrom,
    openTo: openTo === null ? 21 : openTo,
    days,
    totals: {
      daysWithCurve: days.filter((d) => d.hasCurve).length,
      daysWithForecast: forecast.totals.daysWithForecast,
    },
    generatedAt: new Date().toISOString(),
  };
}