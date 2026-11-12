import { useEffect, useState } from 'react';
import { STICKER_PACKS } from '../lib/stickers';

export default function StickerPicker({ onPick, onClose }) {
  const [active, setActive] = useState(STICKER_PACKS[0].id);
  const pack = STICKER_PACKS.find((item) => item.id === active) || STICKER_PACKS[0];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sticker-picker" role="dialog" aria-label="Escolher figurinha">
      <div className="sticker-cats" role="tablist">
        {STICKER_PACKS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === pack.id}
            className={item.id === pack.id ? 'on' : ''}
            title={item.label}
            aria-label={item.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActive(item.id)}
          >
            <span>{item.icon}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </div>
      <div className="sticker-grid">
        {pack.stickers.map((sticker, index) => (
          <button
            key={`${pack.id}-${index}`}
            type="button"
            className={`sticker-chip tone-${pack.id}`}
            title={sticker}
            aria-label={`Figurinha ${sticker} de ${pack.label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick?.(sticker, pack.id)}
          >
            <span>{sticker}</span>
          </button>
        ))}
      </div>
      <div className="emoji-foot">
        <span>{pack.label}</span>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}
