import { useEffect, useState } from 'react';

// Abaixo disso a navegação é tratada como "app" (celular/PWA);
// acima, o site segue no layout de desktop.
const QUERY = '(max-width: 720px)';

export function useCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const onChange = (event) => setCompact(event.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener?.(onChange);
    };
  }, []);

  return compact;
}

export default useCompact;
