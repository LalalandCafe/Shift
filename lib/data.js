// Capa de datos — reemplaza el localStorage de SHIFT.
// Todas estas funciones asumen que reciben un cliente supabaseAdmin ya inicializado.

// ── TIENDAS ──
export async function getAllStores(supabase) {
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("active", true)
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  // Mapa por codigo, igual que ALL_LOC en SHIFT
  const map = {};
  data.forEach((s) => { map[s.code] = s; });
  return map;
}

export async function updateStoreTargets(supabase, code, weekdayTarget, weekendTarget, ptdTarget) {
  const { error } = await supabase
    .from("stores")
    .update({
      weekday_target: weekdayTarget,
      weekend_target: weekendTarget,
      ptd_target: ptdTarget,
    })
    .eq("code", code);
  if (error) throw new Error(error.message);
}

export async function addStore(supabase, { code, name, region, grp, weekdayTarget, weekendTarget, ptdTarget }) {
  const { error } = await supabase.from("stores").insert({
    code, name, region, grp,
    weekday_target: weekdayTarget ?? 75,
    weekend_target: weekendTarget ?? 85,
    ptd_target: ptdTarget ?? 80,
    is_custom: true,
  });
  if (error) throw new Error(error.message);
}

export async function renameStore(supabase, code, newName) {
  const { error } = await supabase.from("stores").update({ name: newName }).eq("code", code);
  if (error) throw new Error(error.message);
}

export async function removeStore(supabase, code) {
  // Solo se permite borrar tiendas custom (igual que SHIFT)
  const { data, error: selErr } = await supabase.from("stores").select("is_custom").eq("code", code).single();
  if (selErr) throw new Error(selErr.message);
  if (!data?.is_custom) throw new Error("Solo se pueden eliminar tiendas agregadas manualmente (custom).");
  const { error } = await supabase.from("stores").delete().eq("code", code);
  if (error) throw new Error(error.message);
}

// ── LABOR (horas ya agregadas por tienda/dia, viene de toast_labor_shifts) ──
// Devuelve { [code]: { hours, trainee, trainer, train } } para una fecha dada.
export async function getLaborForDate(supabase, businessDate, excludedList) {
  const { data, error } = await supabase
    .from("toast_labor_shifts")
    .select("store_id, employee_name, job_title, hours, clock_in")
    .gte("clock_in", businessDate + "T00:00:00")
    .lt("clock_in", businessDate + "T23:59:59.999");
  if (error) throw new Error(error.message);

  const { aggregatePayroll } = await import("./calc.js");
  const rows = data.map((r) => ({
    employee: r.employee_name,
    jobTitle: r.job_title,
    regularHours: r.hours, // Toast ya da el total; ajustar si separan reg/OT
    overtimeHours: 0,
    code: r.store_id,
  }));
  return aggregatePayroll(rows, excludedList);
}

// ── VENTAS (de daily_sales, llenada por el sync de Toast) ──
export async function getSalesForDate(supabase, businessDate) {
  const { data, error } = await supabase
    .from("daily_sales")
    .select("store_code, gross_sales")
    .eq("business_date", businessDate);
  if (error) throw new Error(error.message);
  const map = {};
  data.forEach((r) => { map[r.store_code] = r.gross_sales; });
  return map;
}

export async function upsertDailySales(supabase, businessDate, salesMap) {
  const rows = Object.entries(salesMap).map(([code, sales]) => ({
    store_code: parseInt(code),
    business_date: businessDate,
    gross_sales: sales,
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("daily_sales")
    .upsert(rows, { onConflict: "store_code,business_date" });
  if (error) throw new Error(error.message);
}

// ── EXCLUSIONES ──
export async function getExcludedEmployees(supabase) {
  const { data, error } = await supabase.from("excluded_employees").select("name");
  if (error) throw new Error(error.message);
  return data.map((r) => r.name);
}

export async function addExcludedEmployee(supabase, name, reason) {
  const { error } = await supabase.from("excluded_employees").insert({ name, reason: reason || "" });
  if (error) throw new Error(error.message);
}

export async function removeExcludedEmployee(supabase, name) {
  const { error } = await supabase.from("excluded_employees").delete().eq("name", name);
  if (error) throw new Error(error.message);
}

// ── CHANGELOG ──
export async function logChange(supabase, action, detail) {
  const { error } = await supabase.from("change_log").insert({ action, detail });
  if (error) throw new Error(error.message);
}
