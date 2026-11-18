// Mapeamento de emojis Unicode para animações Lottie do Google Noto Emoji.
// Fonte: https://googlefonts.github.io/noto-emoji-animation/ (OFL 1.1 / Apache 2.0)
// Arquivos servidos localmente em /emoji/ para evitar dependência externa em runtime.
const ANIMATED = {
  '❤️': '2764_fe0f',
  '🔥': '1f525',
  '👏': '1f44f',
  '😂': '1f602',
  '😮': '1f62e',
  '😢': '1f622',
  '🎉': '1f389',
  '💜': '1f49c',
  '😍': '1f60d',
  '😭': '1f62d',
  '👍': '1f44d',
  '🚀': '1f680',
  '✨': '2728',
  '💯': '1f4af',
  '🥳': '1f973',
  '😎': '1f60e',
};

export function hasAnimatedEmoji(emoji) {
  return Boolean(ANIMATED[emoji]);
}

export function animatedEmojiUrl(emoji) {
  const code = ANIMATED[emoji];
  return code ? `/emoji/${code}.json` : null;
}

// Cache em memória: evita fetch assíncrono no momento da reação (overlay dura ~1,5s).
const cache = new Map();
let preloadStarted = false;

export function getEmojiAnimation(emoji) {
  const url = animatedEmojiUrl(emoji);
  return url ? cache.get(url) || null : null;
}

export function preloadEmojiAnimations() {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  Object.values(ANIMATED).forEach((code) => {
    const url = `/emoji/${code}.json`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) cache.set(url, data); })
      .catch(() => {});
  });
}
