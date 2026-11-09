import { useApp } from './store/AppContext';
import Auth from './components/Auth';
import { Logo } from './components/Brand';
import IconSprite from './components/Icon';
import ModalHost from './components/ModalHost';
import ResetPassword from './components/ResetPassword';
import Shell from './components/Shell';
import Toast from './components/Toast';

export default function App() {
  const { data, ready, recovery } = useApp();

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
        </>
      ) : (
        <Auth />
      )}
      <Toast />
    </>
  );
}
