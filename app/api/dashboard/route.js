import { buildDailyReport } from "@/lib/report";

// Umbral que separa critico de advertencia (0.15 = 15% abajo del target)
const CRITICAL_PCT = 0.15;

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function blendedWtd(rows) {
  let h = 0, s = 0;
  rows.forEach((r) => { h += r.wtd.hours; s += r.wtd.sales; });
  return h > 0 ? s / h : 0;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let isoDate = searchParams.get("date");
    if (!isoDate) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      isoDate = d.toISOString().slice(0, 10);
    }

    const current = await buildDailyReport(isoDate);

    // Mismo dia de la semana anterior. Comparar un WTD parcial contra
    // una semana completa daria un delta falso.
    const priorIso = addDays(isoDate, -7);
    let prior = null;
    try {
      prior = await buildDailyReport(priorIso);
    } catch (e) {
      prior = null;
    }

    // ── EXCEPCIONES ──
    const exceptions = [];

    current.rows.forEach((r) => {
      const base = { code: r.code, name: r.name, region: r.region };

      // Problemas de data, ya los detecta anomalyFlags
      (r.day.flags || []).forEach((f) => {
        exceptions.push({
          ...base,
          severity: "data",
          label: f,
          detail: `${r.day.hours}h · $${Math.round(r.day.sales).toLocaleString("en-US")}`,
        });
      });

      // Rendimiento medido con WTD, no con el dia suelto, porque a media
      // manana una tienda tiene pocas ventas y ya lleva horas acumuladas.
      const target = r.day.target;
      if (r.wtd.hours > 0 && target > 0) {
        const ratio = r.wtd.splh / target;
        const pct = Math.round((1 - ratio) * 100);
        if (ratio < 1 - CRITICAL_PCT) {
          exceptions.push({
            ...base,
            severity: "critical",
            label: `WTD SPLH $${r.wtd.splh} vs target $${target}`,
            detail: `${pct}% below target · ${Math.abs(r.wtd.overUnder)} hrs ${r.wtd.overUnder < 0 ? "over" : "under"}`,
          });
        } else if (ratio < 1) {
          exceptions.push({
            ...base,
            severity: "warning",
            label: `WTD SPLH $${r.wtd.splh} vs target $${target}`,
            detail: `${pct}% below target`,
          });
        }
      }
    });

    const order = { data: 0, critical: 1, warning: 2 };
    exceptions.sort((a, b) => order[a.severity] - order[b.severity]);

    const counts = {
      data: exceptions.filter((e) => e.severity === "data").length,
      critical: exceptions.filter((e) => e.severity === "critical").length,
      warning: exceptions.filter((e) => e.severity === "warning").length,
    };

    // ── TENDENCIA ──
    const priorByCode = {};
    if (prior) prior.rows.forEach((r) => { priorByCode[r.code] = r; });

    const trends = current.rows
      .map((r) => {
        const p = priorByCode[r.code];
        if (!p || !p.wtd.splh || !r.wtd.splh) return null;
        const delta = r.wtd.splh - p.wtd.splh;
        return {
          code: r.code,
          name: r.name,
          region: r.region,
          target: r.day.target,
          current: r.wtd.splh,
          prior: p.wtd.splh,
          delta,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.delta - b.delta);

    const curBlended = blendedWtd(current.rows);
    const priBlended = prior ? blendedWtd(prior.rows) : null;

    return Response.json({
      ok: true,
      date: isoDate,
      dayName: current.dayName,
      weekNum: current.weekNum,
      period: current.period,
      isLive: current.isLive,
      lastSyncAt: current.lastSyncAt,
      storeCount: current.rows.length,
      counts,
      exceptions,
      trend: {
        priorDate: prior ? priorIso : null,
        priorWeekNum: prior ? prior.weekNum : null,
        blendedCurrent: Math.round(curBlended),
        blendedPrior: priBlended !== null ? Math.round(priBlended) : null,
        blendedDelta: priBlended !== null ? Math.round(curBlended - priBlended) : null,
        declining: trends.filter((t) => t.delta < 0).slice(0, 5),
        improving: trends.filter((t) => t.delta > 0).slice(-5).reverse(),
        comparable: trends.length,
      },
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}