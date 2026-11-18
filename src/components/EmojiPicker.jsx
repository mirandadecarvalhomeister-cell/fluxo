import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojis';
import { lsGet, lsSet } from '../lib/utils';
import { Icon } from './Icon';
import AnimatedEmoji from './AnimatedEmoji';

const RECENT_KEY = 'fluxo.emojis.recent';
const MAX_RECENT = 24;
const ALL_EMOJIS = [...new Set(EMOJI_GROUPS.flatMap((g) => g.emojis))];

// Ícones de linha para as categorias, no estilo dos mensageiros modernos.
const CAT_PATHS = {
  recent: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  smileys: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" /></>,
  love: <path d="M12 20s-7-4.4-9-9.2C1.6 7.4 3.7 4 7 4c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.4 4 6.8C19 15.6 12 20 12 20z" />,
  gestures: <path d="M7 12V6a1.5 1.5 0 0 1 3 0v5-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a1.6 1.6 0 0 1 2.5-2z" />,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.5a3 3 0 0 1 0 5M18 14.8c1.8.8 3 2.4 3 5.2" /></>,
  animals: <><circle cx="7" cy="9" r="1.5" /><circle cx="12" cy="6.5" r="1.5" /><circle cx="17" cy="9" r="1.5" /><path d="M12 11c3 0 5 3 5 5.5 0 2-1.5 3.5-3.5 3.5-1 0-1.5-.5-2.5-.5s-1.5.5-2.5.5C7 20 5.5 18.5 5.5 16.5 5.5 14 7.5 11 12 11z" /></>,
  food: <><path d="M5 4h14v6a7 7 0 0 1-14 0z" /><path d="M19 6h2a3 3 0 0 1 0 6h-2M12 17v3M8 21h8" /></>,
  travel: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 10h14M8 21l2-4M16 21l-2-4M8.5 13.5h.01M15.5 13.5h.01" /></>,
  activities: <><circle cx="12" cy="12" r="9" /><path d="M12 3c3 3 4.5 6 4.5 9S15 18 12 21M3.5 9c3 1.5 7 2 13 1M3.5 15c3-1.5 7-2 13-1" /></>,
  objects: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
  symbols: <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />,
  flags: <path d="M5 21V4M5 5h13l-3 4 3 4H5" />,
};

function CatIcon({ groupKey }) {
  return (
    <svg
      className="emoji-cat-ic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAT_PATHS[groupKey] || CAT_PATHS.symbols}
    </svg>
  );
}

// Nomes aproximados para busca por palavra (pt/en).
const NAMES = {
  '😀': 'sorriso feliz smile', '😂': 'riso lágrimas laugh', '😍': 'apaixonado love heart',
  '🥰': 'amor carinho', '😎': 'legal óculos cool', '🤔': 'pensando thinking',
  '😢': 'triste choro sad', '😡': 'raiva angry', '👍': 'joinha like positivo',
  '👎': 'negative ruim', '👏': 'palmas applause', '🙏': 'oração graças',
  '🔥': 'fogo fire quente', '❤️': 'coração heart amor', '💜': 'roxo coração',
  '🎉': 'festa comemoração party', '✨': 'brilho sparkle', '💯': 'cem nota cem',
  '🚀': 'foguete rocket', '😮': 'uau wow surpreso', '😴': 'sono dormindo',
  '🤯': 'explodiu cabeça mind blown', '🙌': 'celebrando', '💡': 'ideia light',
  '👀': 'olhos olhar', '🍿': 'pipoca cinema', '🥳': 'comemorar aniversário',
  '🤝': 'aperto de mão acordo', '😭': 'chorando muito', '🤩': 'encantado estrela',
  '🫶': 'coração mãos', '💪': 'força muscle', '🎯': 'alvo meta',
  '🌟': 'estrela star', '😉': 'piscadela wink', '😊': 'sorriso gentil',
  '🤗': 'abraço hug', '😇': 'anjo santo',
};

const readRecents = () => {
  try {
    const value = JSON.parse(lsGet(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export default function EmojiPicker({ onPick, onClose, onStickers, embedded = false }) {
  const [recents, setRecents] = useState(readRecents);
  const [active, setActive] = useState(recents.length ? 'recent' : EMOJI_GROUPS[0].key);
  const [query, setQuery] = useState('');
  const gridRef = useRef(null);
  const sectionRefs = useRef({});
  const activeRef = useRef(active);
  activeRef.current = active;

  const groups = useMemo(
    () =>
      recents.length
        ? [{ key: 'recent', label: 'Recentes', emojis: recents }, ...EMOJI_GROUPS]
        : [...EMOJI_GROUPS],
    [recents]
  );

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

  // Um quadro único com todas as categorias; ao rolar, a barra acompanha.
  const sections = results
    ? [{ key: 'search', label: 'Resultados', emojis: results }]
    : groups;

  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [query]);

  const onScroll = () => {
    if (results) return;
    const grid = gridRef.current;
    if (!grid) return;
    const top = grid.scrollTop + 28;
    let current = sections[0]?.key;
    for (const item of sections) {
      const el = sectionRefs.current[item.key];
      if (el && el.offsetTop <= top) current = item.key;
    }
    if (current && current !== activeRef.current) setActive(current);
  };

  const goTo = (key) => {
    if (results) {
      setQuery('');
      setActive(key);
      return;
    }
    const el = sectionRefs.current[key];
    const grid = gridRef.current;
    if (el && grid) {
      grid.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior: 'smooth' });
    }
    setActive(key);
  };

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

  const currentLabel = results ? 'Resultados' : sections.find((s) => s.key === active)?.label || '';

  const renderTile = (emoji, index, keyPrefix) => (
    <div className="emoji-tile-wrap" key={`${keyPrefix}-${index}-${emoji}`}>
      <button
        type="button"
        title={emoji}
        aria-label={`Emoji ${emoji}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(emoji)}
      >
        <AnimatedEmoji emoji={emoji} size={32} />
      </button>
    </div>
  );

  return (
    <div
      className={`emoji-picker${embedded ? ' embedded' : ''}`}
      role="dialog"
      aria-label="Escolher emoji"
    >
      {!results ? (
        <div className="emoji-cats" role="tablist" aria-label="Categorias de emoji">
          {groups.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === active}
              className={item.key === active ? 'on' : ''}
              title={item.label}
              aria-label={item.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => goTo(item.key)}
            >
              <CatIcon groupKey={item.key} />
            </button>
          ))}
          {onStickers ? (
            <button
              type="button"
              className="emoji-cat-stickers"
              title="Figurinhas"
              aria-label="Figurinhas"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onStickers}
            >
              <Icon name="sticker" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="emoji-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar emoji"
          aria-label="Pesquisar emoji"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label="Limpar">
            <Icon name="x" />
          </button>
        ) : null}
      </div>

      <div className="emoji-grid" ref={gridRef} onScroll={onScroll}>
        {sections.map((item) => (
          <section
            key={item.key}
            className="emoji-section"
            ref={(el) => { sectionRefs.current[item.key] = el; }}
          >
            <div className="emoji-section-label">{item.label}</div>
            <div className="emoji-section-grid">
              {item.emojis.map((emoji, index) => renderTile(emoji, index, item.key))}
            </div>
          </section>
        ))}
        {results && !results.length ? (
          <p className="muted" style={{ padding: 16 }}>
            Nenhum emoji encontrado para “{query}”.
          </p>
        ) : null}
      </div>

      <div className="emoji-foot">
        <span>{results ? `${results.length} resultado(s)` : currentLabel}</span>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}
