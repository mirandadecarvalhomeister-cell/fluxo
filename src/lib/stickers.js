// Packs de figurinhas do chat. Cada figurinha é um emoji grande com um fundo
// suave; o pacote viaja junto no anexo para o outro lado renderizar igual.
export const STICKER_PACKS = [
  {
    id: 'fluxo',
    label: 'FluXo',
    icon: '🫧',
    stickers: ['🫧', '🌊', '✨', '💜', '🔥', '🚀', '🌈', '🪩', '🎧', '💫', '🌙', '⚡'],
  },
  {
    id: 'amor',
    label: 'Amor',
    icon: '💜',
    stickers: ['🥰', '😍', '😘', '💜', '💘', '💞', '🫶', '💌', '🌹', '💐', '🧸', '💋'],
  },
  {
    id: 'zuera',
    label: 'Zuera',
    icon: '😂',
    stickers: ['😂', '🤣', '🤡', '💀', '👻', '🙈', '🙊', '🥴', '🤪', '🫠', '😎', '🤯'],
  },
  {
    id: 'festa',
    label: 'Festa',
    icon: '🎉',
    stickers: ['🎉', '🥳', '🎊', '🎈', '🎁', '🕺', '💃', '🍾', '🥂', '🪅', '🎂', '🎵'],
  },
  {
    id: 'bichos',
    label: 'Bichos',
    icon: '🐶',
    stickers: ['🐶', '🐱', '🐼', '🦊', '🐸', '🦄', '🐙', '🦋', '🐝', '🐧', '🐨', '🦥'],
  },
];

export const stickerPackOf = (id) =>
  STICKER_PACKS.find((pack) => pack.id === id) || STICKER_PACKS[0];
