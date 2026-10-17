import { useEffect } from 'react';
import { Link } from 'react-router';
import './landing.css';

const ROWS = [
  { y: 612, s: 0.5 },
  { y: 650, s: 0.75 },
  { y: 715, s: 1.1 },
];
const TURBINES = [
  { x: 760, base: 560, s: 0.6, dur: 9 },
  { x: 1020, base: 575, s: 1, dur: 7 },
  { x: 1300, base: 585, s: 0.75, dur: 8 },
];
const RAYS = Array.from({ length: 14 }, (_, i) => (360 / 14) * i);
const STREAKS = [300, 380, 450, 520];

function Panels() {
  return ROWS.map((row, r) => {
    const pitch = 118 * row.s;
    const count = Math.ceil(1440 / pitch) + 1;
    return Array.from({ length: count }, (_, c) => (
      <g key={`${r}-${c}`} transform={`translate(${c * pitch - 30 + r * 17} ${row.y}) scale(${row.s})`}>
        <path d="M10 0H110L100 60H0Z" fill="url(#lp-panel)" stroke="#0b2540" strokeWidth="2" />
        <path d="M43 0L33 60M77 0L67 60M5 30H105" stroke="#8fc0ee" strokeWidth="1" opacity=".35" />
        <g clipPath="url(#lp-clip)">
          <g transform="skewX(-20)">
            <rect className="lp-glint" x="-50" y="-10" width="34" height="80" fill="url(#lp-glintfill)"
              style={{ animationDelay: `${6 + c * 0.18 + r * 0.5}s` }} />
          </g>
        </g>
      </g>
    ));
  });
}

export default function LandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'REMS · Renewable Energy Monitoring System';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="lp">
      <svg className="lp-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b6ec2" /><stop offset=".55" stopColor="#5fb3ee" /><stop offset="1" stopColor="#c4e8fa" />
          </linearGradient>
          <linearGradient id="lp-over" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#566273" /><stop offset="1" stopColor="#a9b4c0" />
          </linearGradient>
          <radialGradient id="lp-core"><stop offset="0" stopColor="#fffbd6" /><stop offset="1" stopColor="#ffd23f" /></radialGradient>
          <radialGradient id="lp-glow"><stop offset="0" stopColor="#ffd23f" stopOpacity=".6" /><stop offset="1" stopColor="#ffd23f" stopOpacity="0" /></radialGradient>
          <linearGradient id="lp-ray" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#fff2a8" stopOpacity=".45" /><stop offset="1" stopColor="#fff2a8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lp-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a64a8" /><stop offset="1" stopColor="#0f2f57" /></linearGradient>
          <linearGradient id="lp-glintfill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lp-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4f9a5e" /><stop offset="1" stopColor="#2f6b3e" /></linearGradient>
          <clipPath id="lp-clip"><path d="M10 0H110L100 60H0Z" /></clipPath>
          <symbol id="lp-cloud" viewBox="0 0 220 110">
            <ellipse cx="60" cy="78" rx="52" ry="30" /><ellipse cx="115" cy="80" rx="70" ry="28" />
            <circle cx="105" cy="50" r="38" /><circle cx="65" cy="62" r="30" /><circle cx="150" cy="62" r="32" />
            <ellipse cx="170" cy="82" rx="42" ry="24" />
          </symbol>
        </defs>

        <rect width="1440" height="800" fill="url(#lp-sky)" />
        <rect className="lp-overcast" width="1440" height="800" fill="url(#lp-over)" />

        <g transform="translate(900 190)">
          <g className="lp-rays-fade"><g className="lp-rays-spin">
            {RAYS.map((a) => <path key={a} transform={`rotate(${a})`} d="M-10 0L0 -560L10 0Z" fill="url(#lp-ray)" />)}
          </g></g>
          <g className="lp-sun">
            <circle className="lp-glow" r="170" fill="url(#lp-glow)" />
            <circle r="52" fill="url(#lp-core)" />
          </g>
        </g>

        <use href="#lp-cloud" className="lp-cloud-l" x="680" y="100" width="380" height="190" fill="#e3e9f0" />
        <use href="#lp-cloud" className="lp-cloud-r" x="860" y="110" width="380" height="190" fill="#d3dbe5" />
        <use href="#lp-cloud" className="lp-drift" style={{ animationDuration: '90s', animationDelay: '-30s' }} x="-300" y="40" width="260" height="130" fill="#fff" opacity=".85" />
        <use href="#lp-cloud" className="lp-drift" style={{ animationDuration: '120s', animationDelay: '-80s' }} x="-300" y="250" width="200" height="100" fill="#fff" opacity=".7" />

        <path d="M0 560C250 490 560 560 860 515S1300 490 1440 535V800H0Z" fill="#8cc59a" />
        {TURBINES.map((t) => (
          <g key={t.x} transform={`translate(${t.x} ${t.base - 230 * t.s}) scale(${t.s})`}>
            <path d="M-5 0L5 0L9 230L-9 230Z" fill="#f4f7fa" />
            <g className="lp-blades" style={{ animationDuration: `${t.dur}s` }}>
              {[0, 120, 240].map((a) => (
                <path key={a} transform={`rotate(${a})`} d="M-4 0C-6 -40 -3 -90 0 -118C3 -90 6 -40 4 0Z" fill="#fff" />
              ))}
            </g>
            <circle r="9" fill="#dfe6ee" />
          </g>
        ))}
        <path d="M0 585C300 545 700 600 1000 570S1350 560 1440 580V800H0Z" fill="#5fa36b" />

        {STREAKS.map((y, i) => (
          <g key={y} transform={`translate(720 ${y})`}>
            <path className="lp-wind" d="M0 0H140" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="60 20 30 20"
              style={{ animationDuration: `${6 + i * 1.5}s`, animationDelay: `${6 + i * 0.8}s` }} />
          </g>
        ))}

        <rect y="600" width="1440" height="200" fill="url(#lp-ground)" />
        <g className="lp-panels"><Panels /></g>
      </svg>

      <div className="lp-scrim" aria-hidden="true" />

      <header className="lp-nav">
        <Link to="/welcome" className="lp-brand" aria-label="REMS home">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor" /></svg>
          REMS
        </Link>
        <Link to="/login" className="lp-link">Sign in</Link>
      </header>

      <main className="lp-hero">
        <p className="lp-eyebrow">Renewable Energy Monitoring System</p>
        <h1>See what your sun and wind are really producing.</h1>
        <p className="lp-sub">Live telemetry, expected-versus-actual performance, alerts and maintenance for solar and wind plants, in one place.</p>
        <Link to="/dashboard" className="lp-btn">Open dashboard</Link>
      </main>
    </div>
  );
}
