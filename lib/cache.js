// lib/cache.js
//
// Cache en memoria del proceso, con TTL.
//
// Es por INSTANCIA de la funcion serverless, no compartido entre todas.
// No es Redis y no pretende serlo. Lo que si resuelve, y es el caso que
// importa con 30 personas, es que dos peticiones simultaneas de la misma
// fecha compartan UN solo trabajo: se guarda la promesa, no el resultado.
//
// Un dia cerrado no cambia, asi que se cachea 10 minutos. El dia en curso
// se cachea 30 segundos, suficiente para absorber una rafaga sin que el
// numero en pantalla se sienta viejo.

const entries = new Map();
const MAX_ENTRIES = 60;

export function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value;

  const value = Promise.resolve().then(fn);
  entries.set(key, { value, expires: now + ttlMs });

  // Un fallo no se cachea. Si no, un error transitorio de red condenaria
  // esa fecha durante diez minutos.
  value.catch(() => entries.delete(key));

  if (entries.size > MAX_ENTRIES) {
    for (const k of entries.keys()) {
      if (entries.size <= MAX_ENTRIES) break;
      entries.delete(k);
    }
  }
  return value;
}

export function invalidate(prefix) {
  for (const k of entries.keys()) if (k.startsWith(prefix)) entries.delete(k);
}
