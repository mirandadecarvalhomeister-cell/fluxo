import { useState } from 'react';
import { Icon } from './Icon';
import EmojiPicker from './EmojiPicker';

/**
 * Barra de formatação simples. Atua sobre o campo de texto controlado pelo
 * rascunho (sem HTML), preservando seleção e quebras de linha.
 */
export default function RichTextTools({
  value,
  onChange,
  fieldId = 'ctext',
  maxLength = 600,
  showEmoji = true,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);

  const apply = (transform) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? start;
    const next = transform(value, start, end).slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.focus();
      const caret = Math.min(next.length, start + (next.length - value.length));
      try { el.setSelectionRange(caret, caret); } catch { /* sem seleção */ }
    });
  };

  const wrap = (marker) =>
    apply((text, start, end) =>
      `${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`
    );

  const list = () =>
    apply((text, start, end) => {
      const chunk = text.slice(start, end) || 'item';
      const prefixed = chunk
        .split('\n')
        .map((line) => `- ${line.replace(/^\s*-\s*/, '')}`)
        .join('\n');
      return `${text.slice(0, start)}${prefixed}${text.slice(end)}`;
    });

  return (
    <div className="rich-tools" role="toolbar" aria-label="Formatação do texto">
      <button type="button" onClick={() => wrap('**')} title="Negrito" aria-label="Negrito">
        <b>B</b>
      </button>
      <button type="button" onClick={() => wrap('*')} title="Itálico" aria-label="Itálico">
        <i>I</i>
      </button>
      <button type="button" onClick={list} title="Lista" aria-label="Lista">
        <span aria-hidden="true">☰</span>
      </button>
      {showEmoji ? (
        <span className="rich-emoji-wrap">
          <button
            type="button"
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
                  apply((text, start, end) =>
                    `${text.slice(0, start)}${emoji}${text.slice(end)}`
                  );
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
