import { useState } from 'react';
import EmojiPicker from './EmojiPicker';
import StickerPicker from './StickerPicker';
import { Icon } from './Icon';

// Painel único de emojis e figurinhas. A navegação é uma barra só: as
// categorias de emoji incluem o atalho para figurinhas no fim.
export default function ChatPicker({ initial = 'emoji', onEmoji, onSticker, onClose }) {
  const [view, setView] = useState(initial === 'sticker' ? 'sticker' : 'emoji');

  if (view === 'sticker') {
    return (
      <div className="chat-picker" role="dialog" aria-label="Figurinhas">
        <div className="chat-picker-tabs sticker-back-bar">
          <button type="button" onClick={() => setView('emoji')}>
            <Icon name="back" /> Emojis
          </button>
          <span className="grow" />
          <button
            className="icon-btn sm"
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <Icon name="x" />
          </button>
        </div>
        <StickerPicker embedded onPick={onSticker} />
      </div>
    );
  }

  return (
    <div className="chat-picker" role="dialog" aria-label="Emojis e figurinhas">
      <EmojiPicker
        embedded
        onPick={onEmoji}
        onStickers={() => setView('sticker')}
        onClose={onClose}
      />
    </div>
  );
}
