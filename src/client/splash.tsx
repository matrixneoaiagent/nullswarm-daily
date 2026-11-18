import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';

const Splash = () => {
  const [init, setInit] = useState<InitResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/init')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: InitResponse | null) => {
        if (alive) setInit(data);
      })
      .catch(() => {
        if (alive) setInit(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const played = init?.played ?? false;
  const score = init?.outcome?.score ?? 0;
  const status = init?.outcome?.status;

  return (
    <div className="ns-shell">
      <p className="ns-mono text-[0.65rem] tracking-[0.3em] text-cyan-400/70">
        DAILY BREACH
      </p>
      <h1 className="text-2xl font-semibold tracking-[0.25em] text-cyan-300">
        NULLSWARM
      </h1>
      <p className="ns-mono text-[0.68rem] text-slate-400 text-center">
        {init
          ? `#${init.level.puzzle} · ${init.date} · par ${init.level.par}`
          : 'seeding the swarm…'}
      </p>

      {played ? (
        <div className="ns-card w-full max-w-[20rem] items-center text-center">
          <p className="ns-mono text-[0.65rem] text-slate-400">
            {status === 'breached'
              ? 'breach complete'
              : status === 'caught'
                ? 'caught by the swarm'
                : 'out of turns'}
          </p>
          <p className="text-2xl font-semibold text-slate-100">{score} pts</p>
          <p className="ns-mono text-[0.62rem] text-amber-300">
            {init && init.streak > 0 ? `🔥 ${init.streak}-day streak` : 'streak starts today'}
          </p>
        </div>
      ) : (
        <p className="ns-mono text-[0.68rem] text-slate-400 text-center max-w-[18rem]">
          Plant the EMP at the site, reach the exit, and stay out of the sentry
          rings. One run per operator per day.
        </p>
      )}

      <button
        type="button"
        className="ns-btn mt-1"
        onClick={(event) => {
          try {
            requestExpandedMode(event.nativeEvent, 'game');
          } catch {
            window.location.assign('/game.html');
          }
        }}
      >
        {played ? 'Review my run' : 'Enter the breach'}
      </button>

      <p className="ns-mono text-[0.6rem] text-slate-600">
        {context?.username ? `operator u/${context.username}` : 'operator'}
        {init ? ` · ${init.breachedToday} breaches today` : ''}
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
