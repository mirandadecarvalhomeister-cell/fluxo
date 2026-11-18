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
