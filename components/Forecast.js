"use client";

import { useState, useEffect } from "react";

function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dn - 1));
  return d.toISOString().slice(0, 10);
}

function shiftWeek(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

// Oro de marca para el volumen, porque una hora ocupada no es buena ni mala,
// solo es ocupada. El rojo se reserva para lo unico que si es un problema:
// pasarse del cupo fisico de la tienda.
const GOLD = "212, 160, 23";
const RED = "#9c0006";
const INK = "#2b2d31";

function nextHourLabel(hour) {
  const h = (hour + 1) % 24;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + suffix;
}

// Paso del eje Y. Sin esto una tienda chica sale con lineas cada 1 y una
// grande con 24 lineas encimadas.
function axisStep(max) {
  if (max <= 6) return 1;
  if (max <= 12) return 2;
  if (max <= 30) return 5;
  return 10;
}

/* ------------------------------------------------------------------ */
/* Mapa de calor de la semana                                          */
/* ------------------------------------------------------------------ */

function BusiestHours({ hourly, selected, onPick }) {
  const { busiest, openFrom, openTo, maxStaffCapacity } = hourly;
  const days = hourly.days.filter((d) => d.hasCurve);
  if (!days.length || !busiest.peakStaff) return null;

  const hours = [];
  for (let h = openFrom; h <= openTo; h++) hours.push(h);

  const byHourPeak = busiest.byHour.reduce((a, x) => Math.max(a, x.staff), 0);

  return (
    <div className="tcard" style={{ marginBottom: 16 }}>
      <div className="thead">
        <span className="ttl">Busiest hours</span>
        {maxStaffCapacity && (
          <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
            capacity {maxStaffCapacity}
          </span>
        )}
      </div>

      <div style={{ padding: "14px 14px 6px" }}>
        {busiest.window && (
          <div style={{ fontSize: 14.5, fontWeight: 600, color: INK, lineHeight: 1.45, marginBottom: 4 }}>
            Your week peaks {busiest.window.dayName} {busiest.window.fromLabel} to{" "}
            {busiest.window.toLabel} with {busiest.window.staff} on the floor.
          </div>
        )}
        {busiest.cells.length > 1 && (
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 14 }}>
            After that: {busiest.cells.slice(1).map((c) => `${c.shortDay} ${c.label} (${c.staff})`).join(", ")}.
          </div>
        )}

        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <div style={{ minWidth: hours.length * 26 + 40 }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 4, paddingLeft: 40 }}>
              {hours.map((h) => (
                <div key={h} style={{ flex: 1, textAlign: "center", fontSize: 8.5, color: "var(--text3)" }}>
                  {h % 3 === 0 ? (h % 12 === 0 ? 12 : h % 12) : ""}
                </div>
              ))}
            </div>

            {days.map((d) => (
              <div key={d.date} style={{ display: "flex", gap: 3, marginBottom: 3, alignItems: "center" }}>
                <div style={{ width: 37, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--text2)" }}>
                  {d.shortDay}
                </div>
                {hours.map((h) => {
                  const cell = d.hours[h];
                  const staff = cell ? cell.staff : 0;
                  const isSel = selected && selected.date === d.date && selected.hour === h;
                  const alpha = staff > 0 ? 0.12 + (staff / busiest.peakStaff) * 0.88 : 0;
                  return (
                    <button
                      key={h}
                      onClick={() => onPick(d.date, h)}
                      title={`${d.shortDay} ${cell ? cell.label : ""} · ${staff} on the floor`}
                      aria-label={`${d.dayName} ${cell ? cell.label : ""}, ${staff} on the floor`}
                      style={{
                        flex: 1, height: 22, minWidth: 20, padding: 0, cursor: "pointer",
                        borderRadius: 4, fontFamily: "inherit",
                        fontSize: 9, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                        color: staff > 0 && alpha > 0.55 ? "#fff" : "var(--text2)",
                        background: cell && cell.overCapacity ? RED : staff > 0 ? `rgba(${GOLD}, ${alpha})` : "var(--border)",
                        border: isSel ? `2px solid ${INK}` : "1.5px solid transparent",
                      }}
                    >
                      {staff > 0 ? staff : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text2)", marginBottom: 7 }}>
            Across the whole week
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34 }}>
            {hours.map((h) => {
              const x = busiest.byHour[h];
              const height = byHourPeak > 0 ? Math.max(2, (x.staff / byHourPeak) * 34) : 2;
              return (
                <div
                  key={h}
                  title={`${x.label} · ${x.staff} hours across the week`}
                  style={{ flex: 1, height, background: `rgba(${GOLD}, 0.55)`, borderRadius: "2px 2px 0 0" }}
                />
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8, lineHeight: 1.55 }}>
            Day in and day out the floor is fullest around{" "}
            <strong style={{ color: "var(--text2)" }}>
              {busiest.byHour.reduce((a, x) => (x.staff > a.staff ? x : a), busiest.byHour[0]).label}
            </strong>
            . Tap any square to open that day.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Curva de un dia                                                     */
/* ------------------------------------------------------------------ */

const CHART_H = 132;
const GUTTER = 26;

function HourlyCurve({ day, maxStaffCapacity, openFrom, openTo, selectedHour, onPick }) {
  if (!day.hasCurve) {
    return (
      <div style={{ padding: "16px 14px 20px", fontSize: 12, color: "var(--text3)" }}>
        No hourly history for this weekday yet. It shows up here once the sync has
        covered at least one {day.dayName}.
      </div>
    );
  }

  const hours = day.hours.filter((h) => h.hour >= openFrom && h.hour <= openTo);
  const peak = hours.reduce((a, h) => Math.max(a, h.staff), 0);
  const top = Math.max(peak, maxStaffCapacity || 0, 1);
  const step = axisStep(top);
  const total = hours.reduce((a, h) => a + h.staff, 0);

  const ticks = [];
  for (let v = step; v <= top; v += step) ticks.push(v);

  const sel = selectedHour !== null && selectedHour !== undefined
    ? day.hours[selectedHour]
    : null;

  return (
    <div style={{ padding: "12px 14px 18px" }}>
      {/* Lector fijo. Reemplaza al tooltip: no tapa nada y funciona igual
          con dedo que con mouse. */}
      <div
        style={{
          minHeight: 34, marginBottom: 10, paddingBottom: 9,
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
        }}
        aria-live="polite"
      >
        {sel ? (
          <>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: sel.overCapacity ? RED : INK }}>
              {sel.label} to {nextHourLabel(sel.hour)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: sel.overCapacity ? RED : "var(--text2)" }}>
              {sel.staff} on the floor
            </span>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              ${sel.expectedSales.toLocaleString("en-US")} expected
              {sel.expectedTransactions > 0 && ` · about ${sel.expectedTransactions} orders`}
            </span>
            {sel.overCapacity && (
              <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>
                over your {maxStaffCapacity} person capacity
              </span>
            )}
          </>
        ) : day.peakWindow ? (
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            Heaviest stretch is{" "}
            <strong>{day.peakWindow.fromLabel} to {day.peakWindow.toLabel}</strong>, about{" "}
            {day.peakWindow.staff} hours of the {day.allowedHours}. Tap a bar for detail.
          </span>
        ) : null}
      </div>

      <div style={{ position: "relative", height: CHART_H, marginBottom: 4 }}>
        {ticks.map((v) => (
          <div
            key={v}
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, right: 0, bottom: (v / top) * CHART_H,
              borderTop: "1px solid var(--border)", pointerEvents: "none",
            }}
          >
            <span style={{ position: "absolute", left: 0, bottom: 1, fontSize: 8.5, color: "var(--text3)" }}>
              {v}
            </span>
          </div>
        ))}

        {maxStaffCapacity && maxStaffCapacity <= top && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, right: 0,
              bottom: (maxStaffCapacity / top) * CHART_H,
              borderTop: `1.5px dashed ${RED}`, opacity: 0.5, pointerEvents: "none",
            }}
          />
        )}

        <div style={{ position: "absolute", left: GUTTER, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "flex-end", gap: 3 }}>
          {hours.map((h) => {
            const isSel = selectedHour === h.hour;
            const isPeak = h.staff === peak && peak > 0;
            const height = Math.max(2, (h.staff / top) * CHART_H);
            const alpha = isSel ? 1 : isPeak ? 0.92 : 0.62;
            return (
              <button
                key={h.hour}
                onClick={() => onPick(day.date, isSel ? null : h.hour)}
                aria-pressed={isSel}
                aria-label={`${h.label}, ${h.staff} on the floor, $${h.expectedSales} expected`}
                style={{
                  flex: 1, height: "100%", padding: 0, border: "none", background: "none",
                  cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "flex-end",
                  alignItems: "center", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 700, marginBottom: 2, fontVariantNumeric: "tabular-nums", color: h.overCapacity ? RED : isSel ? INK : "var(--text3)" }}>
                  {h.staff > 0 ? h.staff : ""}
                </span>
                <span
                  style={{
                    width: "100%", height,
                    background: h.overCapacity ? RED : `rgba(${GOLD}, ${alpha})`,
                    borderRadius: "3px 3px 0 0",
                    outline: isSel ? `2px solid ${INK}` : "none",
                    outlineOffset: -2,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 3, marginBottom: 12, paddingLeft: GUTTER }}>
        {hours.map((h) => (
          <div key={h.hour} style={{ flex: 1, textAlign: "center", fontSize: 8.5, color: "var(--text3)", letterSpacing: "-0.02em" }}>
            {h.hour % 2 === 0 ? h.label : ""}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11.5, color: "var(--text3)", lineHeight: 1.55 }}>
        <span>
          Adds up to <strong style={{ color: "var(--text2)" }}>{total} hours</strong>, the same
          number in the Hours column.
        </span>
        {maxStaffCapacity && <span>Dashed line is your {maxStaffCapacity} person capacity.</span>}
        {day.hourlyDays < day.samples && (
          <span>Shape built from {day.hourlyDays} of {day.samples} matching days.</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Forecast({ storeCode, storeName }) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return shiftWeek(mondayOf(today), 1);
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [plan, setPlan] = useState({});
  const [saveState, setSaveState] = useState("idle");
  const [deleting, setDeleting] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [hourly, setHourly] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [selected, setSelected] = useState(null); // { date, hour }

  function loadData() {
    setLoading(true);
    setErr(null);
    setSaveState("idle");
    setConfirmClear(false);
    return fetch(`/api/forecast?store=${storeCode}&weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setErr(d.error); setData(null); }
        else {
          setData(d);
          const p = {};
          d.days.forEach((day) => {
            p[day.date] = day.plannedHours !== null ? String(day.plannedHours) : "";
          });
          setPlan(p);
        }
        setLoading(false);
      })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  }

  // La curva se pide en paralelo con el pronostico, no al abrir un dia: el
  // mapa de calor vive arriba y se ve antes de que nadie expanda nada. Si
  // falla, el planeador sigue funcionando sin el.
  function loadHourly() {
    setHourly(null);
    return fetch(`/api/forecast/hourly?store=${storeCode}&weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setHourly(d); })
      .catch(() => {});
  }

  useEffect(() => {
    if (!storeCode) return;
    setOpenDay(null);
    setSelected(null);
    loadData();
    loadHourly();
  }, [storeCode, weekStart]);

  // Un click en el mapa de calor abre el dia y marca la hora. Los dos
  // niveles quedan conectados en vez de ser dos widgets sueltos.
  function pickCell(date, hour) {
    setOpenDay(date);
    setSelected(hour === null ? null : { date, hour });
  }

  function toggleDay(date) {
    const next = openDay === date ? null : date;
    setOpenDay(next);
    if (!next) setSelected(null);
  }

  function setDay(date, value) {
    setPlan((prev) => ({ ...prev, [date]: value }));
    setSaveState("idle");
  }

  function useAllowed() {
    if (!data) return;
    const p = {};
    data.days.forEach((d) => {
      p[d.date] = d.hasForecast ? String(d.allowedHours) : "";
    });
    setPlan(p);
    setSaveState("idle");
  }

  async function savePlan() {
    if (!data) return;
    const days = Object.keys(plan)
      .filter((date) => plan[date] !== "" && plan[date] !== null)
      .map((date) => ({ date, plannedHours: Number(plan[date]) }));

    if (!days.length) return;

    setSaveState("saving");
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeCode, days }),
      });
      const j = await res.json();
      if (!j.ok) { setSaveState("error"); return; }
      setSaveState("saved");
      const r = await fetch(`/api/forecast?store=${storeCode}&weekStart=${weekStart}`);
      const fresh = await r.json();
      if (fresh.ok) setData(fresh);
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setSaveState("error");
    }
  }

  // Borra un dia guardado. Distinto a dejar el campo vacio, que solo
  // lo ignora al guardar sin quitar lo que ya estaba en la base.
  async function deleteDay(date) {
    setDeleting(date);
    try {
      const res = await fetch(`/api/forecast?store=${storeCode}&date=${date}`, { method: "DELETE" });
      const j = await res.json();
      if (j.ok) {
        setPlan((prev) => ({ ...prev, [date]: "" }));
        await loadData();
      }
    } catch (e) {
      // silencioso, el usuario puede reintentar
    }
    setDeleting(null);
  }

  async function clearWeek() {
    setDeleting("week");
    try {
      const res = await fetch(`/api/forecast?store=${storeCode}&weekStart=${weekStart}`, { method: "DELETE" });
      const j = await res.json();
      if (j.ok) await loadData();
    } catch (e) {
      // silencioso
    }
    setDeleting(null);
  }

  // Totales en vivo mientras escriben, sin esperar a guardar
  const livePlanned = Object.keys(plan).reduce((a, k) => {
    const n = Number(plan[k]);
    return isFinite(n) ? a + n : a;
  }, 0);

  const nav = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <button
        onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
        style={{ padding: "8px 13px", borderRadius: 8, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}
      >
        ← Prev
      </button>
      <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 168, textAlign: "center" }}>
        {data ? `${prettyDate(data.weekStart)} – ${prettyDate(data.weekEnd)}` : "…"}
      </div>
      <button
        onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
        style={{ padding: "8px 13px", borderRadius: 8, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}
      >
        Next →
      </button>
      <button
        onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          setWeekStart(shiftWeek(mondayOf(today), 1));
        }}
        style={{ padding: "8px 13px", borderRadius: 8, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, color: "var(--text2)" }}
      >
        Next week
      </button>
    </div>
  );

  if (loading && !data) return <>{nav}<div className="empty">Loading forecast...</div></>;
  if (err) return <>{nav}<div className="empty">Error: {err}</div></>;
  if (!data) return <>{nav}<div className="empty">No forecast available.</div></>;

  const v = data.planVerdict;
  const t = data.totals;
  const liveVar = Math.round(livePlanned - t.allowedHours);
  const anySaved = data.days.some((d) => d.plannedHours !== null);
  const hourlyByDate = {};
  if (hourly) hourly.days.forEach((d) => { hourlyByDate[d.date] = d; });

  return (
    <>
      {nav}

      <div className={"fc-hero " + v.type}>
        <div className="fc-eyebrow">
          Schedule planner &middot; {data.store.name}
        </div>
        <div className="fc-head">{v.headline}</div>
        <div className="fc-detail">{v.detail}</div>
      </div>

      {t.daysWithForecast === 0 ? (
        <div className="tcard">
          <div className="empty" style={{ padding: 34 }}>
            No sales history for these weekdays yet. The forecast needs at least one prior week.
          </div>
        </div>
      ) : (
        <>
          <div className="mc-grid">
            <div className="mc">
              <div className="mc-l">Expected sales</div>
              <div className="mc-v" style={{ fontSize: 30 }}>
                ${t.expectedSales.toLocaleString("en-US")}
              </div>
              <div className="mc-s">average of last {data.lookbackWeeks} same weekdays</div>
            </div>
            <div className="mc">
              <div className="mc-l">Hours you can use</div>
              <div className="mc-v" style={{ fontSize: 30 }}>{t.allowedHours}</div>
              <div className="mc-s">expected sales ÷ daily target</div>
            </div>
            <div className="mc">
              <div className="mc-l">You planned</div>
              <div className="mc-v" style={{ fontSize: 30, color: livePlanned === 0 ? "var(--text3)" : liveVar > 0 ? "#9c0006" : "#1a6630" }}>
                {livePlanned > 0 ? Math.round(livePlanned) : "—"}
              </div>
              <div className="mc-s">
                {livePlanned > 0
                  ? (liveVar > 0 ? `${liveVar} hours over` : liveVar < 0 ? `${Math.abs(liveVar)} hours under` : "right on budget")
                  : "enter your schedule below"}
              </div>
            </div>
          </div>

          {hourly && (
            <BusiestHours hourly={hourly} selected={selected} onPick={pickCell} />
          )}

          <div className="tcard">
            <div className="thead">
              <span className="ttl">Day by day</span>
              <div style={{ display: "flex", gap: 7 }}>
                <button
                  onClick={useAllowed}
                  style={{ padding: "6px 13px", borderRadius: 7, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--text2)" }}
                >
                  Fill with suggested
                </button>
                {anySaved && (
                  confirmClear ? (
                    <>
                      <button
                        onClick={clearWeek}
                        disabled={deleting === "week"}
                        style={{ padding: "6px 13px", borderRadius: 7, border: "1.5px solid #9c0006", background: "#9c0006", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700 }}
                      >
                        {deleting === "week" ? "Clearing..." : "Yes, clear week"}
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        style={{ padding: "6px 11px", borderRadius: 7, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, color: "var(--text2)" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      style={{ padding: "6px 13px", borderRadius: 7, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "#9c0006" }}
                    >
                      Clear week
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="fc-row head">
              <div className="fc-lbl">Day</div>
              <div className="fc-lbl">Expected sales</div>
              <div className="fc-lbl" style={{ textAlign: "right" }}>Hours</div>
              <div className="fc-lbl" style={{ textAlign: "right" }}>Your plan</div>
              <div className="fc-lbl fc-var-col" style={{ textAlign: "right" }}>Diff</div>
            </div>

            {data.days.map((d) => {
              const val = plan[d.date] ?? "";
              const n = Number(val);
              const diff = val !== "" && isFinite(n) ? Math.round(n - d.allowedHours) : null;
              const isSaved = d.plannedHours !== null;
              const isOpen = openDay === d.date;
              const curve = hourlyByDate[d.date];

              return (
                <div key={d.date}>
                  <div className="fc-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {d.hasForecast && (
                        <button
                          onClick={() => toggleDay(d.date)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Hide hour by hour for ${d.dayName}` : `Show hour by hour for ${d.dayName}`}
                          style={{
                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                            border: "1.5px solid var(--border2)", background: isOpen ? "var(--border2)" : "#fff",
                            color: "var(--text2)", cursor: "pointer", fontFamily: "inherit",
                            fontSize: 9, lineHeight: 1, padding: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      )}
                      <div>
                        <div className="fc-day">{d.shortDay}</div>
                        <div style={{ fontSize: 9.5, color: "var(--text3)" }}>{prettyDate(d.date)}</div>
                      </div>
                    </div>
                    <div>
                      {d.hasForecast ? (
                        <>
                          <div className="fc-sales">
                            <span className={"fc-conf " + d.confidence} title={d.confidenceLabel} />
                            ${d.expectedSales.toLocaleString("en-US")}
                          </div>
                          <div className="fc-range">
                            ${d.minSales.toLocaleString("en-US")} – ${d.maxSales.toLocaleString("en-US")} · target ${d.target}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text3)" }}>No history</div>
                      )}
                    </div>
                    <div className="fc-allowed">
                      {d.hasForecast ? d.allowedHours : "—"}
                    </div>
                    <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                      <input
                        className="fc-input"
                        type="number"
                        min="0"
                        step="1"
                        value={val}
                        placeholder="—"
                        onChange={(e) => setDay(d.date, e.target.value)}
                      />
                      {isSaved && (
                        <button
                          onClick={() => deleteDay(d.date)}
                          disabled={deleting === d.date}
                          title="Remove this day from the saved plan"
                          style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            border: "1.5px solid var(--border2)", background: "#fff",
                            color: "#9c0006", cursor: "pointer", fontFamily: "inherit",
                            fontSize: 13, lineHeight: 1, padding: 0,
                          }}
                        >
                          {deleting === d.date ? "·" : "×"}
                        </button>
                      )}
                    </div>
                    <div
                      className="fc-var fc-var-col"
                      style={{ color: diff === null ? "var(--text3)" : diff > 0 ? "#9c0006" : diff < 0 ? "#1a6630" : "var(--text2)" }}
                    >
                      {diff === null ? "—" : diff > 0 ? "+" + diff : diff}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg2, #fafafa)" }}>
                      {!hourly && (
                        <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--text3)" }}>
                          Loading hour by hour...
                        </div>
                      )}
                      {hourly && curve && (
                        <HourlyCurve
                          day={curve}
                          maxStaffCapacity={hourly.maxStaffCapacity}
                          openFrom={hourly.openFrom}
                          openTo={hourly.openTo}
                          selectedHour={selected && selected.date === d.date ? selected.hour : null}
                          onPick={pickCell}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="fc-row total">
              <div className="fc-day">Week</div>
              <div className="fc-sales">${t.expectedSales.toLocaleString("en-US")}</div>
              <div className="fc-allowed">{t.allowedHours}</div>
              <div style={{ textAlign: "right", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                {livePlanned > 0 ? Math.round(livePlanned) : "—"}
              </div>
              <div
                className="fc-var fc-var-col"
                style={{ color: livePlanned === 0 ? "var(--text3)" : liveVar > 0 ? "#9c0006" : "#1a6630" }}
              >
                {livePlanned === 0 ? "—" : liveVar > 0 ? "+" + liveVar : liveVar}
              </div>
            </div>

            <div style={{ padding: "15px 14px", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
              <button
                className={"fc-save" + (saveState === "saved" ? " saved" : "")}
                onClick={savePlan}
                disabled={saveState === "saving" || livePlanned === 0}
              >
                {saveState === "saving" ? "Saving..." : saveState === "saved" ? "✓ Saved" : "Save schedule"}
              </button>
              {saveState === "error" && (
                <span style={{ color: "#9c0006", fontSize: 12.5 }}>Could not save. Try again.</span>
              )}
              {data.lastPlanUpdate && saveState === "idle" && (
                <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
                  Last saved {new Date(data.lastPlanUpdate).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 14, lineHeight: 1.6, maxWidth: 700 }}>
            <strong style={{ color: "var(--text2)" }}>How this works.</strong> Expected sales are the average of
            that same weekday over the last {data.lookbackWeeks} weeks ({data.historyFrom} to {data.historyTo}).
            Hours you can use is expected sales divided by that day's target, so hitting those hours keeps you at
            target. The dot next to each number shows how consistent that weekday has been: green is steady,
            amber swings some, gray means treat it as a rough guide. Weather, paydays, and local events are not
            factored in, so use the range as your guardrails rather than the single number.
            The × next to a saved day removes it from the plan entirely, which is different from just clearing
            the box.
          </div>

          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 10, lineHeight: 1.6, maxWidth: 700 }}>
            <strong style={{ color: "var(--text2)" }}>Hour by hour.</strong> The split follows the share of sales
            each hour earned on those same matching weekdays, so the bars always add up to the hours in that day's
            row. Darker squares in the heatmap are heavier hours. Bars and squares turn red where the suggestion
            runs past your capacity, which is a signal to move volume to a neighboring hour or accept the wait,
            not a number to quietly cut.
          </div>
        </>
      )}
    </>
  );
}