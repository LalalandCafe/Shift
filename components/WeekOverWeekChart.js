"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const up = d.delta >= 0;
  return (
    <div
      style={{
        background: "#1a1a2e",
        color: "#fff",
        padding: "10px 13px",
        borderRadius: 9,
        fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.3)",
        maxWidth: 220,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
      <div style={{ opacity: 0.75 }}>${d.prior} → ${d.current} SPLH</div>
      <div style={{ marginTop: 3, fontWeight: 700, color: up ? "#6ee7a8" : "#ff9a91" }}>
        {up ? "▲" : "▼"} {Math.abs(d.delta)} vs last week
      </div>
    </div>
  );
}

function DeltaLabel(props) {
  const { x, y, width, height, value } = props;
  const up = value >= 0;
  const lx = up ? x + width + 7 : x - 7;
  return (
    <text
      x={lx}
      y={y + height / 2}
      dy={4}
      textAnchor={up ? "start" : "end"}
      fontSize={11.5}
      fontWeight={700}
      fill={up ? "#1a6630" : "#9c0006"}
    >
      {up ? "+" : ""}
      {value}
    </text>
  );
}

export default function WeekOverWeekChart({ improving = [], declining = [] }) {
  const merged = [...improving, ...declining]
    .filter((v, i, arr) => arr.findIndex((x) => x.code === v.code) === i)
    .sort((a, b) => b.delta - a.delta);

  if (!merged.length) return null;

  const height = Math.max(180, merged.length * 36 + 24);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={merged} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fontSize: 11.5, fill: "var(--text2)" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="var(--navy)" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(26,26,46,.04)" }} />
          <Bar dataKey="delta" radius={4} maxBarSize={16} label={DeltaLabel}>
            {merged.map((entry, i) => (
              <Cell key={i} fill={entry.delta >= 0 ? "#1a6630" : "#9c0006"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}