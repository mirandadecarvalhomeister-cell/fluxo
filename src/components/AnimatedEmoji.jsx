import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
import { animatedEmojiUrl, getEmojiAnimation } from '../lib/animatedEmoji';

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
    const cached = getEmojiAnimation(emoji);

    const mount = (data) => {
      if (!alive || !hostRef.current || !data) return;
      animRef.current = lottie.loadAnimation({
        container: hostRef.current,
        renderer: 'svg',
        loop: loop && !reduce,
        autoplay: autoplay && !reduce,
        animationData: data,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
      if (reduce) animRef.current.goToAndStop(0, true);
    };

    if (cached) {
      mount(cached);
    } else {
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no animation'))))
        .then(mount)
        .catch(() => { if (alive) setFailed(true); });
    }

    return () => {
      alive = false;
      if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    };
  }, [emoji, url, autoplay, loop, failed]);

  const replay = () => { if (animRef.current) animRef.current.goToAndPlay(0, true); };

  if (!url || failed) {
    return <span className={`animated-emoji-fallback ${className}`} style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  }

  return (
    <span
      ref={hostRef}
      className={`animated-emoji ${className}`}
      style={{ width: size, height: size, display: 'inline-block', cursor: 'pointer', verticalAlign: 'middle' }}
      onClick={replay}
      role="img"
      aria-label={emoji}
    />
  );
}
