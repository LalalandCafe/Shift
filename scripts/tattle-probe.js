const BASE = 'https://api.tattleapp.io/partners/api';
const MERCHANT = process.env.TATTLE_MERCHANT_ID || '2777';
let TOKEN = null;

// P7 from the manual Excel: [avg rating, review count]
const P7 = {
  10001:[4.375,8], 10002:[2.667,12], 10003:[4.167,6], 10004:[3.625,16], 10005:[4.04,25],
  10006:[4.111,36], 10007:[3.538,13], 10008:[3.895,19], 10009:[4.864,59], 10010:[4.038,26],
  10011:[4.0,22], 10012:[4.615,39], 10013:[4.684,76], 10014:[4.455,44], 10015:[3.036,28],
  10016:[4.429,7], 10017:[4.727,11], 10018:[4.606,33], 10019:[4.488,86], 10020:[4.472,36],
  10021:[4.974,39], 10022:[4.877,122], 10023:[4.489,47], 10024:[4.789,71], 10025:[3.368,19],
  10026:[4.04,25], 10027:[4.429,14], 10028:[3.867,30], 10029:[4.183,71], 10030:[4.515,33],
  10031:[4.314,51], 10032:[4.0,6], 10034:[3.821,39], 10036:[4.458,212],
};
const P7_START = '2026-06-29', P7_END = '2026-07-26';

async function get(path, params) {
  const qs = new URLSearchParams({ merchantId: MERCHANT, ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text };
  return { ok: true, json: JSON.parse(text) };
}

(async () => {
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.TATTLE_USERNAME, password: process.env.TATTLE_PASSWORD }),
  });
  TOKEN = (await r.json()).accessToken;

  console.log('=== A. WHICH DATE PARAM FILTERS /online-reviews? ===');
  const variants = {
    'none (baseline)': {},
    'startDate/endDate': { startDate: P7_START, endDate: P7_END },
    'fromDate/toDate': { fromDate: P7_START, toDate: P7_END },
    'reviewStartDate/reviewEndDate': { reviewStartDate: P7_START, reviewEndDate: P7_END },
    'experienceStartDate/experienceEndDate': { experienceStartDate: P7_START, experienceEndDate: P7_END },
  };
  let working = null;
  for (const [name, p] of Object.entries(variants)) {
    const res = await get('online-reviews', { ...p, pageSize: 1 });
    if (!res.ok) { console.log(`  ${name.padEnd(40)} -> ${res.status}`); continue; }
    const total = res.json.total;
    console.log(`  ${name.padEnd(40)} -> total: ${total}`);
    if (name !== 'none (baseline)' && total && total < 26000 && !working) working = p;
  }

  if (!working) {
    console.log('\n  No date param filtered. Will pull everything and filter client-side.\n');
  } else {
    console.log(`\n  Using: ${Object.keys(working).join(', ')}\n`);
  }

  console.log('=== B. PULLING P7 (2026-06-29 to 2026-07-26) ===');
  const rows = [];
  for (let page = 1; page <= 300; page++) {
    const res = await get('online-reviews', { ...(working || {}), page, pageSize: 100 });
    if (!res.ok) { console.log(`  page ${page} -> ${res.status}`); break; }
    const data = res.json.data || [];
    rows.push(...data);
    process.stdout.write(`\r  pulled ${rows.length}`);
    if (!res.json.hasNextPage) break;
    // if no server-side filter, stop once we page past the window
    if (!working && data.length && data[data.length - 1].date < `${P7_START}T00:00:00Z`) break;
  }
  console.log('');

  const locs = [];
  for (let page = 1; page <= 5; page++) {
    const res = await get('locations', { page, pageSize: 100 });
    if (!res.ok) break;
    locs.push(...(res.json.data || []));
    if (!res.json.hasNextPage) break;
  }
  const extById = Object.fromEntries(locs.map((l) => [l.id, l.externalId]));

  const inWindow = rows.filter((x) => {
    const d = (x.date || '').slice(0, 10);
    return d >= P7_START && d <= P7_END;
  });
  console.log(`  ${inWindow.length} reviews fall inside P7 (Excel has 1381)\n`);

  const prov = {};
  inWindow.forEach((x) => { prov[x.provider] = (prov[x.provider] || 0) + 1; });
  console.log('  providers:', JSON.stringify(prov), ' (Excel: GOOGLE 1109, YELP 272)\n');

  const agg = {};
  inWindow.forEach((x) => {
    const ext = extById[x.locationId] || `unknown-${x.locationId}`;
    agg[ext] = agg[ext] || { n: 0, sum: 0 };
    agg[ext].n++;
    agg[ext].sum += Number(x.rating) || 0;
  });

  console.log('=== C. API VS EXCEL, PER STORE ===');
  console.log('store | API avg | XLS avg | diff | API n | XLS n | match');
  let bad = 0;
  Object.keys(P7).sort().forEach((k) => {
    const a = agg[k];
    const [xa, xn] = P7[k];
    if (!a) { console.log(`${k} | MISSING FROM API | | | | ${xn} | NO`); bad++; return; }
    const avg = a.sum / a.n;
    const diff = avg - xa;
    const ok = Math.abs(diff) < 0.01 && a.n === xn;
    if (!ok) bad++;
    console.log(`${k} | ${avg.toFixed(3)} | ${xa.toFixed(3)} | ${diff >= 0 ? '+' : ''}${diff.toFixed(3)} | ${a.n} | ${xn} | ${ok ? 'yes' : 'NO'}`);
  });

  const all = Object.values(agg);
  const gt = all.reduce((s, v) => s + v.sum, 0) / all.reduce((s, v) => s + v.n, 0);
  console.log(`\nGrand total  API: ${gt.toFixed(4)}   Excel: 4.3917`);
  console.log(bad === 0 ? '\nPERFECT MATCH. Safe to automate.' : `\n${bad} stores off. Send this output.`);
})();
