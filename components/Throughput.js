"use client";

import { useState, useEffect } from "react";

function fmt(n, dec = 2) {
  if (n === null || n === undefined) return "\u2014";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtInt(n) {
  if (n === null || n === undefined) return "\u2014";
  return Math.round(n).toLocaleString("en-US");
}

// Color relativo al promedio de la empresa, mismo concepto que usa
// el benchmarking regional: verde arriba, rojo abajo, neutro a la par.
function vsColor(pct) {
  if (pct === null || pct === undefined) return "inherit";
  if (pct > 5) return "#1a6630";
  if (pct < -5) return "#9c0006";
  return "inherit";
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function Throughput() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = weekStart
      ? "/api/throughput?weekStart=" + weekStart
      : "/api/throughput";

    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Error desconocido");
        setData(j);
        if (!weekStart) setWeekStart(j.weekStart);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [weekStart]);

  if (loading && !data) {
    return <div className="tcard" style={{ padding: 20 }}>Cargando throughput...</div>;
  }

  if (error) {
    return (
      <div className="tcard" style={{ padding: 20 }}>
        <div style={{ color: "#9c0006", fontWeight: 700, marginBottom: 8 }}>
          No se pudo cargar
        </div>
        <div style={{ fontSize: 13 }}>{error}</div>
        <div style={{ fontSize: 12, marginTop: 10, opacity: 0.75 }}>
          Si dice que no existe la tabla daily_transactions, todavia no se ha
          creado. Esta vista es nueva y no afecta ningun otro reporte.
        </div>
      </div>
    );
  }

  const rows = data?.rows || [];
  const missing = rows.filter((r) => !r.hasTxnData);

  return (
    <div>
      <div
        className="tcard"
        style={{
          padding: "14px 16px",
          marginBottom: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="nbtn"
            onClick={() => setWeekStart(addDays(data.weekStart, -7))}
          >
            &larr;
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              Week of {data.weekStart}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {data.weekStart} to {data.weekEnd}
            </div>
          </div>
          <button
            className="nbtn"
            onClick={() => setWeekStart(addDays(data.weekStart, 7))}
          >
            &rarr;
          </button>
        </div>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.65, letterSpacing: 0.5 }}>
              Company TPLH
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {fmt(data.companyTplh)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.65, letterSpacing: 0.5 }}>
              Stores reporting
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {data.storesReporting} / {data.storesTotal}
            </div>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div
          className="tcard"
          style={{ padding: "10px 14px", marginBottom: 12, fontSize: 12.5 }}
        >
          <strong>Sin datos de transacciones esta semana ({missing.length}):</strong>{" "}
          {missing.map((m) => m.name).join(", ")}
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            Estas tiendas se muestran sin TPLH en vez de con cero. El conteo de
            transacciones empieza a guardarse desde que se desplego este cambio,
            asi que semanas anteriores van a salir vacias hasta que se haga backfill.
          </div>
        </div>
      )}

      <div className="tcard">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,.08)" }}>
          <span className="ttl">Throughput by store</span>
          <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 10 }}>
            TPLH = transacciones &divide; horas de labor
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Store</th>
                <th style={{ textAlign: "left" }}>Region</th>
                <th>TPLH</th>
                <th>vs Co.</th>
                <th>Trans</th>
                <th>Hours</th>
                <th>Avg ticket</th>
                <th>SPLH</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>
                    {r.name}
                    {!r.hasTxnData && (
                      <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>
                        {" "}(no txn data)
                      </span>
                    )}
                    {r.hasTxnData && r.daysWithTxn < r.daysInWeek && (
                      <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>
                        {" "}({r.daysWithTxn}/{r.daysInWeek} d)
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "left", fontSize: 12, opacity: 0.8 }}>{r.region}</td>
                  <td style={{ fontWeight: 800 }}>{fmt(r.tplh)}</td>
                  <td style={{ color: vsColor(r.vsCompanyPct), fontWeight: 700 }}>
                    {r.vsCompanyPct === null ? "\u2014" : (r.vsCompanyPct > 0 ? "+" : "") + fmt(r.vsCompanyPct, 1) + "%"}
                  </td>
                  <td>{fmtInt(r.transactions)}</td>
                  <td>{fmt(r.hours, 1)}</td>
                  <td>{r.avgTicket === null ? "\u2014" : "$" + fmt(r.avgTicket)}</td>
                  <td>{r.splh === null ? "\u2014" : "$" + fmt(r.splh)}</td>
                  <td style={{ opacity: 0.7 }}>${r.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 10, lineHeight: 1.6 }}>
        <div>
          <strong>TPLH</strong> = checks cerrados &divide; horas de labor. No se infla
          con aumentos de precio ni con dias de ticket alto, por eso es una
          comparacion mas pareja entre tiendas que SPLH.
        </div>
        <div>
          Horas usan las mismas exclusiones que el Week View (NSO Trainer, General
          Manager, lista de excluidos). Turnos abiertos cuentan tiempo transcurrido
          con tope de 18h.
        </div>
        <div>Generado {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : ""}</div>
      </div>
    </div>
  );
}