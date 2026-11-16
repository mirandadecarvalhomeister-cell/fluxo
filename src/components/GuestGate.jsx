import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Logo } from './Brand';

const GUEST_SECONDS = 10;

export default function GuestGate() {
  const { actions } = useApp();
  const [left, setLeft] = useState(GUEST_SECONDS);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (expired) return undefined;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        GUEST_SECONDS - Math.floor((Date.now() - start) / 1000)
      );
      setLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        setExpired(true);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [expired]);

  const goAuth = (tab) => {
    actions.setAuthTab(tab);
    actions.exitGuest();
  };

  if (!expired) {
    return (
      <div className="guest-hint" role="status" aria-live="polite">
        <span className="guest-hint-dot" />
        Você está explorando como visitante · <strong>{left}s</strong>
      </div>
    );
  }

  return (
    <div className="guest-overlay" role="dialog" aria-modal="true" aria-labelledby="guest-title">
      <div className="guest-card">
        <Logo size={40} />
        <h2 id="guest-title">Crie uma conta para continuar</h2>
        <p>
          Você conheceu um pouco do Fluxo. Para continuar explorando, conversar e
          publicar, entre na sua conta ou crie uma — é grátis e leva segundos.
        </p>
        <div className="guest-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => goAuth('up')}
          >
            Criar conta grátis
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => goAuth('in')}
          >
            Já tenho conta
          </button>
        </div>
      </div>
    </div>
  );
}
