import { useCallback, useEffect, useRef, useState } from 'react';
import { createSignedMediaUrl } from '../lib/remote';
import { Icon } from './Icon';
import AudioPlayer from './AudioPlayer';

const EXPIRES_IN = 3600;

/**
 * Reproduz áudio guardado no bucket privado das comunidades.
 * A URL assinada é gerada sob demanda (1h) e renovada quando expira ou falha,
 * para que o arquivo nunca precise ser exposto publicamente.
 */
export default function PrivateAudio({ path, bucket = 'community-private', sender, duration, waves, className }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState('loading');
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setState('loading');
    const signed = await createSignedMediaUrl(bucket, path, EXPIRES_IN);
    if (!mountedRef.current) return;
    if (signed) {
      setUrl(signed);
      setState('ready');
    } else {
      setState('error');
    }
  }, [bucket, path]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  if (state !== 'ready' || !url) {
    return (
      <div className={`private-audio ${className || ''}`.trim()} role="status">
        <Icon name="mic" />
        <span>{state === 'error' ? 'Áudio indisponível' : 'Carregando áudio…'}</span>
        {state === 'error' ? (
          <button type="button" onClick={() => void load()}>Tentar novamente</button>
        ) : null}
      </div>
    );
  }

  return (
    <AudioPlayer
      src={url}
      duration={duration}
      waves={waves}
      sender={sender}
      className={className}
      onError={() => void load()}
    />
  );
}
