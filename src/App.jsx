import React from 'react';
import { useApp } from './store/AppContext';
import Auth from './components/Auth';
import { Logo } from './components/Brand';
import GuestGate from './components/GuestGate';
import IconSprite from './components/Icon';
import ModalHost from './components/ModalHost';
import ClipsViewer from './components/ClipsViewer';
import ResetPassword from './components/ResetPassword';
import Shell from './components/Shell';
import Toast from './components/Toast';
import { preloadEmojiAnimations } from './lib/animatedEmoji';

export default function App() {
  const { data, ready, recovery, guest } = useApp();

  React.useEffect(() => { preloadEmojiAnimations(); }, []);

  return (
    <>
      <IconSprite />
      {!ready ? (
        <div className="boot" role="status" aria-live="polite">
          <Logo size={44} />
          <span className="muted sm">Entrando no fluxo…</span>
        </div>
      ) : recovery ? (
        <ResetPassword />
      ) : data ? (
        <>
          <Shell />
          <ModalHost />
          <ClipsViewer />
          {guest ? <GuestGate /> : null}
        </>
      ) : (
        <Auth />
      )}
      <Toast />
    </>
  );
}
