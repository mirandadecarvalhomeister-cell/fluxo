import { useState } from 'react';
import { logo } from '../lib/art';
import { splitTags } from '../lib/utils';
import { useApp } from '../store/AppContext';

const ASSET_VERSION = '5';

export function LogoMark({ size = 32 }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span dangerouslySetInnerHTML={{ __html: logo(size) }} />;
  }
  return (
    <img
      src={`/assets/fluxo-icon.png?v=${ASSET_VERSION}`}
      alt="FluXo"
      className="fluxo-icon"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

export function Logo({ size = 32, className = 'logo' }) {
  const [failed, setFailed] = useState(false);
  const width = Math.round(size * 3.2);
  if (!failed) {
    return (
      <div className={className}>
        <img
          src={`/assets/fluxo-logo.png?v=${ASSET_VERSION}`}
          alt="FluXo"
          className="fluxo-logo logo-for-dark"
          width={width}
          style={{ width }}
          onError={() => setFailed(true)}
        />
        <img
          src={`/assets/fluxo-logo-dark.png?v=${ASSET_VERSION}`}
          alt="FluXo"
          className="fluxo-logo logo-for-light"
          width={width}
          style={{ width }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className={className}>
      <LogoMark size={size} />
      <span>FluXo</span>
    </div>
  );
}

export function TagText({ text }) {
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
      {splitTags(text).map((part, i) => {
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
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}
