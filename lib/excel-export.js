// Export a Excel sin librerias.
//
// Excel abre nativamente una tabla HTML servida con MIME de Excel. Esto evita
// meter una dependencia nueva (xlsx pesa y obliga a npm install + redeploy),
// y conserva colores y encabezados igual que el Week View.
//
// Los numeros van CRUDOS, sin $ ni comas, para que Excel los trate como numeros
// y el equipo pueda sumar, ordenar y hacer pivotes. El formato visual se aplica
// con mso-number-format, que es la instruccion de formato que entiende Excel.

const BORDER = "1px solid #999";
const HDR_BG = "#1f3245";
const HDR_TX = "#ffffff";
const REG_BG = "#1f3245";
const REG_TX = "#ffffff";
const OK_BG = "#c6efce";
const OK_TX = "#006100";
const BAD_BG = "#ffc7ce";
const BAD_TX = "#9c0006";

const FMT_MONEY = 'mso-number-format:"\\#\\,\\#\\#0";';
const FMT_1DEC = 'mso-number-format:"0\\.0";';
const FMT_INT = 'mso-number-format:"0";';

function th(label, extra = "") {
  return `<td style="background:${HDR_BG};color:${HDR_TX};font-weight:bold;`
    + `border:${BORDER};padding:4px 6px;text-align:center;vertical-align:bottom;`
    + `font-family:Aptos,Calibri,sans-serif;font-size:9pt;${extra}">${label}</td>`;
}

function td(value, extra = "") {
  return `<td style="border:${BORDER};padding:3px 6px;`
    + `font-family:Aptos,Calibri,sans-serif;font-size:9pt;${extra}">${value}</td>`;
}

function tdNum(value, fmt = FMT_INT, extra = "") {
  return td(value, `text-align:right;${fmt}${extra}`);
}

function tdSplh(value, ok) {
  const style = ok
    ? `background:${OK_BG};color:${OK_TX};font-weight:bold;`
    : `background:${BAD_BG};color:${BAD_TX};font-weight:bold;`;
  return tdNum(value, FMT_MONEY, style);
}

export function generateWeekExcel({ weekNumber, period, weekStart, dayName, refDate, groupedStores }) {
  const COLS = 16;

  let rows = "";

  groupedStores.forEach((group) => {
    group.regions.forEach((regObj) => {
      if (!regObj.stores.length) return;

      rows += `<tr><td colspan="${COLS}" style="background:${REG_BG};color:${REG_TX};`
        + `font-weight:bold;border:${BORDER};padding:4px 6px;`
        + `font-family:Aptos,Calibri,sans-serif;font-size:9pt">${regObj.label}</td></tr>`;

      regObj.stores.forEach((s) => {
        const d = s.day, w = s.wtd, p = s.ptd;
        rows += "<tr>"
          + td(`${s.code} ${s.name}`, "white-space:nowrap;")
          + tdNum(Math.round(d.hours))
          + tdNum(Math.round(d.sales), FMT_MONEY)
          + tdNum(d.target, FMT_MONEY)
          + tdSplh(d.splh, d.ok)
          + tdNum(d.overUnder)
          + tdNum(Math.round(w.hours), FMT_INT, `border-left:2px solid #333;`)
          + tdNum(Math.round(w.sales), FMT_MONEY)
          + tdSplh(w.splh, w.ok)
          + tdNum(w.overUnder)
          + tdNum(w.trainTotal || 0, FMT_1DEC, `border-left:2px solid #333;`)
          + tdNum(w.trainee || 0, FMT_1DEC)
          + tdNum(w.trainer || 0, FMT_1DEC)
          + (p.empty
              ? td("", `border-left:2px solid #333;`) + td("") + td("")
              : tdNum(Math.round(p.hours), FMT_INT, `border-left:2px solid #333;`)
                + tdNum(Math.round(p.sales), FMT_MONEY)
                + tdSplh(p.splh, p.ok))
          + "</tr>";
      });
    });
  });

  const header = "<tr>"
    + th("Location Name", "text-align:left;")
    + th("Hours") + th("Gross Sales") + th("Target SPLH") + th("SPLH") + th("(Over)/Under")
    + th("WTD Hours", "border-left:2px solid #333;") + th("WTD Gross Sales") + th("WTD SPLH") + th("WTD (Over)/Under")
    + th("Total Training", "border-left:2px solid #333;") + th("Trainee") + th("Trainer")
    + th("PTD Hours", "border-left:2px solid #333;") + th("PTD Gross Sales") + th("PTD SPLH")
    + "</tr>";

  const bandDay = "<tr>"
    + td("", `border:none;`)
    + `<td colspan="5" style="background:#3d5975;color:#fff;font-weight:bold;border:${BORDER};`
    + `text-align:center;padding:4px;font-family:Aptos,Calibri,sans-serif;font-size:9pt">${dayName}</td>`
    + `<td colspan="4" style="background:#3d5975;color:#fff;font-weight:bold;border:${BORDER};`
    + `text-align:center;padding:4px;font-family:Aptos,Calibri,sans-serif;font-size:9pt">Week to Date</td>`
    + `<td colspan="3" style="background:#3d5975;color:#fff;font-weight:bold;border:${BORDER};`
    + `text-align:center;padding:4px;font-family:Aptos,Calibri,sans-serif;font-size:9pt">Training</td>`
    + `<td colspan="3" style="background:#3d5975;color:#fff;font-weight:bold;border:${BORDER};`
    + `text-align:center;padding:4px;font-family:Aptos,Calibri,sans-serif;font-size:9pt">Period to Date</td>`
    + "</tr>";

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:x="urn:schemas-microsoft-com:office:excel" `
    + `xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8">`
    + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>`
    + `<x:Name>Week ${weekNumber}</x:Name>`
    + `<x:WorksheetOptions><x:FreezePanes/><x:SplitHorizontalPane>3</x:SplitHorizontalPane>`
    + `<x:TopRowBottomPane>3</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane>`
    + `</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
    + `</head><body>`
    + `<table border="0" cellspacing="0" cellpadding="0">`
    + `<tr><td colspan="${COLS}" style="font-family:Aptos,Calibri,sans-serif;font-size:12pt;`
    + `font-weight:bold;padding:6px 4px">SHIFT Labor Dashboard &mdash; Week ${weekNumber}, Period ${period}</td></tr>`
    + `<tr><td colspan="${COLS}" style="font-family:Aptos,Calibri,sans-serif;font-size:9pt;`
    + `font-style:italic;color:#555;padding:0 4px 8px 4px">Week starting ${weekStart} &middot; `
    + `data through ${dayName}, ${refDate}</td></tr>`
    + bandDay + header + rows
    + `</table></body></html>`;
}