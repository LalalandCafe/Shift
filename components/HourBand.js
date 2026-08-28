'use client';

import { useEffect, useState } from 'react';

// Trading hours used to shade the band. Adjust if store hours change.
const OPEN_FROM = 6;
const OPEN_TO = 22;

/**
 * Twenty-four ticks, one per hour of the day. Trading hours read gold,
 * closed hours read faint, and the viewer's current hour is filled in.
 * Purely ambient, so it is hidden from assistive tech. The current hour is
 * resolved after mount to keep server and client markup identical.
 */
export default function HourBand() {
  const [currentHour, setCurrentHour] = useState(null);

  useEffect(() => {
    const read = () => setCurrentHour(new Date().getHours());
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="auth-band" aria-hidden="true">
      {Array.from({ length: 24 }, (_, hour) => {
        const isOpen = hour >= OPEN_FROM && hour < OPEN_TO;
        const isNow = currentHour === hour;
        const className = [
          'auth-band-tick',
          isOpen ? 'is-open' : '',
          isNow ? 'is-now' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return <span key={hour} className={className} style={{ '--i': hour }} />;
      })}
    </div>
  );
}
