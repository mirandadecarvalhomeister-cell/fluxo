const tokenPattern = () =>
  /(\*\*[^*]+\*\*|\*[^*]+\*|#[\p{L}\d_]+|@[\p{L}\d_.]+|https?:\/\/[^\s]+)/gu;

function tokenType(value) {
  if (value.startsWith('**') && value.endsWith('**') && value.length > 4) return 'bold';
  if (value.startsWith('*') && value.endsWith('*') && value.length > 2) return 'italic';
  if (value.startsWith('#') || value.startsWith('@')) return 'tag';
  if (/^https?:\/\//i.test(value)) return 'link';
  return 'text';
}

/** Tokeniza um trecho, sem produzir HTML. Seguro contra XSS por construção. */
export function tokenize(source) {
  const text = String(source || '');
  const tokens = [];
  let last = 0;
  let match;
  const pattern = tokenPattern();
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const type = tokenType(match[0]);
    if (type === 'bold' || type === 'italic') {
      const raw = match[0].slice(type === 'bold' ? 2 : 1, type === 'bold' ? -2 : -1);
      tokens.push({ type, value: raw, children: tokenize(raw) });
    } else {
      tokens.push({ type, value: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

/** Quebra o texto em linhas, marcando as que começam com '- ' como lista. */
export function parseRichText(text) {
  return String(text || '')
    .split('\n')
    .map((line, index) => {
      const list = line.match(/^\s*-\s+(.*)$/);
      return {
        index,
        list: !!list,
        tokens: tokenize(list ? list[1] : line),
      };
    });
}
