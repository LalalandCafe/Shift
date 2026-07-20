// Extension de lib/toast.js — funciones para traducir GUIDs a nombres reales.
// Se importan junto con getToastToken() del archivo toast.js existente.

import { getToastToken } from "./toast.js";

const HOST = process.env.TOAST_API_HOST;

// Cache en memoria por restaurante, para no pedir esto en cada time entry.
// Se resetea cuando la funcion serverless se "enfria", igual que el token.
let jobsCache = {};   // { [restaurantGuid]: { [jobGuid]: jobTitle } }
let empsCache = {};   // { [restaurantGuid]: { [empGuid]: fullName } }
let cacheTime = {};   // { [restaurantGuid]: timestamp }
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min, los jobs/empleados casi no cambian

// ── JOBS: GUID -> nombre del puesto ──
export async function getJobsMap(restaurantGuid) {
  const guid = restaurantGuid || process.env.TOAST_RESTAURANT_GUID;
  const now = Date.now();
  if (jobsCache[guid] && cacheTime[guid] && (now - cacheTime[guid] < CACHE_TTL_MS)) {
    return jobsCache[guid];
  }
  const token = await getToastToken();
  const res = await fetch(`${HOST}/labor/v1/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast jobs fallo (${res.status}): ${text}`);
  }
  const jobs = await res.json();
  const map = {};
  jobs.forEach((j) => { map[j.guid] = j.title || j.name || ""; });
  jobsCache[guid] = map;
  cacheTime[guid] = now;
  return map;
}

// ── EMPLOYEES: GUID -> "Apellido, Nombre" (mismo formato que usa SHIFT) ──
export async function getEmployeesMap(restaurantGuid) {
  const guid = restaurantGuid || process.env.TOAST_RESTAURANT_GUID;
  const now = Date.now();
  if (empsCache[guid] && cacheTime[guid + "_emp"] && (now - cacheTime[guid + "_emp"] < CACHE_TTL_MS)) {
    return empsCache[guid];
  }
  const token = await getToastToken();
  const res = await fetch(`${HOST}/labor/v1/employees`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast employees fallo (${res.status}): ${text}`);
  }
  const emps = await res.json();
  const map = {};
  emps.forEach((e) => {
    // Toast normalmente da firstName/lastName. Formato "Apellido, Nombre" igual que SHIFT.
    const last = e.lastName || "";
    const first = e.firstName || "";
    map[e.guid] = last && first ? `${last}, ${first}` : (e.name || e.guid);
  });
  empsCache[guid] = map;
  cacheTime[guid + "_emp"] = now;
  return map;
}

// ── Traduce un array de time entries crudos de Toast a filas listas para aggregatePayroll ──
export async function translateTimeEntries(entries, restaurantGuid) {
  const guid = restaurantGuid || process.env.TOAST_RESTAURANT_GUID;
  const [jobsMap, empsMap] = await Promise.all([
    getJobsMap(guid),
    getEmployeesMap(guid),
  ]);
  return entries.map((e) => ({
    employee: empsMap[e.employeeReference?.guid] || e.employeeReference?.guid || "Unknown",
    jobTitle: jobsMap[e.jobReference?.guid] || e.jobReference?.guid || "Unknown",
    regularHours: e.regularHours || 0,
    overtimeHours: e.overtimeHours || 0,
    code: guid, // se reemplaza por el store_code real fuera de esta funcion
    guid: e.guid,
    inDate: e.inDate,
    outDate: e.outDate,
  }));
}
