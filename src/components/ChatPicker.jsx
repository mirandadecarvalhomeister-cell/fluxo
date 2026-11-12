import { useState } from 'react';
import EmojiPicker from './EmojiPicker';
import StickerPicker from './StickerPicker';
import { Icon } from './Icon';

// Painel único de emojis e figurinhas. Um só botão abre o painel e as abas
// alternam entre os dois conteúdos, como nos mensageiros mais usados.
export default function ChatPicker({ initial = 'emoji', onEmoji, onSticker, onClose }) {
  const [tab, setTab] = useState(initial === 'sticker' ? 'sticker' : 'emoji');

  return (
    <div className="chat-picker" role="dialog" aria-label="Emojis e figurinhas">
      <div className="chat-picker-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'emoji'}
          className={tab === 'emoji' ? 'on' : ''}
          onClick={() => setTab('emoji')}
        >
          <Icon name="smile" /> Emojis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sticker'}
          className={tab === 'sticker' ? 'on' : ''}
          onClick={() => setTab('sticker')}
        >
          <Icon name="sticker" /> Figurinhas
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
      {tab === 'emoji' ? (
        <EmojiPicker embedded onPick={onEmoji} />
      ) : (
        <StickerPicker embedded onPick={onSticker} />
      )}
    </div>
  );
}
