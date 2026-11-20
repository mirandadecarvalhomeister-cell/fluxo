import { useCallback, useEffect, useRef, useState } from 'react';
import { createSignedMediaUrl } from '../lib/remote';
import { Icon } from './Icon';

const EXPIRES_IN = 3600;

/**
 * Renderiza foto/vídeo armazenado no bucket privado da comunidade.
 * A URL assinada é gerada sob demanda e renovada se expirar.
 */
export default function PrivateMedia({
  path,
  bucket = 'community-private',
  kind = 'photo',
  alt = 'Mídia da comunidade',
  className = '',
  style,
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const signed = await createSignedMediaUrl(bucket, path, EXPIRES_IN);
    if (!mountedRef.current) return;
    if (signed) {
      setUrl(signed);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [bucket, path]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  if (!url) {
    return (
      <div className={`private-media ${className}`.trim()} style={style} role="status">
        <Icon name={failed ? 'eyeoff' : 'image'} />
        <span>{failed ? 'Mídia indisponível' : 'Carregando mídia…'}</span>
        {failed ? <button type="button" onClick={() => void load()}>Tentar novamente</button> : null}
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <video
        className={className}
        style={style}
        src={url}
        controls
        preload="metadata"
        onError={() => void load()}
      />
    );
  }
  return (
    <img
      className={className}
      style={style}
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => void load()}
    />
  );
}
