import { useState } from 'react';
import { logo } from '../lib/art';
import { splitTags } from '../lib/utils';
import { useApp } from '../store/AppContext';

const ASSET_VERSION = '6';

// Detecta emojis (incluindo sequências com ZWJ, modificadores de pele e
// variation selectors) para poder estilizá-los separadamente do texto.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]+/gu;

function renderWithEmojis(text) {
  const str = String(text ?? '');
  const parts = str.split(EMOJI_RE);
  const emojis = str.match(EMOJI_RE) || [];
  return parts.flatMap((part, i) => {
    const nodes = [];
    if (part) nodes.push(<span key={`t${i}`}>{part}</span>);
    if (emojis[i]) {
      nodes.push(
        <span className="msg-emoji" key={`e${i}`}>
          {emojis[i]}
        </span>
      );
    }
    return nodes;
  });
}

// Selo de conta oficial. Hoje apenas o perfil @fluxooficial é verificado.
export const OFFICIAL_HANDLE = 'fluxooficial';

export function isOfficial(user) {
  return String(user?.handle || '').trim().toLowerCase() === OFFICIAL_HANDLE;
}

export function Verified({ user }) {
  if (!isOfficial(user)) return null;
  return (
    <span className="verified" title="Conta oficial verificada" aria-label="Conta oficial verificada">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m5 12.5 4.5 4.5L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function LogoMark({ size = 32 }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span dangerouslySetInnerHTML={{ __html: logo(size) }} />;
  }
  return (
    <img
      src={`/assets/fluxo-icon.png?v=${ASSET_VERSION}`}
      alt=""
      aria-hidden="true"
      className="fluxo-icon"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

export function Logo({ size = 32, className = 'logo' }) {
  return (
    <div className={className}>
      <LogoMark size={size} />
      <span className="logo-word" style={{ fontSize: Math.round(size * 0.68) }}>
        Fluxo
      </span>
    </div>
  );
}

export function TagText({ text, links = false }) {
  const { data, actions } = useApp();
  const personIdOf = (name) => {
    const value = String(name || '').toLowerCase();
    if (!value) return null;
    if (data?.me?.handle?.toLowerCase() === value) return 'me';
    const person = Object.values(data?.users || {}).find(
      (item) =>
        (item.handle || '').toLowerCase() === value ||
        (item.name || '').toLowerCase() === value
    );
    return person?.id || null;
  };

  return (
    <>
      {splitTags(text, links).map((part, i) => {
        if (part.url) {
          return (
            <a
              className="chat-link"
              href={part.href}
              key={i}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              {part.url}
            </a>
          );
        }
        if (part.tag) {
          return (
            <span className="tag" key={i}>
              #{part.tag}
            </span>
          );
        }
        if (part.mention) {
          const id = personIdOf(part.mention);
          if (!id) {
            return (
              <span className="tag" key={i}>
                @{part.mention}
              </span>
            );
          }
          return (
            <button
              type="button"
              className="mention"
              key={i}
              onClick={(event) => {
                event.stopPropagation();
                actions.openUser(id);
              }}
            >
              @{part.mention}
            </button>
          );
        }
        return <span key={i}>{renderWithEmojis(part.text)}</span>;
      })}
    </>
  );
}
