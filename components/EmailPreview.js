"use client";

import { useState, useEffect } from "react";
import Icon from "./Icon";

export default function EmailPreview({ isoDate, groupFilter }) {
  const [html, setHtml] = useState(null);
  const [copy, setCopy] = useState("idle");

  const params = `date=${isoDate}${
    groupFilter !== "All" ? `&group=${encodeURIComponent(groupFilter)}` : ""
  }`;

  useEffect(() => {
    if (!isoDate) return;
    let dead = false;
    setHtml(null);
    fetch(`/api/email?${params}`)
      .then((r) => r.text())
      .then((t) => !dead && setHtml(t));
    return () => {
      dead = true;
    };
  }, [params, isoDate]);

  async function copyHtml() {
    if (!html) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([html], { type: "text/plain" }),
        }),
      ]);
      setCopy("done");
    } catch {
      try {
        await navigator.clipboard.writeText(html);
        setCopy("done");
      } catch {
        setCopy("failed");
      }
    }
    setTimeout(() => setCopy("idle"), 2000);
  }

  return (
    <div className="view">
      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">Email preview</div>
            <div className="tsub">Paste straight into Outlook, formatting included.</div>
          </div>
          <div className="thead-tools">
            <a className="btn btn-sm" href={`/api/export?${params}`}>
              <Icon name="download" size={14} />
              Excel
            </a>
            <button
              className={
                "btn btn-sm " + (copy === "done" ? "btn-green" : copy === "failed" ? "" : "btn-primary")
              }
              onClick={copyHtml}
              disabled={!html}
            >
              <Icon name={copy === "done" ? "check" : "copy"} size={14} />
              {copy === "done" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy"}
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          {html ? (
            <iframe className="email-frame" srcDoc={html} style={{ height: 700 }} title="Email preview" />
          ) : (
            <div className="empty">Building the email</div>
          )}
        </div>
      </div>
    </div>
  );
}
