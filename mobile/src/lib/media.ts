import type { MediaItem, Post } from '../types';

export const MAX_POST_MEDIA = 10;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export function parseRemoteMedia(value: unknown): MediaItem[] {
  if (Array.isArray(value)) return value as MediaItem[];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mediaOf(post: Pick<Post, 'media' | 'kind'> & { src?: string | null }) {
  if (Array.isArray(post.media) && post.media.length) {
    return post.media.filter((item) => item && (item.src || item.seed));
  }
  if (post.src) {
    return [
      {
        kind: post.kind === 'video' ? 'video' : 'photo',
        src: post.src,
      } as MediaItem,
    ];
  }
  return [];
}

export function firstMedia(post: Pick<Post, 'media' | 'kind'> & { src?: string | null }) {
  return mediaOf(post)[0] || null;
}

export function isVideoPost(post: Pick<Post, 'media' | 'kind'> & { src?: string | null }) {
  if (post.kind === 'video') return true;
  return mediaOf(post).some((item) => item.kind === 'video');
}

export function durSeconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = String(value ?? '').trim();
  const clockMatch = text.match(/^(\d+):([0-5]?\d)$/);
  if (clockMatch) return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
}
