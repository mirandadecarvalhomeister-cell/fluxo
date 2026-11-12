import { useEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojis';
import { lsGet, lsSet } from '../lib/utils';

const RECENT_KEY = 'fluxo.emojis.recent';
const MAX_RECENT = 24;

const readRecents = () => {
  try {
    const value = JSON.parse(lsGet(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export default function EmojiPicker({ onPick, onClose }) {
  const [recents, setRecents] = useState(readRecents);
  const [active, setActive] = useState(recents.length ? 'recent' : EMOJI_GROUPS[0].key);
  const gridRef = useRef(null);

  const groups = recents.length
    ? [{ key: 'recent', label: 'Recentes', icon: '🕘', emojis: recents }, ...EMOJI_GROUPS]
    : EMOJI_GROUPS;
  const group = groups.find((item) => item.key === active) || groups[0];

  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [active]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (emoji) => {
    const next = [emoji, ...recents.filter((item) => item !== emoji)].slice(0, MAX_RECENT);
    setRecents(next);
    lsSet(RECENT_KEY, JSON.stringify(next));
    onPick?.(emoji);
  };

  return (
    <div className="emoji-picker" role="dialog" aria-label="Escolher emoji">
      <div className="emoji-cats" role="tablist" aria-label="Categorias de emoji">
        {groups.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === group.key}
            className={item.key === group.key ? 'on' : ''}
            title={item.label}
            aria-label={item.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActive(item.key)}
          >
            <span>{item.icon}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </div>
      <div className="emoji-grid" ref={gridRef} key={group.key}>
        {group.emojis.map((emoji, index) => (
          <button
            key={`${group.key}-${index}-${emoji}`}
            type="button"
            title={emoji}
            aria-label={`Emoji ${emoji}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="emoji-foot">
        <span>{group.label}</span>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}
