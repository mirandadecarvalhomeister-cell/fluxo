// Mapeia cada emoji de reação para um efeito visual próprio.
// Usado pelo componente ReactionFx (overlay que "estorra" sobre o post) e
// pelas classes de animação no botão.

// Reações padrão exibidas no picker de cada publicação.
export const REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '😢', '🎉', '💜'];

// Catálogo completo disponível para personalização (botão + no picker).
export const REACTION_CATALOG = [
  '❤️', '🔥', '👏', '😂', '😮', '😢', '🎉', '💜',
  '🤯', '🙌', '😍', '🤔', '💡', '👀', '🚀', '🍿',
  '🥳', '😎', '🤝', '💯', '✨', '👍', '👎', '😭',
  '🥰', '😡', '🤩', '🫶', '💪', '🙏', '🎯', '🌟',
];

const HEARTS = ['❤️', '💜', '🧡', '💛', '💚', '💙', '🩷', '🤍', '🖤', '💖', '💗', '💓', '💞', '💕'];
const FIRE = ['🔥', '🎃'];
const CLAP = ['👏'];
const LAUGH = ['😂', '🤣', '😆'];
const WOW = ['😮', '😯', '😲', '🤯'];
const SAD = ['😢', '😭', '😔'];
const PARTY = ['🎉', '🎊', '🥳'];
const THUMBS = ['👍', '👎'];

export function fxFor(emoji) {
  if (HEARTS.includes(emoji)) return 'heart';
  if (FIRE.includes(emoji)) return 'fire';
  if (CLAP.includes(emoji)) return 'clap';
  if (LAUGH.includes(emoji)) return 'laugh';
  if (WOW.includes(emoji)) return 'wow';
  if (SAD.includes(emoji)) return 'sad';
  if (PARTY.includes(emoji)) return 'party';
  if (THUMBS.includes(emoji)) return 'thumb';
  return 'default';
}

// Duração do efeito em ms (usada para remover o overlay).
export const FX_DURATION = 1500;

// Partículas de confete para o efeito "party".
export const CONFETTI = ['🎊', '✨', '🎈', '⭐', '💫', '🥳'];
