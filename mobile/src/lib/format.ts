export function uid(prefix = '') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${random}`;
}

export function slug(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

export function compactNumber(value: number) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace('.0', '')} mil`;
  }
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace('.0', '')} mi`;
}

export function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - (Number(ts) || 0));
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} sem`;
  const date = new Date(ts);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function clock(value: number) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const min = Math.floor(total / 60);
  return `${min}:${String(total % 60).padStart(2, '0')}`;
}

export function firstName(name: string) {
  return String(name || '').trim().split(/\s+/)[0] || 'você';
}

export function formatDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  return clock(seconds);
}

export function initials(name: string) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}
