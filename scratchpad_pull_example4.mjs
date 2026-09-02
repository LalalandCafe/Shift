import fs from "fs";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
// Reimplement the unrounded pieces inline by monkeypatching console before rounding.
// Easiest: copy the internal logic paths by importing the module and re-deriving via readLabor/sumSalesByStore directly.
const reportMod = await import("./lib/report.js");
// report.js doesn't export readLabor etc, so instead let's just read the raw tables ourselves for 2026-08-30 and 10001.
const { supabaseAdmin } = await import("./lib/supabase.js");

const code = 10001;
const day = "2026-08-30";

const { data: shifts } = await supabaseAdmin
  .from("toast_labor_shifts")
  .select("hours, job_title, employee_name, clock_in, clock_out")
  .eq("store_id", String(code))
  .gte("clock_in", "2026-08-29T00:00:00")
  .lte("clock_in", "2026-08-31T23:59:59");

function normName(name){ return (name||"").toLowerCase().replace(/\s+/g," ").trim(); }
function exclusionReason(empName, jobTitle, excludedSet) {
  if (empName && excludedSet.has(normName(empName))) return "Excluded list";
  const jtN = (jobTitle||"").toLowerCase().replace(/\*$/,"").trim();
  if (jtN === "nso trainer") return "NSO Trainer";
  if (jtN === "general manager") return "General Manager";
  return "";
}
function localDateInTz(utcIso, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(utcIso));
}
function shiftHours(row) {
  if (row.clock_out) return row.hours || 0;
  if (!row.clock_in) return 0;
  const h = (Date.now() - new Date(row.clock_in).getTime())/3600000;
  if (!isFinite(h) || h<0 || h>18) return 0;
  return h;
}
const excludedSet = new Set();
let totalH = 0, n=0;
shifts.forEach(r => {
  if (exclusionReason(r.employee_name, r.job_title, excludedSet)) return;
  const d = localDateInTz(r.clock_in, "America/Chicago");
  if (d !== day) return;
  totalH += shiftHours(r);
  n++;
});
console.log("unrounded day hours for 10001 on", day, "=", totalH, "from", n, "shifts");

const { data: sales } = await supabaseAdmin
  .from("daily_sales")
  .select("gross_sales, business_date")
  .eq("store_code", code)
  .eq("business_date", day);
console.log("day sales rows:", sales);
const target = 85;
const s = sales.reduce((a,r)=>a+(r.gross_sales||0),0);
console.log("sales", s, "unrounded splh", s/totalH, "overUnder", (s/target)-totalH);
