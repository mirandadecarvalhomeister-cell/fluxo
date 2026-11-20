import { Fragment } from 'react';
import { parseRichText } from '../lib/richText';
import EmojiText from './EmojiText';

function renderTokens(tokens, keyPrefix) {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === 'bold') return <strong key={key}>{renderTokens(token.children, key)}</strong>;
    if (token.type === 'italic') return <em key={key}>{renderTokens(token.children, key)}</em>;
    if (token.type === 'tag') return <span className="rich-tag" key={key}>{token.value}</span>;
    if (token.type === 'link') {
      return (
        <a key={key} href={token.value} target="_blank" rel="noopener noreferrer">
          {token.value}
        </a>
      );
    }
    return <EmojiText key={key} text={token.value} />;
  });
}

/** Texto de publicação com formatação, listas, links, menções e emojis. */
export default function RichText({ text, className = '' }) {
  const lines = parseRichText(text);
  const nodes = [];
  let list = null;

  const flushList = () => {
    if (!list) return;
    nodes.push(<ul className="rich-list" key={`list-${nodes.length}`}>{list}</ul>);
    list = null;
  };

  lines.forEach((line) => {
    if (line.list) {
      if (!list) list = [];
      list.push(
        <li key={`li-${line.index}`}>{renderTokens(line.tokens, `li-${line.index}`)}</li>
      );
      return;
    }
    flushList();
    nodes.push(
      <Fragment key={`line-${line.index}`}>
        {renderTokens(line.tokens, `line-${line.index}`)}
        {line.index < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
  flushList();

  return <span className={`rich-text ${className}`.trim()}>{nodes}</span>;
}
