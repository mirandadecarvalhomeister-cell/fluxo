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
  '😀': '1f600',
  '😃': '1f603',
  '😄': '1f604',
  '😁': '1f601',
  '😆': '1f606',
  '😅': '1f605',
  '🤣': '1f923',
  '🙂': '1f642',
  '🙃': '1f643',
  '😉': '1f609',
  '😊': '1f60a',
  '😇': '1f607',
  '🥰': '1f970',
  '🤩': '1f929',
  '😘': '1f618',
  '😗': '1f617',
  '😚': '1f61a',
  '😙': '1f619',
  '🥲': '1f972',
  '😋': '1f60b',
  '😛': '1f61b',
  '😜': '1f61c',
  '🤪': '1f92a',
  '😝': '1f61d',
  '🤑': '1f911',
  '🤗': '1f917',
  '🤭': '1f92d',
  '🤫': '1f92b',
  '🤔': '1f914',
  '🤐': '1f910',
  '🤨': '1f928',
  '😐': '1f610',
  '😑': '1f611',
  '😶': '1f636',
  '😏': '1f60f',
  '😒': '1f612',
  '🙄': '1f644',
  '😬': '1f62c',
  '🤥': '1f925',
  '😌': '1f60c',
  '😔': '1f614',
  '😪': '1f62a',
  '🤤': '1f924',
  '😴': '1f634',
  '😷': '1f637',
  '🤒': '1f912',
  '🤕': '1f915',
  '🤢': '1f922',
  '🤮': '1f92e',
  '🤧': '1f927',
  '🥵': '1f975',
  '🥶': '1f976',
  '🥴': '1f974',
  '😵': '1f635',
  '🤯': '1f92f',
  '🤠': '1f920',
  '🥸': '1f978',
  '🤓': '1f913',
  '🧐': '1f9d0',
  '😕': '1f615',
  '😟': '1f61f',
  '🙁': '1f641',
  '☹️': '2639',
  '😯': '1f62f',
  '😲': '1f632',
  '😳': '1f633',
  '🥺': '1f97a',
  '😦': '1f626',
  '😧': '1f627',
  '😨': '1f628',
  '😰': '1f630',
  '😥': '1f625',
  '😱': '1f631',
  '😖': '1f616',
  '😣': '1f623',
  '😞': '1f61e',
  '😓': '1f613',
  '😩': '1f629',
  '😫': '1f62b',
  '🥱': '1f971',
  '😤': '1f624',
  '😡': '1f621',
  '😠': '1f620',
  '🤬': '1f92c',
  '😈': '1f608',
  '👿': '1f47f',
  '💀': '1f480',
  '💩': '1f4a9',
  '🤡': '1f921',
  '👹': '1f479',
  '👻': '1f47b',
  '👽': '1f47d',
  '👾': '1f47e',
  '🤖': '1f916',
  '😺': '1f63a',
  '😸': '1f638',
  '😹': '1f639',
  '😻': '1f63b',
  '😼': '1f63c',
  '😽': '1f63d',
  '🙀': '1f640',
  '😿': '1f63f',
  '😾': '1f63e',
  '🙈': '1f648',
  '🙉': '1f649',
  '🙊': '1f64a',
  '💋': '1f48b',
  '💌': '1f48c',
  '💘': '1f498',
  '💝': '1f49d',
  '💖': '1f496',
  '💗': '1f497',
  '💓': '1f493',
  '💞': '1f49e',
  '💕': '1f495',
  '💟': '1f49f',
  '❣️': '2763',
  '💔': '1f494',
  '❤️‍🔥': '2764_200d_1f525',
  '❤️‍🩹': '2764_200d_1fa79',
  '🧡': '1f9e1',
  '💛': '1f49b',
  '💚': '1f49a',
  '💙': '1f499',
  '🤎': '1f90e',
  '🖤': '1f5a4',
  '🤍': '1f90d',
  '💥': '1f4a5',
  '💫': '1f4ab',
  '🕳️': '1f573',
  '💬': '1f4ac',
  '🗯️': '1f5ef',
  '👋': '1f44b',
  '🤚': '1f91a',
  '🖐️': '1f590',
  '✋': '270b',
  '🖖': '1f596',
  '👌': '1f44c',
  '🤌': '1f90c',
  '🤏': '1f90f',
  '✌️': '270c',
  '🤞': '1f91e',
  '🤟': '1f91f',
  '🤘': '1f918',
  '🤙': '1f919',
  '👈': '1f448',
  '👉': '1f449',
  '👆': '1f446',
  '🖕': '1f595',
  '👇': '1f447',
  '☝️': '261d',
  '👎': '1f44e',
  '✊': '270a',
  '👊': '1f44a',
  '🤛': '1f91b',
  '🤜': '1f91c',
  '🙌': '1f64c',
  '👐': '1f450',
  '🤲': '1f932',
  '🤝': '1f91d',
};

export function hasAnimatedEmoji(emoji) {
  return Boolean(ANIMATED[emoji]);
}

// Bandeiras não têm Lottie no catálogo do Google: são servidas como SVG local.
export function flagCode(emoji) {
  const points = [...String(emoji || '')].map((char) => char.codePointAt(0));
  if (
    points.length === 2 &&
    points.every((point) => point >= 0x1f1e6 && point <= 0x1f1ff)
  ) {
    return points.map((point) => point.toString(16)).join('_');
  }
  return null;
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
