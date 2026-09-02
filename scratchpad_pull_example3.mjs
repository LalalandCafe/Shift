import fs from "fs";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const { supabaseAdmin } = await import("./lib/supabase.js");
const { data: store } = await supabaseAdmin.from("stores").select("*").eq("code", 10001).single();
console.log(JSON.stringify(store, null, 2));
const { data: excl } = await supabaseAdmin.from("excluded_employees").select("*");
console.log("excluded_employees count:", excl?.length);
console.log(excl?.slice(0,10));
const { data: metricTargets } = await supabaseAdmin.from("metric_targets").select("*");
console.log(JSON.stringify(metricTargets, null, 2));
