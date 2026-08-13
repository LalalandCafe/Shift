"use client";

import { useState } from "react";

export default function UnlockModal({ onClose, onUnlocked }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/reporter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (!j.ok) {
        setErr("That code did not work. Check it and try again.");
        setBusy(false);
        return;
      }
      sessionStorage.setItem("shift_reporter_code", code);
      onUnlocked();
    } catch {
      setErr("Could not reach the server. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Reporter mode</div>
        <div className="modal-sub">
          Unlocks the dashboard, service times, TPLH, drive-thru, the HTML email and store
          targets.
        </div>
        <input
          className="modal-in"
          type="password"
          value={code}
          autoFocus
          placeholder="Access code"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <div className="modal-err">{err}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!code || busy}>
            {busy ? "Checking" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
