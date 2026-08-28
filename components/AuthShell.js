import ShiftLogo from '@/components/ShiftLogo';
import LalalandLogo from '@/components/LalalandLogo';
import HourBand from '@/components/HourBand';

/**
 * Shared frame for the sign-in and sign-out screens so the two never drift
 * apart. Server component: the only client-side piece is HourBand.
 */
export default function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        <header className="auth-head">
          <div className="auth-mark">
            <ShiftLogo variant="mark" />
          </div>
          <h1 className="auth-wordmark">SHIFT</h1>
          <p className="auth-tagline">Labor and sales reporting</p>
        </header>

        <HourBand />

        {children}

        <footer className="auth-foot">
          <div className="auth-foot-mark">
            <LalalandLogo />
          </div>
          <p className="auth-foot-text">
            Internal tool for La La Land teams. Access is managed through your
            La La Land account.
          </p>
        </footer>
      </main>
    </div>
  );
}
