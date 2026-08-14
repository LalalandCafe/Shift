// lib/tattle-auth.js
//
// Tattle auth. Verified against the live API on 2026-08-14:
//   POST /auth/token    { email, password }        -> { accessToken, expiresIn: 86400, refreshToken }
//   POST /auth/refresh  { email, refreshToken }    -> same shape
//
// The token is cached in Supabase, not in memory: every serverless
// invocation is a cold start, so an in-process token would mean a
// full password login on every single sync run.

import { supabaseAdmin } from '@/lib/supabase';

const BASE = (process.env.TATTLE_API_BASE || 'https://api.tattleapp.io/partners/api').replace(/\/+$/, '');

// Renew this far ahead of real expiry so a long sync never dies mid-flight.
const BUFFER_SECONDS = 300;
const REFRESH_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

function credentials() {
  const email = process.env.TATTLE_USERNAME;
  const password = process.env.TATTLE_PASSWORD;
  if (!email || !password) throw new Error('Missing TATTLE_USERNAME or TATTLE_PASSWORD');
  return { email, password };
}

async function post(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tattle ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function tokensFrom(json, fallbackRefresh = null) {
  if (!json.accessToken) {
    throw new Error(`No accessToken in response: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const now = Date.now();
  const lifetime = Number(json.expiresIn) || 86400;
  return {
    access_token: json.accessToken,
    access_expires_at: new Date(now + lifetime * 1000).toISOString(),
    refresh_token: json.refreshToken || fallbackRefresh,
    refresh_expires_at: json.refreshToken
      ? new Date(now + REFRESH_LIFETIME_SECONDS * 1000).toISOString()
      : null,
  };
}

async function save(tokens, extra = {}) {
  const { error } = await supabaseAdmin
    .from('tattle_auth')
    .upsert({ id: 1, ...tokens, ...extra }, { onConflict: 'id' });
  if (error) throw new Error(`tattle_auth write failed: ${error.message}`);
}

function isFresh(expiresAt) {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime();
  return Number.isFinite(ms) && ms - Date.now() > BUFFER_SECONDS * 1000;
}

/** Cached token, then refresh, then full login. */
export async function getAccessToken(force = false) {
  const { email, password } = credentials();

  if (!force) {
    const { data: cache } = await supabaseAdmin
      .from('tattle_auth')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (cache?.access_token && isFresh(cache.access_expires_at)) {
      return cache.access_token;
    }

    if (cache?.refresh_token && isFresh(cache.refresh_expires_at)) {
      try {
        const tokens = tokensFrom(
          await post('auth/refresh', { email, refreshToken: cache.refresh_token }),
          cache.refresh_token
        );
        await save(tokens);
        return tokens.access_token;
      } catch (err) {
        console.warn('Tattle refresh failed, logging in again:', err.message);
      }
    }
  }

  const tokens = tokensFrom(await post('auth/token', { email, password }));
  await save(tokens, { last_login_at: new Date().toISOString() });
  return tokens.access_token;
}

/** fetch() with the bearer token attached. Retries once on a 401. */
export async function tattleFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\/+/, '')}`;

  const call = async (token) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  return res;
}
