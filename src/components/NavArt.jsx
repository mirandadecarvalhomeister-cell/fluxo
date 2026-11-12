import { useId } from 'react';

// Ícones ilustrados da navegação (Feed, Perfil, Mensagens e Conexões).
// Os gradientes/filtros recebem IDs únicos para não colidirem entre rail e tabbar.
export function NavArt({ name }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (part) => `nav-${uid}-${part}`;

  if (name === 'feed') {
    return (
      <svg
        className="nav-art"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={id('hBody')} x1="0" y1="6" x2="0" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.55" stopColor="#CFE0FF" />
            <stop offset="1" stopColor="#9FD6FF" />
          </linearGradient>
          <linearGradient id={id('hEdge')} x1="8" y1="58" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4FE3FF" />
            <stop offset="1" stopColor="#FF8AE8" />
          </linearGradient>
          <filter id={id('hShadow')} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#1B0F7A" floodOpacity="0.6" />
          </filter>
        </defs>
        <g filter={`url(#${id('hShadow')})`}>
          <path
            d="M32 7 L8 29 Q5 32 9 33 L14 33 V53 Q14 57 18 57 H26 V43 Q26 39 30 39 H34 Q38 39 38 43 V57 H46 Q50 57 50 53 V33 H55 Q59 32 56 29 Z"
            fill={`url(#${id('hBody')})`}
            stroke={`url(#${id('hEdge')})`}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M32 10 L13 27 L50 27 Z" fill="#FFFFFF" fillOpacity="0.5" />
          <path d="M17 36 V52" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
    );
  }

  if (name === 'user') {
    return (
      <svg
        className="nav-art"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={id('pHead')} x1="0" y1="4" x2="0" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8CC8FF" />
            <stop offset="1" stopColor="#3D7DFF" />
          </linearGradient>
          <linearGradient id={id('pBody')} x1="0" y1="34" x2="0" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4FA3FF" />
            <stop offset="0.7" stopColor="#2A62FF" />
            <stop offset="1" stopColor="#8A4DFF" />
          </linearGradient>
          <filter id={id('pShadow')} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000A40" floodOpacity="0.7" />
          </filter>
        </defs>
        <g filter={`url(#${id('pShadow')})`}>
          <circle cx="32" cy="17" r="12" fill={`url(#${id('pHead')})`} />
          <ellipse cx="28" cy="12" rx="5" ry="3.2" fill="#FFFFFF" fillOpacity="0.55" />
          <path
            d="M8 56 Q8 35 32 35 Q56 35 56 56 Q56 59 53 59 H11 Q8 59 8 56 Z"
            fill={`url(#${id('pBody')})`}
          />
          <path
            d="M16 44 Q22 38 32 38"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.5"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      </svg>
    );
  }

  if (name === 'chat') {
    return (
      <svg
        className="nav-art"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={id('mBub')} x1="4" y1="10" x2="60" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3FE0FF" />
            <stop offset="0.5" stopColor="#5B8CFF" />
            <stop offset="1" stopColor="#B067FF" />
          </linearGradient>
          <linearGradient id={id('mInner')} x1="0" y1="14" x2="0" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7FB4FF" />
            <stop offset="1" stopColor="#7A5CFF" />
          </linearGradient>
          <filter id={id('mShadow')} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000A40" floodOpacity="0.7" />
          </filter>
        </defs>
        <g filter={`url(#${id('mShadow')})`}>
          <path
            d="M22 8 H42 Q60 8 60 26 Q60 44 42 44 H28 L14 56 L16 42 Q4 38 4 26 Q4 8 22 8 Z"
            fill={`url(#${id('mBub')})`}
          />
          <path
            d="M22 12 H42 Q56 12 56 26 Q56 40 42 40 H27 L18 47 L19 38 Q8 36 8 26 Q8 12 22 12 Z"
            fill={`url(#${id('mInner')})`}
            fillOpacity="0.9"
          />
          <path
            d="M14 20 Q18 14 26 13"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="20" cy="26" r="3.8" fill="#0A1040" />
          <circle cx="32" cy="26" r="3.8" fill="#0A1040" />
          <circle cx="44" cy="26" r="3.8" fill="#0A1040" />
        </g>
      </svg>
    );
  }

  if (name === 'orbit') {
    return (
      <svg
        className="nav-art"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id={id('nTop')} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#E7C8FF" />
            <stop offset="0.5" stopColor="#A978FF" />
            <stop offset="1" stopColor="#6A3DFF" />
          </radialGradient>
          <radialGradient id={id('nLeft')} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#B8F6FF" />
            <stop offset="0.5" stopColor="#2FC8FF" />
            <stop offset="1" stopColor="#1F6CFF" />
          </radialGradient>
          <radialGradient id={id('nRight')} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#EAC0FF" />
            <stop offset="0.5" stopColor="#B45CFF" />
            <stop offset="1" stopColor="#7A35F0" />
          </radialGradient>
          <linearGradient id={id('nLine')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7FA8FF" />
            <stop offset="1" stopColor="#4B6BFF" />
          </linearGradient>
          <filter id={id('nShadow')} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000A40" floodOpacity="0.7" />
          </filter>
        </defs>
        <g filter={`url(#${id('nShadow')})`}>
          <path
            d="M32 14 L12 48 H52 Z"
            fill="none"
            stroke={`url(#${id('nLine')})`}
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M32 16 V44" fill="none" stroke={`url(#${id('nLine')})`} strokeWidth="4" strokeLinecap="round" />
          <circle cx="32" cy="13" r="9" fill={`url(#${id('nTop')})`} />
          <circle cx="12" cy="48" r="9" fill={`url(#${id('nLeft')})`} />
          <circle cx="52" cy="48" r="9" fill={`url(#${id('nRight')})`} />
          <ellipse cx="29" cy="10" rx="3.2" ry="2" fill="#FFFFFF" fillOpacity="0.7" />
          <ellipse cx="9" cy="45" rx="3.2" ry="2" fill="#FFFFFF" fillOpacity="0.7" />
          <ellipse cx="49" cy="45" rx="3.2" ry="2" fill="#FFFFFF" fillOpacity="0.7" />
        </g>
      </svg>
    );
  }

  return null;
}

export default NavArt;
