import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
import { animatedEmojiUrl } from '../lib/animatedEmoji';

/** Renderiza um emoji animado do Noto; cai para o Unicode se não houver assets. */
export default function AnimatedEmoji({ emoji, size = 44, autoplay = true, loop = false, className = '' }) {
  const hostRef = useRef(null);
  const animRef = useRef(null);
  const url = animatedEmojiUrl(emoji);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url || !hostRef.current || failed) return undefined;
    let alive = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no animation'))))
      .then((data) => {
        if (!alive || !hostRef.current) return;
        animRef.current = lottie.loadAnimation({
          container: hostRef.current,
          renderer: 'svg',
          loop: loop && !reduce,
          autoplay: autoplay && !reduce,
          animationData: data,
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        if (reduce) animRef.current.goToAndStop(0, true);
      })
      .catch(() => { if (alive) setFailed(true); });

    return () => {
      alive = false;
      if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    };
  }, [url, autoplay, loop, failed]);

  const replay = () => {
    if (animRef.current) animRef.current.goToAndPlay(0, true);
  };

  if (!url || failed) {
    return <span className={`animated-emoji-fallback ${className}`} style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  }

  return (
    <span
      ref={hostRef}
      className={`animated-emoji ${className}`}
      style={{ width: size, height: size, display: 'inline-block', cursor: 'pointer' }}
      onClick={replay}
      role="img"
      aria-label={emoji}
    />
  );
}
