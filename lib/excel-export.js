// Export a Excel sin librerias.
//
// Excel abre nativamente una tabla HTML servida con MIME de Excel. Esto evita
// meter una dependencia nueva (xlsx pesa y obliga a npm install + redeploy),
// y conserva colores y encabezados.
//
// Los numeros van CRUDOS, sin $ ni comas, para que Excel los trate como numeros
// y el equipo pueda sumar, ordenar y hacer pivotes. El formato visual se aplica
// con mso-number-format, que es la instruccion que entiende Excel.

const BORDER = "1px solid #999";
const HDR_BG = "#1f3245";
const HDR_TX = "#ffffff";
const BAND_BG = "#3d5975";
const REG_BG = "#1f3245";
const REG_TX = "#ffffff";
const TOT_BG = "#e8eaed";
const OK_BG = "#c6efce";
const OK_TX = "#006100";
const BAD_BG = "#ffc7ce";
const BAD_TX = "#9c0006";
const FONT = "font-family:Aptos,Calibri,sans-serif;";

const FMT_MONEY = 'mso-number-format:"\\#\\,\\#\\#0";';
const FMT_INT = 'mso-number-format:"0";';

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function th(label, extra = "") {
  return `<td style="background:${HDR_BG};color:${HDR_TX};font-weight:bold;border:${BORDER};`
    + `padding:4px 6px;text-align:center;vertical-align:bottom;${FONT}font-size:8.5pt;${extra}">${label}</td>`;
}

function band(label, span, extra = "") {
  return `<td colspan="${span}" style="background:${BAND_BG};color:#fff;font-weight:bold;`
    + `border:${BORDER};text-align:center;padding:4px;${FONT}font-size:9pt;${extra}">${label}</td>`;
}

function td(value, extra = "") {
  return `<td style="border:${BORDER};padding:3px 6px;${FONT}font-size:9pt;${extra}">${value}</td>`;
}

function tdNum(value, fmt = FMT_INT, extra = "") {
  return td(value, `text-align:right;${fmt}${extra}`);
}

function tdSplh(value, ok, extra = "") {
  const style = ok
    ? `background:${OK_BG};color:${OK_TX};font-weight:bold;`
    : `background:${BAD_BG};color:${BAD_TX};font-weight:bold;`;
  return tdNum(value, FMT_MONEY, style + extra);
}

// days: [{ iso, dayName, byStore: { [code]: dayData } }, ...] en orden Lun..Dom
// weekRows: filas del reporte del ultimo dia, agrupadas, con wtd/ptd de la semana
export function generateWeekExcel({ weekNumber, period, weekStart, weekEnd, days, groupedStores }) {
  const DAY_COLS = 3;                       // Hours, Sales, SPLH por dia
  const TOTAL_COLS = 1 + days.length * DAY_COLS + 4;

  // Banda superior: nombre de cada dia + bloque de totales
  let bandRow = `<td style="border:none"></td>`;
  days.forEach((d, i) => {
    bandRow += band(
      `${d.dayName} ${d.iso.slice(5)}`,
      DAY_COLS,
      i === 0 ? "border-left:2px solid #333;" : ""
    );
  });
  bandRow += band("Week Total", 4, "border-left:2px solid #333;");

  // Encabezado de columnas
  let headRow = th("Location Name", "text-align:left;");
  days.forEach((d, i) => {
    const bl = i === 0 ? "border-left:2px solid #333;" : "";
    headRow += th("Hours", bl) + th("Sales") + th("SPLH");
  });
  headRow += th("Hours", "border-left:2px solid #333;") + th("Sales") + th("SPLH") + th("(Over)/Under");

  // Filas por region y tienda
  let rows = "";
  groupedStores.forEach((group) => {
    group.regions.forEach((regObj) => {
      if (!regObj.stores.length) return;

      rows += `<tr><td colspan="${TOTAL_COLS}" style="background:${REG_BG};color:${REG_TX};`
        + `font-weight:bold;border:${BORDER};padding:4px 6px;${FONT}font-size:9pt">${regObj.label}</td></tr>`;

      regObj.stores.forEach((s) => {
        let r = td(`${s.code} ${s.name}`, "white-space:nowrap;");

        days.forEach((d, i) => {
          const bl = i === 0 ? "border-left:2px solid #333;" : "";
          const dd = d.byStore[s.code];
          if (!dd) {
            r += td("", `text-align:right;${bl}`) + td("") + td("");
          } else {
            r += tdNum(Math.round(dd.hours), FMT_INT, bl)
              + tdNum(Math.round(dd.sales), FMT_MONEY)
              + tdSplh(dd.splh, dd.ok);
          }
        });

        const w = s.wtd;
        r += tdNum(Math.round(w.hours), FMT_INT, "border-left:2px solid #333;background:" + TOT_BG + ";font-weight:bold;")
          + tdNum(Math.round(w.sales), FMT_MONEY, "background:" + TOT_BG + ";font-weight:bold;")
          + tdSplh(w.splh, w.ok)
          + tdNum(w.overUnder, FMT_INT, "background:" + TOT_BG + ";font-weight:bold;");

        rows += "<tr>" + r + "</tr>";
      });
    });
  });

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:x="urn:schemas-microsoft-com:office:excel" `
    + `xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8">`
    + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>`
    + `<x:Name>Week ${weekNumber}</x:Name>`
    + `<x:WorksheetOptions><x:FreezePanes/><x:SplitVerticalPane>1</x:SplitVerticalPane>`
    + `<x:SplitHorizontalPane>4</x:SplitHorizontalPane><x:ActivePane>0</x:ActivePane>`
    + `</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
    + `</head><body>`
    + `<table border="0" cellspacing="0" cellpadding="0">`
    + `<tr><td colspan="${TOTAL_COLS}" style="${FONT}font-size:13pt;font-weight:bold;padding:6px 4px">`
    + `SHIFT Labor Dashboard &mdash; Week ${weekNumber}, Period ${period}</td></tr>`
    + `<tr><td colspan="${TOTAL_COLS}" style="${FONT}font-size:9pt;font-style:italic;color:#555;`
    + `padding:0 4px 8px 4px">${weekStart} through ${weekEnd}</td></tr>`
    + `<tr>${bandRow}</tr><tr>${headRow}</tr>${rows}`
    + `</table></body></html>`;
}