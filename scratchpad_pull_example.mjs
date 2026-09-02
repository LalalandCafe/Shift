import fs from "fs";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const { buildDailyReport } = await import("./lib/report.js");

const date = process.argv[2] || new Date(Date.now() - 86400000).toISOString().slice(0,10);
const report = await buildDailyReport(date);
console.log("date", report.date, "dayName", report.dayName, "period", report.period, "weekStart", report.weekStart);
const withData = report.rows.filter(r => r.day.hours > 0 && r.wtd.hours > 0 && r.ptd.hours > 0);
console.log("stores with full data:", withData.length, "of", report.rows.length);
console.log(JSON.stringify(withData.slice(0,3), null, 2));
