"use client";

import { useState } from "react";
import ShiftLogo from "./ShiftLogo";

/**
 * Pantalla completa, no modal.
 *
 * El modal de antes dejaba la aplicacion visible detras, lo cual era honesto
 * cuando el candado era decorativo. Ahora no hay nada detras que mostrar:
 * sin sesion el API devuelve 401 en todo.
 */
export default function Login({ onSignedIn }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (!j.ok) {
        setErr(j.error || "Ese codigo no funciono.");
        setBusy(false);
        return;
      }
      setCode("");
      onSignedIn(j.session);
    } catch {
      setErr("No se pudo contactar al servidor. Intenta de nuevo.");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "var(--canvas)",
      }}
    >
      <div className="modal" style={{ width: 360 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <ShiftLogo variant="mark" size={34} crown />
          <div>
            <div className="logo-text" style={{ fontSize: 17 }}>
              SHIFT
            </div>
            <img
              className="logo-lockup"
              src="/logo/lalaland.png"
              alt="La La Land"
              width={90}
              height={13}
            />
          </div>
        </div>

        <div className="modal-title">Ingresa tu codigo</div>
        <div className="modal-sub">
          Tu codigo es personal. Lo que ves depende de el, asi que no lo compartas:
          si alguien mas lo necesita, pidele uno propio al equipo de tecnologia.
        </div>

        <input
          className="modal-in"
          type="password"
          value={code}
          autoFocus
          autoComplete="off"
          placeholder="Codigo de acceso"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <div className="modal-err">{err}</div>}

        <div className="modal-actions">
          <button className="btn btn-primary btn-full" onClick={submit} disabled={!code || busy}>
            {busy ? "Verificando" : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
