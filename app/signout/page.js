import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import AuthShell from '@/components/AuthShell';
import '../auth.css';

export const metadata = { title: 'Sign out of SHIFT' };

function initialsFrom(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function SignOutPage({ searchParams }) {
  const isDone = searchParams?.done === '1';
  const session = await auth();

  // Signed out and not just-signed-out means a stale or bookmarked link.
  if (!session?.user && !isDone) {
    redirect('/login');
  }

  async function endSession() {
    'use server';
    await signOut({ redirectTo: '/signout?done=1' });
  }

  if (isDone) {
    return (
      <AuthShell>
        <div className="auth-body">
          <h2 className="auth-title">You are signed out</h2>
          <p className="auth-note">
            Your SHIFT session is closed on this device. Your Microsoft account
            stays signed in elsewhere.
          </p>
        </div>

        <div className="auth-actions">
          <Link href="/login" className="auth-btn auth-btn-primary">
            Sign in again
          </Link>
        </div>
      </AuthShell>
    );
  }

  const { name, email, image } = session.user;

  return (
    <AuthShell>
      <div className="auth-body">
        <h2 className="auth-title">Sign out of SHIFT?</h2>
        <p className="auth-note">
          You will need your La La Land account to get back in.
        </p>
      </div>

      <div className="auth-user">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="auth-avatar" src={image} alt="" width={38} height={38} />
        ) : (
          <span className="auth-avatar" aria-hidden="true">
            {initialsFrom(name, email)}
          </span>
        )}
        <span className="auth-user-text">
          <span className="auth-user-name">{name || 'Signed in'}</span>
          <span className="auth-user-email">{email}</span>
        </span>
      </div>

      <div className="auth-actions">
        <form action={endSession}>
          <button type="submit" className="auth-btn auth-btn-primary">
            Sign out
          </button>
        </form>
        <Link href="/" className="auth-btn auth-btn-secondary">
          Back to dashboard
        </Link>
      </div>
    </AuthShell>
  );
}
