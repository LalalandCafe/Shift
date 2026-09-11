const HOST = process.env.TOAST_API_HOST;

let cachedToken = null;
let cachedExp = 0;

async function fetchNewToken() {
  const res = await fetch(`${HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.TOAST_CLIENT_ID,
      clientSecret: process.env.TOAST_CLIENT_SECRET,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast auth fallo (${res.status}): ${text}`);
  }

  const data = await res.json();
  const token = data?.token?.accessToken;
  const expiresIn = data?.token?.expiresIn;

  if (!token) {
    throw new Error("Toast auth: no vino accessToken en la respuesta");
  }

  cachedToken = token;
  cachedExp = Date.now() + (expiresIn - 60) * 1000;
  return token;
}

export async function getToastToken() {
  if (cachedToken && Date.now() < cachedExp) {
    return cachedToken;
  }
  return fetchNewToken();
}

export async function getTimeEntries({ restaurantGuid, startDate, endDate }) {
  const token = await getToastToken();
  const guid = restaurantGuid || process.env.TOAST_RESTAURANT_GUID;

  const url = new URL(`${HOST}/labor/v1/timeEntries`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast timeEntries fallo (${res.status}): ${text}`);
  }

  return res.json();
}

// True when an order should be excluded from any sales/transaction total -
// voided, deleted, or excess food (kitchen waste, never sold). Pulled out
// so anything that reads Toast orders (the sync route, or a debug/probe
// route checking our numbers against Toast's) uses the same rule instead
// of re-typing it and risking drift.
export function isOrderExcluded(order) {
  return !order || order.voided || order.deleted || order.excessFood;
}

// Sum of preDiscountPrice across one check's non-voided, non-deferred
// selections - the exact definition of "gross sales" this app has used
// since app/api/toast/sync-store/route.js first computed it. Kept here,
// not copied, so a probe checking our number against Toast's is actually
// comparing like with like: if this ever changes, both callers change
// together instead of one silently drifting from the other.
export function grossSalesForCheck(check) {
  if (!check || check.voided || check.deleted) return 0;
  let sum = 0;
  (check.selections || []).forEach((sel) => {
    if (sel.voided || sel.deferred) return;
    sum += sel.preDiscountPrice || 0;
  });
  return sum;
}
