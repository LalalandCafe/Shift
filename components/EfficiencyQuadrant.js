"use client";

import { useState, useEffect } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer, Cell } from "recharts";

function efficiency(row) {
  const h = row.wtd.hours;
  if (!h || h <= 0) return null;
  return ((h + row.wtd.overUnder) / h) * 100;
}

function quadrantOf(eff, ticketMin, effMid, ticketMid) {
  if (eff >= effMid && ticketMin >= ticketMid) return "cutting";
  if (eff >= effMid && ticketMin < ticketMid) return "model";
  if (eff < effMid && ticketMin < ticketMid) return "overstaffed";
  return "struggling";
}

const QUAD_META = {
  cutting: { color: "#9c0006", label: "Cutting service to hit numbers" },
  model: { color: "#1a6630", label: "Efficient and fast" },
  overstaffed: { color: "#1e55c4", label: "Fast, but overstaffed" },
  struggling: { color: "#9a5e0a", label: "Behind on both" },
};

function CustomTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const meta = QUAD_META[d.quadrant];
  const textColor = meta.color === "#1a6630" ? "#8ce0ac" : meta.color === "#9c0006" ? "#ff9a91" : "#fff";
  return (
    <div style={{ background: "#1a1a2e", color: "#fff", padding: "10px 13px", borderRadius: 9, fontSize: 12, lineHeight: 1.55, boxShadow: "0 8px 24px rgba(0,0,0,.3)", maxWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
      <div>{Math.round(d.eff)}% vs target &middot; {d.ticketMin} min tickets</div>
      <div style={{ marginTop: 4, color: textColor, fontWeight: 700 }}>{meta.label}</div>
    </div>
  );
}

export default function EfficiencyQuadrant({ isoDate }) {
  const [report, setReport] = useState(null);
  const [kitchen, setKitchen] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isoDate) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/report?date=${isoDate}`).then((r) => r.json()),
      fetch(`/api/kitchen-week?date=${isoDate}`).then((r) => r.json()),
    ])
      .then(([rep, kit]) => {
        if (rep.ok) setReport(rep);
        if (kit.ok) setKitchen(kit);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isoDate]);

  if (loading || !report || !kitchen) {
    return (
      <div className="tcard">
        <div className="thead"><span className="ttl">Efficiency vs. service</span></div>
        <div className="empty" style={{ padding: 34 }}>Loading...</div>
      </div>
    );
  }

  const kitchenByCode = {};
  kitchen.stores.forEach((s) => { kitchenByCode[s.code] = s; });

  const points = report.rows
    .map((r) => {
      const eff = efficiency(r);
      const k = kitchenByCode[r.code];
      if (eff === null || !k || k.medianMin === null || k.itemCount < 200) return null;
      return {
        code: r.code,
        name: r.name,
        eff,
        ticketMin: k.medianMin,
        service: k.service,
      };
    })
    .filter(Boolean);

  if (points.length < 4) {
    return (
      <div className="tcard">
        <div className="thead"><span className="ttl">Efficiency vs. service</span></div>
        <div className="empty" style={{ padding: 34 }}>
          Not enough stores with both efficiency and ticket time data yet to plot this.
        </div>
      </div>
    );
  }

  const effMid = 100;
  const ticketMid = kitchen.companyMedianMin || 2;

  const withQuad = points.map((p) => ({
    ...p,
    quadrant: quadrantOf(p.eff, p.ticketMin, effMid, ticketMid),
  }));

  const cuttingCount = withQuad.filter((p) => p.quadrant === "cutting").length;

  return (
    <div className="tcard">
      <div className="thead">
        <span className="ttl">Efficiency vs. service</span>
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
          {points.length} stores
        </span>
      </div>
      <div style={{ padding: "10px 20px 6px" }}>
        <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 4, lineHeight: 1.5 }}>
          Labor efficiency alone can hide a store cutting hours at the cost of service. This
          plots both together. The top-right quadrant is the one to watch:
          {cuttingCount > 0
            ? ` right now ${cuttingCount} store${cuttingCount === 1 ? " is" : "s are"} there.`
            : " nobody is there right now."}
        </div>
      </div>
      <div style={{ padding: "10px 16px 20px", height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 4 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="ticketMin"
              name="Ticket time"
              tick={{ fontSize: 11, fill: "var(--text3)" }}
              axisLine={false}
              tickLine={false}
              label={{ value: "Median ticket time (min) →", position: "insideBottom", offset: -14, fontSize: 11, fill: "var(--text3)" }}
            />
            <YAxis
              type="number"
              dataKey="eff"
              name="Efficiency"
              tick={{ fontSize: 11, fill: "var(--text3)" }}
              axisLine={false}
              tickLine={false}
              label={{ value: "Efficiency vs target (%) →", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text3)" }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={ticketMid} stroke="var(--border2)" strokeDasharray="4 4" />
            <ReferenceLine y={effMid} stroke="var(--border2)" strokeDasharray="4 4" />
            <Tooltip content={<CustomTip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={withQuad}>
              {withQuad.map((p, i) => (
                <Cell key={i} fill={QUAD_META[p.quadrant].color} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "0 20px 16px", fontSize: 10.5, color: "var(--text3)" }}>
        {Object.entries(QUAD_META).map(([key, m]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block" }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}