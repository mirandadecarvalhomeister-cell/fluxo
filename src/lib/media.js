export const MAX_POST_MEDIA = 10;

export function mediaOf(post) {
  if (!post) return [];
  if (Array.isArray(post.media) && post.media.length) {
    return post.media.filter((item) => item && (item.src || item.seed));
  }
  if (post.src) {
    return [
      {
        kind: post.kind === 'video' ? 'video' : 'photo',
        src: post.src,
        seed: post.seed || post.id,
        dur: post.dur,
      },
    ];
  }
  if (post.kind === 'photo' || post.kind === 'video') {
    return [
      {
        kind: post.kind,
        seed: post.seed || post.id,
        dur: post.dur,
      },
    ];
  }
  return [];
}

export function firstMedia(post) {
  return mediaOf(post)[0] || null;
}

export function mediaKind(file) {
  return String(file?.type || '').startsWith('video/') ? 'video' : 'photo';
}

export function parseRemoteMedia(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function durSeconds(dur) {
  if (typeof dur === 'number' && Number.isFinite(dur)) return Math.round(dur);
  const text = String(dur ?? '').trim();
  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const value = Number(text);
  return Number.isFinite(value) ? Math.round(value) : null;
}
