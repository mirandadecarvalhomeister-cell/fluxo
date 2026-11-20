import { useState } from 'react';
import { Icon } from './Icon';
import EmojiPicker from './EmojiPicker';

/**
 * Barra de formatação simples. Atua sobre o campo controlado pelo rascunho
 * (sem HTML), preservando a seleção e as quebras de linha.
 */
export default function RichTextTools({
  value,
  onChange,
  fieldRef,
  maxLength = 600,
  showEmoji = true,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);

  const apply = (transform) => {
    const field = fieldRef?.current;
    if (!field) return;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? start;
    const result = transform(value, start, end);
    const next = result.text.slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      const el = fieldRef?.current;
      if (!el) return;
      el.focus();
      const from = Math.min(result.start ?? start, next.length);
      const to = Math.min(result.end ?? from, next.length);
      try { el.setSelectionRange(from, to); } catch { /* sem seleção */ }
    });
  };

  const wrap = (marker) =>
    apply((text, start, end) => ({
      text: `${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`,
      start: start + marker.length,
      end: end + marker.length,
    }));

  const list = () =>
    apply((text, start, end) => {
      const chunk = text.slice(start, end) || 'item';
      const prefixed = chunk
        .split('\n')
        .map((line) => `- ${line.replace(/^\s*-\s*/, '')}`)
        .join('\n');
      return {
        text: `${text.slice(0, start)}${prefixed}${text.slice(end)}`,
        start,
        end: start + prefixed.length,
      };
    });

  return (
    <div className="rich-tools" role="toolbar" aria-label="Formatação do texto">
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => wrap('**')} title="Negrito" aria-label="Negrito">
        <b>B</b>
      </button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => wrap('*')} title="Itálico" aria-label="Itálico">
        <i>I</i>
      </button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={list} title="Lista" aria-label="Lista">
        <span aria-hidden="true">☰</span>
      </button>
      {showEmoji ? (
        <span className="rich-emoji-wrap">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setEmojiOpen((open) => !open)}
            title="Emojis"
            aria-label="Inserir emoji"
            aria-expanded={emojiOpen}
          >
            <Icon name="smile" />
          </button>
          {emojiOpen ? (
            <span className="rich-emoji-pop">
              <EmojiPicker
                embedded
                onPick={(emoji) => {
                  apply((text, start, end) => ({
                    text: `${text.slice(0, start)}${emoji}${text.slice(end)}`,
                    start: start + emoji.length,
                    end: start + emoji.length,
                  }));
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="rich-counter" aria-live="polite">
        {String(value || '').length}/{maxLength}
      </span>
    </div>
  );
}
