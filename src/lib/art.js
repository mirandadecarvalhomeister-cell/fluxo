import { hs } from './utils';

export const PAL = [
  ['#5B35E8', '#F0386B', '#FFB020'],
  ['#0EA5A4', '#5B35E8', '#F9D5FF'],
  ['#F59E0B', '#EF4444', '#7C3AED'],
  ['#10B981', '#3B82F6', '#FDE68A'],
  ['#EC4899', '#8B5CF6', '#22D3EE'],
  ['#14B8A6', '#F59E0B', '#312E81'],
  ['#6366F1', '#22D3EE', '#F472B6'],
  ['#F97316', '#DB2777', '#4C1D95'],
];

export const pal = (seed) => PAL[hs(seed) % PAL.length];

const artCache = new Map();

export function art(seed, w = 800, h = 600) {
  const key = seed + '|' + w + '|' + h;
  if (artCache.has(key)) return artCache.get(key);
  const [a, b, c] = pal(seed);
  let r = hs(seed + 'x');
  const R = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
  let sh = '';
  for (let i = 0; i < 4; i++) {
    const cx = Math.round(R() * w);
    const cy = Math.round(R() * h);
    const rad = Math.round(h * (0.18 + R() * 0.35));
    sh += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${i % 2 ? c : b}" opacity="${(0.25 + R() * 0.35).toFixed(2)}"/>`;
  }
  const y = Math.round(h * (0.55 + R() * 0.25));
  sh += `<path d="M0 ${y} Q ${Math.round(w * 0.25)} ${Math.round(y - h * 0.18)} ${Math.round(w * 0.5)} ${y} T ${w} ${y} V ${h} H0Z" fill="${a}" opacity=".35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${sh}</svg>`;
  const u = 'data:image/svg+xml,' + encodeURIComponent(svg);
  artCache.set(key, u);
  return u;
}

export function logo(sz = 32) {
  let d = '';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    d += `<circle cx="${(20 + Math.cos(a) * 13).toFixed(1)}" cy="${(20 + Math.sin(a) * 13).toFixed(1)}" r="${i % 2 ? 4.2 : 5}" fill="${['var(--accent)', 'var(--hot)', 'var(--sun)'][i % 3]}"/>`;
  }
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 40 40" aria-hidden="true">${d}</svg>`;
}
