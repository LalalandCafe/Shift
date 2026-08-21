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

  // business_date -> array de 24 ventas
  const byDate = {};
  rows.forEach((r) => {
    if (!byDate[r.business_date]) byDate[r.business_date] = new Array(HOURS_IN_DAY).fill(0);
    const h = Number(r.hour);
    if (h >= 0 && h < HOURS_IN_DAY) byDate[r.business_date][h] += Number(r.gross_sales) || 0;
  });

  let openFrom = null;
  let openTo = null;

  const days = forecast.days.map((day) => {
    const sampleDates = (day.sampleDates || []).filter((iso) => byDate[iso]);
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

    if (!covered || !day.hasForecast) {
      return { ...base, hasCurve: false, hours: [], peakHour: null, peakStaff: null };
    }

    // Promedio de venta por hora sobre las MISMAS fechas del pronostico.
    const avg = new Array(HOURS_IN_DAY).fill(0);
    sampleDates.forEach((iso) => {
      byDate[iso].forEach((v, h) => { avg[h] += v; });
    });
    for (let h = 0; h < HOURS_IN_DAY; h++) avg[h] = avg[h] / covered;

    const dayTotal = avg.reduce((a, b) => a + b, 0);
    if (!(dayTotal > 0)) {
      return { ...base, hasCurve: false, hours: [], peakHour: null, peakStaff: null };
    }

    const staff = distributeWholeHours(avg, day.allowedHours);

    const hours = avg.map((sales, h) => {
      const share = sales / dayTotal;
      if (sales > 0) {
        if (openFrom === null || h < openFrom) openFrom = h;
        if (openTo === null || h > openTo) openTo = h;
      }
      return {
        hour: h,
        label: hourLabel(h),
        expectedSales: Math.round(day.expectedSales * share),
        share,
        staff: staff[h],
        overCapacity: maxStaffCapacity !== null && staff[h] > maxStaffCapacity,
      };
    });

    let peakHour = null;
    let peakStaff = 0;
    hours.forEach((x) => { if (x.staff > peakStaff) { peakStaff = x.staff; peakHour = x.hour; } });

    return { ...base, hasCurve: true, hours, peakHour, peakStaff };
  });

  const daysWithCurve = days.filter((d) => d.hasCurve).length;
  const overCapacityHours = days.reduce(
    (a, d) => a + d.hours.filter((h) => h.overCapacity).length,
    0
  );

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
    // de dibujar 24 barras donde 7 estan siempre en cero.
    openFrom: openFrom === null ? 6 : openFrom,
    openTo: openTo === null ? 21 : openTo,
    days,
    totals: {
      daysWithCurve,
      daysWithForecast: forecast.totals.daysWithForecast,
      overCapacityHours,
    },
    generatedAt: new Date().toISOString(),
  };
}