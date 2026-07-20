"use client";

import { useState } from "react";

export default function Home() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runSync() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/toast/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-secret": secret,
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ ok: false, error: err.message });
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22 }}>SHIFT - Labor Sync</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Sincroniza time entries de Toast a Supabase para una tienda.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <label style={{ fontSize: 13 }}>
          Start Date (ISO)
          <input
            style={inputStyle}
            placeholder="2026-07-01T00:00:00.000-0500"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          End Date (ISO)
          <input
            style={inputStyle}
            placeholder="2026-07-07T23:59:59.000-0500"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Sync Secret
          <input
            style={inputStyle}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>

        <button onClick={runSync} disabled={loading} style={btnStyle}>
          {loading ? "Sincronizando..." : "Correr Sync"}
        </button>
      </div>

      {status && (
        <pre
          style={{
            marginTop: 20,
            background: "#111",
            color: "#0f0",
            padding: 14,
            borderRadius: 8,
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {JSON.stringify(status, null, 2)}
        </pre>
      )}
    </main>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  marginTop: 4,
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 13,
  boxSizing: "border-box",
};

const btnStyle = {
  padding: "10px 16px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
};
