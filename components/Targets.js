"use client";

import { Fragment, useState, useEffect } from "react";
import Icon from "./Icon";
import { sectionize } from "../lib/ui";

const FIELDS = [
  { key: "weekday_target", label: "Weekday" },
  { key: "weekend_target", label: "Weekend" },
  { key: "ptd_target", label: "Period" },
];

export default function Targets({ onAuthExpired }) {
  const [stores, setStores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStores(d.stores);
        else setErr(d.error || "Could not load stores");
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  const dirty = (st) => {
    const e = edits[st.code];
    if (!e) return false;
    return FIELDS.some((f) => e[f.key] !== undefined && Number(e[f.key]) !== st[f.key]);
  };

  async function save(st) {
    const e = edits[st.code] || {};
    const payload = {
      code: st.code,
      weekdayTarget: Number(e.weekday_target ?? st.weekday_target),
      weekendTarget: Number(e.weekend_target ?? st.weekend_target),
      ptdTarget: Number(e.ptd_target ?? st.ptd_target),
    };

    setErr(null);
    setSaving(st.code);

    // Sin cabeceras de credencial: la sesion va en la cookie, que el
    // navegador manda sola en peticiones al mismo origen.
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setSaving(null);

    if (d.ok) {
      setStores((prev) =>
        prev.map((s) =>
          s.code === st.code
            ? {
                ...s,
                weekday_target: payload.weekdayTarget,
                weekend_target: payload.weekendTarget,
                ptd_target: payload.ptdTarget,
              }
            : s
        )
      );
      setEdits((prev) => ({ ...prev, [st.code]: {} }));
      setSaved(st.code);
      setTimeout(() => setSaved(null), 1600);
      return;
    }

    if (res.status === 401) {
      onAuthExpired("Your session expired. Enter your code again.");
      return;
    }
    if (res.status === 403) {
      setErr("Your access does not allow changing targets.");
      return;
    }
    setErr(d.error || "No se pudo guardar ese target.");
  }

  if (loading) return <div className="empty">Loading stores</div>;
  if (!stores) return <div className="empty">{err || "No stores returned."}</div>;

  return (
    <div className="view">
      {err && (
        <div className="note note-warn">
          <Icon name="alert" size={15} />
          <div>{err}</div>
        </div>
      )}

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">SPLH targets</div>
            <div className="tsub">Saved per store. Changes apply to new report loads.</div>
          </div>
          <span className="chip chip-mute">{stores.length} stores</span>
        </div>
        <div className="scx tall">
          <table className="grid">
            <thead>
              <tr>
                <th>Location</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="r">
                    {f.label}
                  </th>
                ))}
                <th className="r" style={{ width: 96 }}>
                  {""}
                </th>
              </tr>
            </thead>
            <tbody>
              {sectionize(stores, { withGroup: true }).map((sec) => (
                <Fragment key={sec.label}>
                  <tr className="rrow">
                    <td colSpan={5}>{sec.label}</td>
                  </tr>
                  {sec.stores.map((st) => {
                    const e = edits[st.code] || {};
                    const changed = dirty(st);
                    return (
                      <tr key={st.code}>
                        <td>
                          <div className="lc-code">{st.code}</div>
                          <div className="lc-name">{st.name}</div>
                        </td>
                        {FIELDS.map((f) => (
                          <td className="num" key={f.key}>
                            <input
                              className="tinput"
                              type="number"
                              value={e[f.key] ?? st[f.key] ?? ""}
                              onChange={(ev) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [st.code]: { ...prev[st.code], [f.key]: ev.target.value },
                                }))
                              }
                            />
                          </td>
                        ))}
                        <td className="num">
                          <button
                            className={"btn btn-sm " + (saved === st.code ? "btn-green" : "btn-primary")}
                            onClick={() => save(st)}
                            disabled={saving === st.code || (!changed && saved !== st.code)}
                          >
                            {saving === st.code ? "Saving" : saved === st.code ? "Saved" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
