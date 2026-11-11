import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

// Encontra o trecho "@alguma coisa" imediatamente antes do cursor.
function mentionAt(value, caret) {
  const before = String(value || '').slice(0, caret);
  const match = before.match(/(^|[\s([{"'“])@([\p{L}\d_.]*)$/u);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

export default function MentionField({
  multiline = false,
  value,
  onChange,
  className = '',
  ...rest
}) {
  const { data } = useApp();
  const fieldRef = useRef(null);
  const [picker, setPicker] = useState(null);

  const people = useMemo(() => {
    const seen = new Set();
    const list = [];
    [data?.me, ...Object.values(data?.users || {})].forEach((person) => {
      if (!person?.id || seen.has(person.id)) return;
      seen.add(person.id);
      list.push(person);
    });
    return list.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );
  }, [data?.me, data?.users]);

  const options = useMemo(() => {
    if (!picker) return [];
    const query = normalize(picker.query);
    return people
      .filter((person) => person.id !== data?.me?.id)
      .filter(
        (person) =>
          !query ||
          normalize(person.name).includes(query) ||
          normalize(person.handle).includes(query)
      )
      .slice(0, 6);
  }, [picker, people, data?.me?.id]);

  const close = () => setPicker(null);

  const sync = (element) => {
    if (!element) return;
    const caret = element.selectionStart ?? String(element.value || '').length;
    const token = mentionAt(element.value, caret);
    if (!token) {
      setPicker(null);
      return;
    }
    setPicker((current) =>
      current && current.start === token.start
        ? { ...current, query: token.query }
        : { start: token.start, query: token.query, index: 0 }
    );
  };

  const choose = (person) => {
    if (!person) return;
    const element = fieldRef.current;
    const caret = element?.selectionStart ?? value.length;
    const start = picker?.start ?? caret;
    const next = `${value.slice(0, start)}@${person.handle} ${value.slice(caret)}`;
    onChange(next);
    close();
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      const pos = start + String(person.handle).length + 2;
      try {
        element.setSelectionRange(pos, pos);
      } catch {
        /* campo sem seleção */
      }
    });
  };

  const onKeyDown = (event) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setPicker((current) => {
        if (!current) return current;
        const step = event.key === 'ArrowDown' ? 1 : options.length - 1;
        return { ...current, index: (current.index + step) % options.length };
      });
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      choose(options[picker?.index] || options[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const common = {
    ...rest,
    ref: fieldRef,
    className,
    value,
    onChange: (event) => {
      onChange(event.target.value);
      sync(event.target);
    },
    onClick: (event) => sync(event.currentTarget),
    onKeyDown,
    onKeyUp: (event) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
      sync(event.currentTarget);
    },
    onBlur: () => window.setTimeout(close, 140),
  };

  return (
    <span className={`mention-field${multiline ? ' grow' : ''}`}>
      {multiline ? <textarea {...common} /> : <input {...common} />}
      {picker && options.length ? (
        <div className="mention-pop" role="listbox" aria-label="Mencionar alguém">
          <span className="mention-cap">Mencionar</span>
          {options.map((person, index) => (
            <button
              type="button"
              key={person.id}
              role="option"
              aria-selected={index === (picker.index || 0)}
              className={index === (picker.index || 0) ? 'on' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(person)}
            >
              <Avatar user={person} size={26} />
              <span className="mention-meta">
                <b className="ell">{person.name}</b>
                <i className="ell">@{person.handle}</i>
              </span>
            </button>
          ))}
          <span className="mention-tip">
            <kbd>↑</kbd>
            <kbd>↓</kbd> para navegar · <kbd>Enter</kbd> para escolher
          </span>
        </div>
      ) : null}
    </span>
  );
}
