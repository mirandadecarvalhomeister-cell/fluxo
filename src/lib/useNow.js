import { useEffect, useState } from 'react';

// Relógio compartilhado para contagens regressivas. Só cria o intervalo quando
// existe algo programado/ao vivo, evitando re-renderizar o feed à toa.
export function useNow(active = true, interval = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [active, interval]);

  return now;
}
