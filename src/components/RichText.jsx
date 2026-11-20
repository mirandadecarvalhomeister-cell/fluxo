import { Fragment } from 'react';
import EmojiText from './EmojiText';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|#[\p{L}\d_]+|@[\p{L}\d_.]+|https?:\/\/[^\s]+)/gu;

/**
 * Renderizador seguro de formatação simples. Nunca usa HTML arbitrário:
 * tudo é convertido em elementos React, com escape automático do React.
 * Marcadores: **negrito**, *itálico*, #hashtag, @mencao e URLs.
 */
function renderInline(text, keyPrefix) {
  const parts = String(text || '').split(INLINE).filter((part) => part !== '');
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{renderInline(part.slice(1, -1), key)}</em>;
    }
    if (part.startsWith('#') || part.startsWith('@')) {
      return <span className="rich-tag" key={key}>{part}</span>;
    }
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }
    return <EmojiText key={key} text={part} />;
  });
}

/** Texto de publicação com formatação, listas, links, menções e emojis. */
export default function RichText({ text, className = '' }) {
  const lines = String(text || '').split('\n');
  const nodes = [];
  let list = null;

  const flushList = () => {
    if (!list) return;
    nodes.push(<ul className="rich-list" key={`list-${nodes.length}`}>{list}</ul>);
    list = null;
  };

  lines.forEach((line, index) => {
    const match = line.match(/^\s*-\s+(.*)$/);
    if (match) {
      if (!list) list = [];
      list.push(<li key={`li-${index}`}>{renderInline(match[1], `li-${index}`)}</li>);
      return;
    }
    flushList();
    nodes.push(
      <Fragment key={`line-${index}`}>
        {renderInline(line, `line-${index}`)}
        {index < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
  flushList();

  return <span className={`rich-text ${className}`.trim()}>{nodes}</span>;
}
