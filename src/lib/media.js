export const MAX_POST_MEDIA = 10;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export function mb(size) {
  return `${Math.max(1, Math.round((Number(size) || 0) / (1024 * 1024)))} MB`;
}

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

// Lê a duração de um arquivo de vídeo pela metadata. Resolve com null quando
// não dá para saber (formato estranho, falha no navegador etc.).
export function fileVideoDuration(file) {
  return new Promise((resolve) => {
    if (!file || !String(file.type || '').startsWith('video/')) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
