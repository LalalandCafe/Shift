// Generador de correo — portado EXACTO de genEmailHTML() en SHIFT.
// Mismos colores, misma fuente (Montserrat), misma estructura de tabla.

import { fmtOverUnder } from "./calc.js";

const DAY_HDR_BG = "#D0DFE6";
const DAY_HDR_TX = "#000000";
const REG_HDR_BG = "#0E2841";
const REG_HDR_TX = "#FFFFFF";
const COL_HDR_TX = "#000000";
const G_BG = "#C6EFCE", G_TX = "#276221"; // SPLH verde
const R_BG = "#FFC7CE", R_TX = "#9C0006"; // SPLH rojo
const BORDER = "1px solid #D0D0D0";
const FM = "font-family:'Montserrat',Arial,sans-serif;";
const FD = FM + "font-size:12pt;";
const FH = FM + "font-size:11pt;font-weight:700;";

function td(extra) { return `style="${FD}border:${BORDER};padding:2px 6px;vertical-align:middle;${extra}"`; }
function tdR(extra) { return td("text-align:right;white-space:nowrap;" + extra); }
function thCol(txt, extra) {
  return `<td style="${FH}border:${BORDER};padding:3px 6px;text-align:right;text-decoration:underline;white-space:nowrap;vertical-align:bottom;color:${COL_HDR_TX};${extra || ""}">${txt}</td>`;
}

/**
 * Genera el correo HTML.
 * params:
 *  - day: nombre del dia (ej "Sunday") o null si es full week
 *  - weekNumber, refDate: info de la semana
 *  - groupedStores: [{ group, regions: [{ label, stores: [{ code, name, day: {...}, wtd: {...}, ptd: {...} }] }] }]
 *  - isFullWeek: bool
 *  - hasPTD: bool
 */
export function generateEmailHTML({ day, weekNumber, refDate, groupedStores, isFullWeek, hasPTD, acNote }) {
  const dayLabel = isFullWeek ? "the <b>full week</b>" : `<b>${day}</b>`;

  let tRows = "";
  groupedStores.forEach((group) => {
    group.regions.forEach((regObj) => {
      if (!regObj.stores.length) return;
      tRows += `<tr><td colspan="${hasPTD ? 16 : 13}" style="${FH}background:${REG_HDR_BG};color:${REG_HDR_TX};padding:4px 6px;border:${BORDER}">${regObj.label}</td></tr>`;
      regObj.stores.forEach((s) => {
        const d = s.day, w = s.wtd, p = s.ptd;
        tRows += "<tr>"
          + `<td ${td("min-width:175px;white-space:nowrap;")}>${s.name}</td>`
          + `<td ${tdR("")}>${Math.round(d.hours)}</td>`
          + `<td ${tdR("")}>${d.sales > 0 ? "$" + Math.round(d.sales).toLocaleString("en-US") : "$0"}</td>`
          + `<td ${tdR("")}>$${d.target}</td>`
          + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;background:${d.ok ? G_BG : R_BG};color:${d.ok ? G_TX : R_TX};font-weight:700;white-space:nowrap">$${Math.round(d.splh)}</td>`
          + `<td ${tdR("")}>${fmtOverUnder(d.overUnder)}</td>`
          + `<td ${tdR("border-left:2px solid #999;")}>${Math.round(w.hours)}</td>`
          + `<td ${tdR("")}>${w.sales > 0 ? "$" + Math.round(w.sales).toLocaleString("en-US") : "$0"}</td>`
          + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;background:${w.ok ? G_BG : R_BG};color:${w.ok ? G_TX : R_TX};font-weight:700;white-space:nowrap">$${Math.round(w.splh)}</td>`
          + `<td ${tdR("")}>${fmtOverUnder(w.overUnder)}</td>`
          + `<td ${tdR("border-left:2px solid #999;")}>${Math.round(w.trainTotal) > 0 ? Math.round(w.trainTotal) : "-"}</td>`
          + `<td ${tdR("")}>${Math.round(w.trainee) > 0 ? Math.round(w.trainee) : "-"}</td>`
          + `<td ${tdR("")}>${Math.round(w.trainer) > 0 ? Math.round(w.trainer) : "-"}</td>`;
        if (hasPTD) {
          if (!p || p.empty) {
            tRows += `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;color:#bbb;border-left:2px solid #999">—</td>`
              + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;color:#bbb">—</td>`
              + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;color:#bbb">—</td>`;
          } else {
            tRows += `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;border-left:2px solid #999;white-space:nowrap">${Math.round(p.hours).toLocaleString("en-US")}</td>`
              + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;white-space:nowrap">$${Math.round(p.sales).toLocaleString("en-US")}</td>`
              + `<td style="${FD}border:${BORDER};padding:2px 6px;text-align:right;background:${p.ok ? G_BG : R_BG};color:${p.ok ? G_TX : R_TX};font-weight:700;white-space:nowrap">$${Math.round(p.splh)}</td>`;
          }
        }
        tRows += "</tr>";
      });
    });
  });

  const tableHtml = `<table style="border-collapse:collapse;${FM}">`
    + "<tr>"
    + `<td style="${FH}border:${BORDER};padding:4px 6px;"></td>`
    + `<td colspan="5" style="${FH}border:${BORDER};background:${DAY_HDR_BG};color:${DAY_HDR_TX};text-align:center;padding:4px 8px;">${isFullWeek ? "Full Week" : day}</td>`
    + `<td colspan="4" style="${FH}border:${BORDER};background:${DAY_HDR_BG};color:${DAY_HDR_TX};text-align:center;padding:4px 8px;border-left:2px solid #999">WTD Summary</td>`
    + `<td colspan="3" style="${FH}border:${BORDER};background:${DAY_HDR_BG};color:${DAY_HDR_TX};text-align:center;padding:4px 8px;border-left:2px solid #999">Training</td>`
    + (hasPTD ? `<td colspan="3" style="${FH}border:${BORDER};background:${DAY_HDR_BG};color:${DAY_HDR_TX};text-align:center;padding:4px 8px;border-left:2px solid #999">PTD Summary</td>` : "")
    + "</tr>"
    + "<tr>"
    + `<td style="${FH}border:${BORDER};padding:3px 6px;text-decoration:underline;color:${COL_HDR_TX}">Location Name</td>`
    + thCol("Hours Worked") + thCol("Gross Sales") + thCol("Target") + thCol("SPLH") + thCol("Hours (Over) /<br>Under")
    + thCol("WTD Hours<br>Worked", "border-left:2px solid #999;") + thCol("WTD Gross<br>Sales") + thCol("WTD SPLH") + thCol("Hours (Over) /<br>Under")
    + thCol("Total Training<br>Hours", "border-left:2px solid #999;") + thCol("Trainee<br>Hours") + thCol("Trainer<br>Hours")
    + (hasPTD ? thCol("PTD Hours<br>Worked", "border-left:2px solid #999;") + thCol("PTD Gross<br>Sales") + thCol("PTD SPLH") : "")
    + "</tr>"
    + tRows
    + "</table>";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">`
    + `<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="${FD}color:#000;margin:0;padding:16px;max-width:900px">`
    + `<p style="${FD}margin:0 0 10px 0">Hello all,</p>`
    + `<p style="${FD}margin:0 0 16px 0">Welcome to Week ${weekNumber}! See below for the updated labor dashboard for ${dayLabel} and for the <b>full week</b>.${acNote || ""} Let me know if you have any questions!</p>`
    + `<p style="${FH}margin:0 0 2px 0">Week to Date (WTD) Labor Dashboard</p>`
    + `<p style="${FM}font-size:10pt;font-style:italic;color:#444;margin:0 0 12px 0">Week ${weekNumber} | ${isFullWeek ? "Full Week" : day}, ${refDate}</p>`
    + `<div style="overflow-x:auto">${tableHtml}</div>`
    + `</body></html>`;
}
