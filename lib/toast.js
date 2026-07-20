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
