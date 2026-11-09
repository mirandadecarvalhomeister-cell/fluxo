import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Logo } from './Brand';
import { Icon } from './Icon';

export default function ResetPassword() {
  const { actions } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Nova senha · FluXo';
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    const message = await actions.finishRecovery({ password, confirm });
    setError(message || '');
    setBusy(false);
  }

  return (
    <div className="reset-page">
      <section className="card authcard">
        <Logo size={34} />
        <h2 className="auth-title">Definir nova senha</h2>
        <p className="auth-sub">
          Escolha uma nova senha para sua conta. Use pelo menos 8 caracteres.
        </p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="npass">Nova senha</label>
            <div className="passwrap">
              <input
                className="in"
                id="npass"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="passtoggle"
                aria-label={showPass ? 'Ocultar senha' : 'Exibir senha'}
                aria-pressed={showPass}
                title={showPass ? 'Ocultar senha' : 'Exibir senha'}
                onClick={() => setShowPass((v) => !v)}
              >
                <Icon name={showPass ? 'eyeoff' : 'eye'} />
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="nconfirm">Confirmar senha</label>
            <input
              className="in"
              id="nconfirm"
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <p className="err" role="alert">
            {error}
          </p>
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
        <button className="link-btn block-link" type="button" onClick={actions.cancelRecovery}>
          Voltar para o login
        </button>
      </section>
    </div>
  );
}
