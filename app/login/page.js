import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AuthShell from '@/components/AuthShell';
import { signInWithMicrosoft } from './actions';
import '../auth.css';

export const metadata = { title: 'Sign in to SHIFT' };

// Auth.js reports failures back to this page as ?error=<code>. AccessDenied
// comes from auth.config.js's signIn callback rejecting a profile with no
// SHIFT group at all. scope is not an Auth.js code: middleware.js redirects
// here with it when the session is valid but the role isn't admin, which is
// the one piece of copy carried over from the old /signin screen.
const ERROR_MESSAGES = {
  AccessDenied:
    'Your La La Land account is not in a SHIFT access group yet. Ask the tech team to add you, then sign in again.',
  Configuration:
    'Sign in is not set up correctly right now. Let the tech team know before trying again.',
  Verification:
    'That sign-in link is no longer valid. Start again from this page.',
  OAuthAccountNotLinked:
    'This email is already tied to a different sign-in method. Use your La La Land account.',
  scope:
    'Your account signed in, but it does not have full SHIFT access yet. Ask the tech team to add you to the right group.',
};

const DEFAULT_ERROR = 'Sign in did not go through. Try again.';

function WarningIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.25" r="0.9" fill="currentColor" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg className="auth-ms-logo" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  const callbackUrl =
    typeof searchParams?.callbackUrl === 'string' ? searchParams.callbackUrl : '/';

  if (session?.user) {
    redirect(callbackUrl);
  }

  const errorCode = typeof searchParams?.error === 'string' ? searchParams.error : null;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] || DEFAULT_ERROR : null;

  const signIn = signInWithMicrosoft.bind(null, callbackUrl);

  return (
    <AuthShell>
      {errorMessage && (
        <div className="auth-error" role="alert">
          <WarningIcon />
          <span>{errorMessage}</span>
        </div>
      )}

      <form action={signIn} className="auth-actions">
        <button type="submit" className="auth-btn auth-btn-primary">
          <MicrosoftLogo />
          Sign in with Microsoft
        </button>
      </form>
    </AuthShell>
  );
}
