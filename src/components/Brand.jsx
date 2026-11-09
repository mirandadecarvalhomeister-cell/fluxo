import { useState } from 'react';
import { logo } from '../lib/art';
import { splitTags } from '../lib/utils';

const ASSET_VERSION = '2';

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
      onError={() => setFailed(true)}
    />
  );
}

export function Logo({ size = 32, className = 'logo' }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <div className={className}>
        <img
          src={`/assets/fluxo-logo.png?v=${ASSET_VERSION}`}
          alt="FluXo"
          className="fluxo-logo"
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
  return (
    <>
      {splitTags(text).map((part, i) =>
        part.tag ? (
          <span className="tag" key={i}>
            #{part.tag}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
