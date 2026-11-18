import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojis';
import { lsGet, lsSet } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

const RECENT_KEY = 'fluxo.emojis.recent';
const MAX_RECENT = 24;
const ALL_EMOJIS = [...new Set(EMOJI_GROUPS.flatMap((g) => g.emojis))];

// Nomes aproximados para busca por palavra (pt/en).
const NAMES = {
  '😀': 'sorriso feliz smile', '😂': 'riso lágrimas laugh', '😍': 'apaixonado love heart',
  '🥰': 'amor carinho', '😎': 'legal óculos cool', '🤔': 'pensando thinking',
  '😢': 'triste choro sad', '😡': 'raiva angry', '👍': 'joinha like positivo',
  '👎': 'negative ruim', '👏': 'palmas applause', '🙏': 'oração graças',
  '🔥': 'fogo fire quente', '❤️': 'coração heart amor', '💜': 'roxo coração',
  '🎉': 'festa comemoração party', '✨': 'brilho sparkle', '💯': 'cem nota cem',
  '🚀': 'foguete rocket', '👍🏽': 'joinha', '😮': 'uau wow surpreso',
  '😴': 'sono dormindo', '🤯': 'explodiu cabeça mind blown', '🙌': 'celebrando',
  '💡': 'ideia light', '👀': 'olhos olhar', '🍿': 'pipoca cinema',
  '🥳': 'comemorar aniversário', '🤝': 'aperto de mão acordo', '😭': 'chorando muito',
  '🤩': 'encantado estrela', '🫶': 'coração mãos', '💪': 'força muscle',
  '🎯': 'alvo meta targeting', '🌟': 'estrela star', '😉': 'piscadela wink',
  '😊': 'sorriso gentil', '🤗': 'abraço hug', '😇': 'anjo santo',
};

const readRecents = () => {
  try {
    const value = JSON.parse(lsGet(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export default function EmojiPicker({ onPick, onClose, embedded = false }) {
  const { data, actions } = useApp();
  const [recents, setRecents] = useState(readRecents);
  const [active, setActive] = useState(recents.length ? 'recent' : EMOJI_GROUPS[0].key);
  const [query, setQuery] = useState('');
  const gridRef = useRef(null);
  const favorites = data.emojiFavorites || [];

  const groups = useMemo(() => {
    const base = recents.length
      ? [{ key: 'recent', label: 'Recentes', icon: '🕘', emojis: recents }, ...EMOJI_GROUPS]
      : EMOJI_GROUPS;
    if (favorites.length) {
      base.unshift({ key: 'favorites', label: 'Favoritos', icon: '⭐', emojis: favorites });
    }
    return base;
  }, [recents, favorites]);

  const group = groups.find((item) => item.key === active) || groups[0];

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return ALL_EMOJIS.filter((emoji) => {
      const name = NAMES[emoji] || '';
      return emoji.includes(term) || name.includes(term) || EMOJI_GROUPS.some(
        (g) => g.label.toLowerCase().includes(term) && g.emojis.includes(emoji)
      );
    });
  }, [query]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [active, query]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (query) setQuery('');
        else onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, query]);

  const pick = (emoji) => {
    const next = [emoji, ...recents.filter((item) => item !== emoji)].slice(0, MAX_RECENT);
    setRecents(next);
    lsSet(RECENT_KEY, JSON.stringify(next));
    onPick?.(emoji);
  };

  const displayEmojis = results || group.emojis;

  return (
    <div
      className={`emoji-picker${embedded ? ' embedded' : ''}`}
      role="dialog"
      aria-label="Escolher emoji"
    >
      <div className="emoji-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar emoji…"
          aria-label="Pesquisar emoji"
        />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpar">×</button> : null}
      </div>
      {!results ? (
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
      ) : null}
      <div className="emoji-grid" ref={gridRef} key={results ? 'search' : group.key}>
        {displayEmojis.map((emoji, index) => (
          <div className="emoji-tile-wrap" key={`${results ? 'search' : group.key}-${index}-${emoji}`}>
            <button
              type="button"
              title={emoji}
              aria-label={`Emoji ${emoji}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(emoji)}
            >
              {emoji}
            </button>
            <button
              type="button"
              className={`emoji-fav ${favorites.includes(emoji) ? 'on' : ''}`}
              title={favorites.includes(emoji) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-label="Favoritar emoji"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => actions.toggleEmojiFavorite(emoji)}
            >
              <Icon name="spark" />
            </button>
          </div>
        ))}
        {!displayEmojis.length ? (
          <p className="muted" style={{ gridColumn: '1 / -1', padding: 16 }}>
            Nenhum emoji encontrado para “{query}”.
          </p>
        ) : null}
      </div>
      <div className="emoji-foot">
        <span>{results ? `${results.length} resultado(s)` : group.label}</span>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}
