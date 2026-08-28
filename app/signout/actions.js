'use server';

import { signOut } from '@/auth';

export async function endSession() {
  await signOut({ redirectTo: '/signout?done=1' });
}
