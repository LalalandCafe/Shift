// Calculos portados EXACTO de SHIFT.
// Estas son las mismas formulas del archivo original, sin cambios de logica.

import { WEEKEND } from "./fiscal.js";

// ── EXCLUSIONES (portado de exclReason / isExcludedEmp) ──
// Normaliza "Apellido, Nombre" para comparar sin importar espacios/mayusculas.
function normEmp(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// excludedList: array de nombres (de la tabla excluded_employees)
export function isExcludedEmp(name, excludedList) {
  const n = normEmp(name);
  return excludedList.some((e) => normEmp(e) === n);
}

// Devuelve la razon de exclusion, o "" si no se excluye.
// jtN = job title normalizado (lowercase, sin asterisco final)
export function exclReason(empName, jtN, excludedList) {
  if (empName && isExcludedEmp(empName, excludedList)) return "Excluded list";
  if (jtN === "nso trainer") return "NSO Trainer";
  if (jtN === "general manager") return "General Manager";
  if (jtN === "event support - la") return "Event Support - LA";
  return "";
}

// Normaliza el job title igual que SHIFT: lowercase, quita "*" final.
export function normJobTitle(jt) {
  return String(jt || "").toLowerCase().replace(/\*$/, "").trim();
}

// ── TARGETS (portado de getTarget / ptdTarget) ──
// store = objeto de la tabla stores { weekday_target, weekend_target, ptd_target, grp }
export function getTarget(store, day) {
  if (!store) return 75;
  return WEEKEND.has(day) ? store.weekend_target : store.weekday_target;
}

export function getPtdTarget(store) {
  if (!store) return 80;
  return store.ptd_target;
}

// ── AGREGACION DE HORAS DESDE PAYROLL (portado de parsePay) ──
// Formula: Hours = Regular Hours + Overtime Hours, excluyendo GM/NSO/lista negra.
// Trainee y Certified Trainer se suman aparte (y tambien cuentan en las horas totales).
// rows: array de registros de payroll con { employee, jobTitle, regularHours, overtimeHours, code }
export function aggregatePayroll(rows, excludedList) {
  const hours = {}, trainee = {}, trainer = {}, audit = [];
  rows.forEach((r) => {
    const code = parseInt(String(r.code).replace(/[^0-9]/g, ""));
    if (!code || isNaN(code)) return;
    const empName = String(r.employee || "").trim();
    const jtN = normJobTitle(r.jobTitle);
    const regH = parseFloat(r.regularHours) || 0;
    const otH = parseFloat(r.overtimeHours) || 0;
    const total = regH + otH;
    if (total <= 0) return;
    const excl = exclReason(empName, jtN, excludedList);
    audit.push({ code, emp: empName, jt: r.jobTitle, h: total, excl });
    if (excl) return;
    hours[code] = (hours[code] || 0) + total;
    if (jtN === "trainee") trainee[code] = (trainee[code] || 0) + total;
    if (jtN === "certified trainer") trainer[code] = (trainer[code] || 0) + total;
  });
  // Total training = trainee + trainer (portado exacto)
  const train = {};
  Object.keys(trainee).forEach((k) => { train[k] = (train[k] || 0) + trainee[k]; });
  Object.keys(trainer).forEach((k) => { train[k] = (train[k] || 0) + trainer[k]; });
  return { hours, train, trainee, trainer, audit };
}

// ── METRICAS POR DIA/TIENDA (portado de la logica del week view / email) ──
// sales, hours son numeros; store el objeto de tienda; day el nombre del dia.
export function dayMetrics(sales, hours, store, day) {
  const t = getTarget(store, day);
  const sp = hours > 0 ? sales / hours : 0;      // SPLH
  const ou = (sales / t) - hours;                 // Hours (Over)/Under
  const ok = sp >= t;                             // verde si cumple target
  return { sales, hours, target: t, splh: sp, overUnder: ou, ok };
}

// ── DETECCION DE ANOMALIAS (portado exacto de anomalyFlags) ──
export function anomalyFlags(store, s, h, day) {
  const flags = [];
  const t = getTarget(store, day);
  if (h < 1 && s >= 1) flags.push("No hours (payroll missing?)");
  else if (s < 1 && h >= 1) flags.push("No sales (Location Overview missing?)");
  else if (h < 1 && s < 1) flags.push("No data (closed?)");
  if (h >= 1 && s >= 1) {
    const sp = s / h;
    if (sp >= t * 2.5) flags.push("SPLH very high (" + Math.round(sp) + " vs target " + t + ")");
  }
  if (h > 400) flags.push("Hours very high (" + Math.round(h) + "h in one day)");
  return flags;
}

// Formateo (Over)/Under igual que SHIFT: negativo -> "(N)", sin signo +
export function fmtOverUnder(n) {
  const r = Math.round(n);
  return r < 0 ? "(" + Math.abs(r) + ")" : String(r);
}
