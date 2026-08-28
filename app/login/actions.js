'use server';

import { signIn } from '@/auth';

// Same-origin only, so ?callbackUrl cannot bounce a manager off-site.
export async function signInWithMicrosoft(callbackUrl) {
  const target = typeof callbackUrl === 'string' && callbackUrl.startsWith('/') ? callbackUrl : '/';
  await signIn('microsoft-entra-id', { redirectTo: target });
}
