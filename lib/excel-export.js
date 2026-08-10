// Export a Excel sin librerias.
//
// Excel abre nativamente una tabla HTML servida con MIME de Excel. Esto evita
// meter una dependencia nueva (xlsx obliga a npm install + redeploy).
//
// Los estilos van en clases CSS en el <head>, no inline. Eso permite usar
// mso-number-format con punto y coma (formato de parentesis para negativos)
// sin romper el atributo style, y hace el archivo mucho mas chico.
//
// Los numeros van CRUDOS para que Excel los trate como numeros y el equipo
// pueda sumar, ordenar y hacer pivotes.

const DAY_COLS = 5;   // Hours, Sales, Target, SPLH, (Over)/Under
const WTD_COLS = 4;   // Hours, Sales, SPLH, (Over)/Under
const TRN_COLS = 3;   // Total, Trainee, Trainer
const PTD_COLS = 3;   // Hours, Sales, SPLH

const STYLES = `
<style>
  td { ${""}
    font-family: Aptos, Calibri, sans-serif;
    font-size: 9pt;
    padding: 5px 9px;
    border: 1px solid #b0b0b0;
    vertical-align: middle;
  }
  .title    { font-size: 14pt; font-weight: bold; border: none; padding: 8px 4px 2px 4px; }
  .subtitle { font-size: 9.5pt; font-style: italic; color: #555; border: none; padding: 0 4px 12px 4px; }
  .band     { background: #3d5975; color: #ffffff; font-weight: bold; text-align: center; padding: 6px 4px; }
  .hdr      { background: #1f3245; color: #ffffff; font-weight: bold; text-align: center; vertical-align: bottom; padding: 6px 8px; }
  .hdrname  { background: #1f3245; color: #ffffff; font-weight: bold; text-align: left; padding: 6px 10px; }
  .reg      { background: #1f3245; color: #ffffff; font-weight: bold; padding: 6px 10px; }
  .name     { white-space: nowrap; padding: 5px 10px; }
  .num      { text-align: right; mso-number-format: "0"; }
  .money    { text-align: right; mso-number-format: "\\#\\,\\#\\#0"; }
  .ou       { text-align: right; mso-number-format: "0_\\);\\(0\\)"; }
  .ok       { text-align: right; mso-number-format: "\\$\\#\\,\\#\\#0"; background: #c6efce; color: #006100; font-weight: bold; }
  .bad      { text-align: right; mso-number-format: "\\$\\#\\,\\#\\#0"; background: #ffc7ce; color: #9c0006; font-weight: bold; }
  .tgt      { text-align: right; mso-number-format: "\\$\\#\\,\\#\\#0"; color: #666; }
  .tot      { background: #eef1f4; font-weight: bold; }
  .dim      { color: #bbbbbb; text-align: right; }
  .sep      { border-left: 2.5px solid #333333; }
</style>`;

const DAY_ABBR = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

function cell(cls, value) {
  return `<td class="${cls}">${value === null || value === undefined ? "" : value}</td>`;
}

// days: [{ iso, dayName, byStore: { [code]: dayData } }] en orden Lun..Dom
// groupedStores: filas del ultimo dia con data, con wtd y ptd de la semana
export function generateWeekExcel({ weekNumber, period, weekStart, weekEnd, days, groupedStores }) {
  const TOTAL_COLS = 1 + days.length * DAY_COLS + WTD_COLS + TRN_COLS + PTD_COLS;

  // ---- banda superior ----
  let bandRow = `<td style="border:none"></td>`;
  days.forEach((d, i) => {
    const label = `${DAY_ABBR[d.dayName] || d.dayName} ${d.iso.slice(5).replace("-", "/")}`;
    bandRow += `<td class="band${i === 0 ? " sep" : ""}" colspan="${DAY_COLS}">${label}</td>`;
  });
  bandRow += `<td class="band sep" colspan="${WTD_COLS}">Week to Date</td>`;
  bandRow += `<td class="band sep" colspan="${TRN_COLS}">Training</td>`;
  bandRow += `<td class="band sep" colspan="${PTD_COLS}">Period to Date</td>`;

  // ---- encabezados ----
  let headRow = `<td class="hdrname">Location Name</td>`;
  days.forEach((_, i) => {
    headRow += `<td class="hdr${i === 0 ? " sep" : ""}">Hours</td>`
      + `<td class="hdr">Gross Sales</td>`
      + `<td class="hdr">Target</td>`
      + `<td class="hdr">SPLH</td>`
      + `<td class="hdr">(Over)/<br>Under</td>`;
  });
  headRow += `<td class="hdr sep">WTD<br>Hours</td><td class="hdr">WTD<br>Gross Sales</td>`
    + `<td class="hdr">WTD<br>SPLH</td><td class="hdr">WTD (Over)/<br>Under</td>`
    + `<td class="hdr sep">Total<br>Training</td><td class="hdr">Trainee</td><td class="hdr">Trainer</td>`
    + `<td class="hdr sep">PTD<br>Hours</td><td class="hdr">PTD<br>Gross Sales</td><td class="hdr">PTD<br>SPLH</td>`;

  // ---- filas ----
  let rows = "";
  groupedStores.forEach((group) => {
    group.regions.forEach((regObj) => {
      if (!regObj.stores.length) return;

      rows += `<tr><td class="reg" colspan="${TOTAL_COLS}">${regObj.label}</td></tr>`;

      regObj.stores.forEach((s) => {
        let r = `<td class="name">${s.code} &nbsp; ${s.name}</td>`;

        days.forEach((d, i) => {
          const sep = i === 0 ? " sep" : "";
          const dd = d.byStore[s.code];
          if (!dd) {
            r += cell("dim" + sep, "—") + cell("dim", "—") + cell("dim", "—")
              + cell("dim", "—") + cell("dim", "—");
          } else {
            r += cell("num" + sep, Math.round(dd.hours))
              + cell("money", Math.round(dd.sales))
              + cell("tgt", dd.target)
              + cell(dd.ok ? "ok" : "bad", dd.splh)
              + cell("ou", dd.overUnder);
          }
        });

        const w = s.wtd;
        r += cell("num tot sep", Math.round(w.hours))
          + cell("money tot", Math.round(w.sales))
          + cell(w.ok ? "ok" : "bad", w.splh)
          + cell("ou tot", w.overUnder);

        r += cell("num sep", w.trainTotal || 0)
          + cell("num", w.trainee || 0)
          + cell("num", w.trainer || 0);

        const p = s.ptd;
        if (p.empty) {
          r += cell("dim sep", "—") + cell("dim", "—") + cell("dim", "—");
        } else {
          r += cell("num tot sep", Math.round(p.hours))
            + cell("money tot", Math.round(p.sales))
            + cell(p.ok ? "ok" : "bad", p.splh);
        }

        rows += `<tr>${r}</tr>`;
      });
    });
  });

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:x="urn:schemas-microsoft-com:office:excel" `
    + `xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8">`
    + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>`
    + `<x:Name>Week ${weekNumber}</x:Name>`
    + `<x:WorksheetOptions><x:FreezePanes/>`
    + `<x:SplitVerticalPane>1</x:SplitVerticalPane><x:SplitHorizontalPane>4</x:SplitHorizontalPane>`
    + `<x:ActivePane>0</x:ActivePane><x:Print><x:ValidPrinterInfo/><x:Scale>60</x:Scale>`
    + `<x:FitWidth>1</x:FitWidth><x:Layout x:Orientation="Landscape"/></x:Print>`
    + `</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
    + STYLES
    + `</head><body>`
    + `<table border="0" cellspacing="0" cellpadding="0">`
    + `<tr><td class="title" colspan="${TOTAL_COLS}">SHIFT Labor Dashboard &mdash; Week ${weekNumber}, Period ${period}</td></tr>`
    + `<tr><td class="subtitle" colspan="${TOTAL_COLS}">${weekStart} through ${weekEnd}</td></tr>`
    + `<tr>${bandRow}</tr><tr>${headRow}</tr>${rows}`
    + `</table></body></html>`;
}