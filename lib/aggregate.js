// Agregacion WTD y PTD — portado de la logica en genEmailHTML / renderWeek de SHIFT.

import { getTarget, getPtdTarget } from "./calc.js";

// ── WTD: suma horas/ventas/training de todos los dias cargados de la semana ──
// dailyData: { [dayName]: { [code]: { hours, sales, trainee, trainer } } }
// loadedDays: array de nombres de dia ya cargados, ej ["Monday","Tuesday",...]
export function aggregateWTD(dailyData, loadedDays, store) {
  let wHours = 0, wSales = 0, wOverUnder = 0, wTrain = 0, wTrainee = 0, wTrainer = 0;
  loadedDays.forEach((day) => {
    const d = dailyData[day];
    if (!d) return;
    wHours += d.hours || 0;
    wSales += d.sales || 0;
    const t = getTarget(store, day);
    wOverUnder += (d.sales / t) - d.hours;
    wTrain += (d.train || 0);
    wTrainee += (d.trainee || 0);
    wTrainer += (d.trainer || 0);
  });
  const wSPLH = wHours > 0 ? wSales / wHours : 0;
  const target = loadedDays.length ? getTarget(store, loadedDays[loadedDays.length - 1]) : 0;
  return {
    hours: wHours,
    sales: wSales,
    splh: wSPLH,
    overUnder: wOverUnder,
    ok: wSPLH >= target,
    trainTotal: wTrain,
    trainee: wTrainee,
    trainer: wTrainer,
  };
}

// ── PTD: totales de periodo a la fecha (viene ya agregado de la tabla, o se suma dia a dia) ──
// ptdRaw: { hours, sales } acumulado del periodo fiscal actual para esa tienda
export function ptdMetrics(ptdRaw, store) {
  if (!ptdRaw || (ptdRaw.hours <= 0 && ptdRaw.sales <= 0)) {
    return { hours: 0, sales: 0, splh: 0, ok: null, empty: true };
  }
  const target = getPtdTarget(store);
  const splh = ptdRaw.hours > 0 ? ptdRaw.sales / ptdRaw.hours : 0;
  return { hours: ptdRaw.hours, sales: ptdRaw.sales, splh, ok: splh >= target, empty: false };
}
