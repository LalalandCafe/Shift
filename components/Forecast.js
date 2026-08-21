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

// Una sola barra amarilla para todas las horas. El color ya no codifica
// nada, asi que la ALTURA carga toda la informacion, que es la lectura mas
// honesta de una grafica de barras. El rojo queda libre para lo unico que
// de verdad es una alerta: pasarse del cupo de la tienda.
const BAR = "#fff7d2";
const BAR_EDGE = "rgba(212, 160, 23, 0.45)";
const RED = "#9c0006";
const GREEN = "#1a6630";
const INK = "#2b2d31";

const CHART_H = 150;
const GUTTER = 58;   // ancho del eje y de las etiquetas de fila
const COL_MIN = 50;  // ancho minimo por hora, para que quepa $1,208

// Cortes redondos para el eje. Se apunta a 5 divisiones: menos deja el eje
// pobre, mas lo satura. El tope se estira al siguiente corte para que la
// barra mas alta no toque el techo.
function niceStep(rough) {
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  let s;
  if (n <= 1) s = 1;
  else if (n <= 2) s = 2;
  else if (n <= 2.5) s = 2.5;
  else if (n <= 5) s = 5;
  else s = 10;
  return s * mag;
}

function buildAxis(max) {
  if (!(max > 0)) return { top: 1, ticks: [] };
  const step = niceStep(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = step; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

function money(v) {
  return "$" + Math.round(v).toLocaleString("en-US");
}

function HourlyCurve({ day, maxStaffCapacity, openFrom, openTo }) {
  const [picked, setPicked] = useState(null);

  if (!day.hasCurve) {
    return (
      <div style={{ padding: "16px 14px 20px", fontSize: 12.5, color: "var(--text3)" }}>
        No hourly history for this weekday yet. It shows up here once the sync has
        covered at least one {day.dayName}.
      </div>
    );
  }

  const hours = day.hours.filter((h) => h.hour >= openFrom && h.hour <= openTo);
  const sel = picked === null ? null : day.hours[picked];
  const gridMin = GUTTER + hours.length * COL_MIN;

  // Las barras miden VENTA, no personal. El personal viene de dividir la
  // venta entre el target y redondear a entero, asi que si las barras se
  // escalaran con el, las alturas no cuadrarian contra un eje en dolares.
  const maxSales = hours.reduce((a, h) => Math.max(a, h.expectedSales), 0);
  const axis = buildAxis(maxSales);

  const cell = { flex: 1, minWidth: COL_MIN, textAlign: "center" };
  const rowLabel = {
    width: GUTTER, flexShrink: 0, fontSize: 10, fontWeight: 700,
    color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.03em",
  };

  return (
    <div style={{ padding: "14px 14px 18px" }}>
      {/* Una sola frase, y dice que hacer. Si el gerente solo lee esto y
          cierra la fila, ya se llevo lo importante. */}
      <div style={{ minHeight: 40, marginBottom: 12 }} aria-live="polite">
        {sel ? (
          <>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>
              {sel.label} to {sel.endLabel} · {sel.staff} {sel.staff === 1 ? "person" : "people"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>
              about {money(sel.expectedSales)}
              {sel.expectedTransactions > 0 && ` and ${sel.expectedTransactions} orders`}
              {sel.overCapacity && maxStaffCapacity
                ? ` · past your ${maxStaffCapacity} person capacity`
                : ""}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>
              {day.peakWindow
                ? `Your rush is ${day.peakWindow.fromLabel} to ${day.peakWindow.toLabel}.`
                : `${day.allowedHours} hours to spread across the day.`}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>
              {day.peakWindow && `Put ${day.peakWindow.staff} of your ${day.allowedHours} hours there. `}
              {day.calmsAtLabel && `It calms down after ${day.calmsAtLabel}. `}
              Tap a bar for any hour.
            </div>
          </>
        )}
      </div>

      {/* Un solo contenedor con scroll para eje, grafica y tabla, para que
          las columnas nunca se desalineen entre si en pantallas angostas. */}
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ minWidth: gridMin }}>

          <div style={{ position: "relative", height: CHART_H }}>
            {axis.ticks.map((v) => (
              <div
                key={v}
                aria-hidden="true"
                style={{
                  position: "absolute", left: 0, right: 0,
                  bottom: (v / axis.top) * CHART_H,
                  borderTop: "1px solid var(--border)", pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute", left: 0, bottom: 2, width: GUTTER - 8,
                    textAlign: "right", fontSize: 9.5, color: "var(--text3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {money(v)}
                </span>
              </div>
            ))}

            <div style={{ position: "absolute", left: GUTTER, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "flex-end" }}>
              {hours.map((h) => {
                const isSel = picked === h.hour;
                const height = h.expectedSales > 0
                  ? Math.max(3, (h.expectedSales / axis.top) * CHART_H)
                  : 0;
                return (
                  <div key={h.hour} style={{ flex: 1, minWidth: COL_MIN, height: "100%", padding: "0 3px", boxSizing: "border-box" }}>
                    <button
                      onClick={() => setPicked(isSel ? null : h.hour)}
                      aria-pressed={isSel}
                      aria-label={`${h.label}, ${h.staff} people, ${money(h.expectedSales)} expected`}
                      style={{
                        width: "100%", height: "100%", padding: 0, border: "none", background: "none",
                        cursor: "pointer", fontFamily: "inherit",
                        display: "flex", flexDirection: "column", justifyContent: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          width: "100%", height,
                          background: BAR,
                          borderRadius: "4px 4px 0 0",
                          border: isSel
                            ? `2px solid ${INK}`
                            : h.overCapacity
                              ? `2px solid ${RED}`
                              : `1.5px solid ${BAR_EDGE}`,
                          borderBottom: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", borderTop: "1.5px solid var(--border2)", paddingTop: 6 }}>
            <div style={rowLabel} />
            {hours.map((h) => (
              <div key={h.hour} style={{ ...cell, fontSize: 10, fontWeight: 700, color: "var(--text2)" }}>
                {h.label}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 7 }}>
            <div style={rowLabel}>Sales</div>
            {hours.map((h) => (
              <div key={h.hour} style={{ ...cell, fontSize: 10.5, color: "var(--text2)", fontVariantNumeric: "tabular-nums" }}>
                {h.expectedSales > 0 ? money(h.expectedSales) : "—"}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 5 }}>
            <div style={rowLabel}>Staff</div>
            {hours.map((h) => (
              <div
                key={h.hour}
                style={{
                  ...cell, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: h.overCapacity ? RED : picked === h.hour ? INK : "var(--text)",
                }}
              >
                {h.staff > 0 ? h.staff : "—"}
              </div>
            ))}
          </div>

        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, fontSize: 11.5, color: "var(--text3)", lineHeight: 1.55 }}>
        <span>
          Adds up to <strong style={{ color: GREEN }}>{day.allowedHours} hours</strong>, the same
          number in the Hours column.
        </span>
        {day.overCapacityHours.length > 0 && (
          <span>
            <strong style={{ color: RED }}>Over capacity</strong> at {day.overCapacityHours.join(", ")}.
          </span>
        )}
        {day.hourlyDays < day.samples && (
          <span>Built from {day.hourlyDays} of {day.samples} matching days.</span>
        )}
      </div>
    </div>
  );
}

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

  const [openDay, setOpenDay] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyErr, setHourlyErr] = useState(null);

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

  useEffect(() => {
    if (!storeCode) return;
    // La curva pertenece a una tienda y una semana. Al cambiar cualquiera
    // de las dos se tira, si no el gerente veria la grafica de la semana
    // anterior debajo de los numeros de la nueva.
    setOpenDay(null);
    setHourly(null);
    setHourlyErr(null);
    loadData();
  }, [storeCode, weekStart]);

  // Se pide una sola vez, al abrir el primer dia. Quien nunca expande una
  // fila no paga la consulta.
  function toggleDay(date) {
    const next = openDay === date ? null : date;
    setOpenDay(next);
    if (!next || hourly || hourlyLoading) return;

    setHourlyLoading(true);
    setHourlyErr(null);
    fetch(`/api/forecast/hourly?store=${storeCode}&weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setHourlyErr(d.error);
        else setHourly(d);
        setHourlyLoading(false);
      })
      .catch((e) => { setHourlyErr(String(e)); setHourlyLoading(false); });
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
                      {hourlyLoading && (
                        <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--text3)" }}>
                          Loading hour by hour...
                        </div>
                      )}
                      {hourlyErr && (
                        <div style={{ padding: "16px 14px", fontSize: 12.5, color: "#9c0006" }}>
                          Could not load the hourly curve: {hourlyErr}
                        </div>
                      )}
                      {!hourlyLoading && !hourlyErr && curve && (
                        <HourlyCurve
                          key={d.date}
                          day={curve}
                          maxStaffCapacity={hourly.maxStaffCapacity}
                          openFrom={hourly.openFrom}
                          openTo={hourly.openTo}
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
            <strong style={{ color: "var(--text2)" }}>Hour by hour.</strong> Open a day with the arrow to see when
            its hours should land. Sales by hour is that hour's share of the day's expected sales, taken from the
            same matching weekdays. Staff is those dollars divided by the day's target, so the row always adds up
            to the hours in that day's line. Tap a bar to pin one hour.
          </div>
        </>
      )}
    </>
  );
}