const BASE = 'https://api.tattleapp.io/partners/api';
const MERCHANT = process.env.TATTLE_MERCHANT_ID || '2777';
let TOKEN = null;

const P7 = {
  10001:[4.375,8], 10002:[2.667,12], 10003:[4.167,6], 10004:[3.625,16], 10005:[4.04,25],
  10006:[4.111,36], 10007:[3.538,13], 10008:[3.895,19], 10009:[4.864,59], 10010:[4.038,26],
  10011:[4.0,22], 10012:[4.615,39], 10013:[4.684,76], 10014:[4.455,44], 10015:[3.036,28],
  10016:[4.429,7], 10017:[4.727,11], 10018:[4.606,33], 10019:[4.488,86], 10020:[4.472,36],
  10021:[4.974,39], 10022:[4.877,122], 10023:[4.489,47], 10024:[4.789,71], 10025:[3.368,19],
  10026:[4.04,25], 10027:[4.429,14], 10028:[3.867,30], 10029:[4.183,71], 10030:[4.515,33],
  10031:[4.314,51], 10032:[4.0,6], 10034:[3.821,39], 10036:[4.458,212],
};

const START = '2026-06-29', END = '2026-07-26';
const PROVIDERS = new Set(['GOOGLE', 'YELP']);
const SNAPSHOT_MAX_ID = 15990686;   // highest reviewid in the manual export

async function get(path, params) {
  const qs = new URLSearchParams({ merchantId: MERCHANT, ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, json: await res.json() };
}

(async () => {
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.TATTLE_USERNAME, password: process.env.TATTLE_PASSWORD }),
  });
  TOKEN = (await r.json()).accessToken;

  const locs = [];
  for (let p = 1; p <= 5; p++) {
    const res = await get('locations', { page: p, pageSize: 100 });
    if (!res.ok) break;
    locs.push(...(res.json.data || []));
    if (!res.json.hasNextPage) break;
  }
  const extById = Object.fromEntries(locs.map((l) => [l.id, l.externalId]));

  const rows = [];
  for (let p = 1; p <= 300; p++) {
    const res = await get('online-reviews', { page: p, pageSize: 100 });
    if (!res.ok) break;
    const data = res.json.data || [];
    rows.push(...data);
    process.stdout.write(`\rpulled ${rows.length}`);
    if (!res.json.hasNextPage) break;
    if (data.length && data[data.length - 1].date < '2026-06-25T00:00:00Z') break;
  }
  console.log('');

  // UTC date as-is, no timezone conversion. Excel uses the raw field.
  const inWindow = rows.filter((x) => {
    const d = (x.date || '').slice(0, 10);
    return d >= START && d <= END && PROVIDERS.has(x.provider) && extById[x.locationId];
  });

  const snapshot = inWindow.filter((x) => x.id <= SNAPSHOT_MAX_ID);
  const lateArrivals = inWindow.filter((x) => x.id > SNAPSHOT_MAX_ID);

  console.log(`in window (GOOGLE+YELP): ${inWindow.length}`);
  console.log(`  ingested before export: ${snapshot.length}   (Excel: 1381)`);
  console.log(`  ingested after export:  ${lateArrivals.length}\n`);

  const aggOf = (list) => {
    const a = {};
    list.forEach((x) => {
      const e = extById[x.locationId];
      a[e] = a[e] || { n: 0, sum: 0 };
      a[e].n++;
      a[e].sum += Number(x.rating) || 0;
    });
    return a;
  };

  const snap = aggOf(snapshot);
  const live = aggOf(inWindow);

  console.log('=== SNAPSHOT VS EXCEL ===');
  console.log('store | snap avg | XLS avg | snap n | XLS n | match || live avg | live n');
  let bad = 0;
  Object.keys(P7).sort().forEach((k) => {
    const s = snap[k], l = live[k], [xa, xn] = P7[k];
    if (!s) { console.log(`${k} | MISSING | | | ${xn} | NO`); bad++; return; }
    const avg = s.sum / s.n;
    const ok = Math.abs(avg - xa) < 0.01 && s.n === xn;
    if (!ok) bad++;
    const la = l ? (l.sum / l.n).toFixed(3) : '-';
    console.log(`${k} | ${avg.toFixed(3)} | ${xa.toFixed(3)} | ${s.n} | ${xn} | ${ok ? 'yes' : 'NO'} || ${la} | ${l ? l.n : '-'}`);
  });

  const g = (a) => {
    const v = Object.values(a);
    return (v.reduce((s, x) => s + x.sum, 0) / v.reduce((s, x) => s + x.n, 0)).toFixed(4);
  };
  console.log(`\nGrand total  snapshot: ${g(snap)}   Excel: 4.3917   live: ${g(live)}`);
  console.log(bad === 0
    ? '\nMATCH CONFIRMED. The only difference was late-arriving reviews.'
    : `\n${bad} stores still off.`);

  // Does the delay change anyone's bonus tier?
  console.log('\n=== BONUS TIER SHIFTS (4.0 and 4.5 cutoffs) ===');
  const tier = (v) => (v < 4 ? 'none' : v < 4.5 ? 'base' : 'base+100');
  let shifts = 0;
  Object.keys(P7).sort().forEach((k) => {
    if (!snap[k] || !live[k]) return;
    const a = tier(snap[k].sum / snap[k].n), b = tier(live[k].sum / live[k].n);
    if (a !== b) { console.log(`  ${k}: ${a} -> ${b}`); shifts++; }
  });
  if (!shifts) console.log('  none');
})();
