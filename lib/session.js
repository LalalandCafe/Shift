// lib/session.js
//
// Firma y verificacion de la sesion. NADA mas.
//
// Este archivo lo importa el middleware, que corre en el runtime Edge.
// Por eso no puede tocar node:crypto ni supabase-js: solo jose, que
// funciona en los dos runtimes.

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "shift_session";
export const SESSION_HOURS = 12;

const ALG = "HS256";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    // Falla cerrado a proposito. Un secreto ausente no puede degradar en
    // "sin sesion para nadie que la revise", que es como quedo el chequeo
    // de CRON_SECRET.
    throw new Error("SESSION_SECRET no esta configurado, o es muy corto");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(user) {
  return new SignJWT({
    name: user.name,
    role: user.role,
    scope: user.scope ?? null,
    storeCode: user.store_code ?? null,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    return {
      userId: payload.sub,
      name: payload.name,
      role: payload.role,
      scope: payload.scope ?? null,
      storeCode: payload.storeCode ?? null,
    };
  } catch {
    return null;
  }
}
