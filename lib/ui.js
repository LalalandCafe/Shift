// Shared UI helpers. No React here, pure functions only.

export const GROUPS = {
  "TX-TN": [
    { label: "DFW", regions: ["DFW"] },
    { label: "HTX", regions: ["HTX"] },
    { label: "ATX & NSH & SATX", regions: ["ATX", "NSH", "SATX"] },
  ],
  "CA-AZ": [
    { label: "AZ", regions: ["AZ"] },
    { label: "CA", regions: ["CA"] },
  ],
};

/**
 * Groups rows into region sections in a fixed, predictable order.
 * Empty sections are dropped so the table never shows a header with nothing under it.
 */
export function sectionize(rows, { group = "All", search = "", withGroup = false } = {}) {
  const q = search.trim().toLowerCase();
  const out = [];

  for (const grp of Object.keys(GROUPS)) {
    if (group !== "All" && group !== grp) continue;

    for (const def of GROUPS[grp]) {
      let list = rows.filter((r) => r.grp === grp && def.regions.includes(r.region));
      if (q) {
        list = list.filter(
          (r) => r.name.toLowerCase().includes(q) || String(r.code).includes(q)
        );
      }
      if (list.length) {
        out.push({ label: withGroup ? `${grp} / ${def.label}` : def.label, stores: list });
      }
    }
  }
  return out;
}

// ---- formatting ----

const nil = (v) => v === null || v === undefined || Number.isNaN(v);

export const int = (n) => (nil(n) ? "—" : Math.round(n).toLocaleString("en-US"));

export const dec = (n, d = 2) =>
  nil(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const money = (n) => (nil(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US"));

export const pct = (n, d = 1) => (nil(n) ? "—" : (n > 0 ? "+" : "") + dec(n, d) + "%");

/** Accounting style: negatives in parentheses, the way the ops team reads them. */
export const paren = (n) => (nil(n) ? "—" : n < 0 ? `(${int(Math.abs(n))})` : int(n));

export const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---- stats ----

/** Linear-interpolated quantile. Input must be sorted ascending. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const median = (values) => quantile([...values].sort((a, b) => a - b), 0.5);

/** Position of v inside [min,max] as a 0-100 percentage, clamped. */
export function railPos(v, min, max) {
  if (max === min) return 50;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}
