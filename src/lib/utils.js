export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const fmt = (n) => {
  const v = Number(n) || 0;
  return v >= 1000
    ? (v / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil'
    : v.toLocaleString('pt-BR');
};

export const hs = (s) => {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const hm = (ts) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function ago(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  if (d < 604800) return `há ${Math.floor(d / 86400)} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function fmtDur(value) {
  if (value === null || value === undefined || value === '') return '0:10';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const total = Math.max(0, Math.round(Number(value)));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return `${Number(clock[1])}:${String(Number(clock[2])).padStart(2, '0')}`;
  return text;
}

export const T = (minutes) => Date.now() - minutes * 60000;

export const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};

export const initials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

export const slug = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '') || 'usuario';

export function fileToDataURL(file, max = 1080) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function fileToRawDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

export async function shareLink({ title, text, url }) {
  const payload = { title, text, url };
  try {
    if (navigator.share) {
      await navigator.share(payload);
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'error';
    }
  }
}

export function splitTags(text) {
  const parts = [];
  const re = /#([\p{L}\d_]+)/gu;
  let last = 0;
  let m;
  const str = String(text || '');
  while ((m = re.exec(str))) {
    if (m.index > last) parts.push({ text: str.slice(last, m.index) });
    parts.push({ tag: m[1] });
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push({ text: str.slice(last) });
  return parts;
}

export async function sha256(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(unescape(encodeURIComponent(s)));
  }
}
