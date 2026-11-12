import { useEffect, useState } from 'react';
import { PAL } from '../lib/art';
import { useApp } from '../store/AppContext';
import { Logo, LogoMark } from './Brand';
import { Icon } from './Icon';

const GLOGO = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
  </svg>
);

export default function Auth() {
  const { ui, actions } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState('');
  const up = ui.authTab === 'up';

  useEffect(() => {
    setError('');
    setConfirm('');
    setForgot(false);
    setNotice('');
  }, [ui.authTab]);

  useEffect(() => {
    document.title = 'Entrar · FluXo';
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    const params = new URLSearchParams(raw);
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
    const type = params.get('type');
    const code = params.get('error_code');
    const description = params.get('error_description');
    const oauthError = params.get('error');
    if (!code && !description && !oauthError) return;

    // Só entra no fluxo de recuperação quando o retorno é realmente do link
    // de senha. Erros do Google/OAuth não podem abrir a tela de recuperação.
    const recovery =
      type === 'recovery' ||
      code === 'otp_expired' ||
      /recovery/i.test(params.get('error_uri') || '');

    if (recovery) {
      const expired =
        code === 'otp_expired' || /expired|invalid/i.test(description || '');
      setError(
        expired
          ? 'O link expirou ou já foi usado. Solicite um novo link abaixo.'
          : 'Não foi possível validar o link. Solicite um novo link abaixo.'
      );
      setForgot(true);
    } else {
      const reason = `${code || ''} ${description || ''} ${oauthError || ''}`;
      setError(
        /access_denied|cancel/i.test(reason)
          ? 'Login com Google cancelado.'
          : /client secret|external code|invalid_client/i.test(reason)
            ? 'O login com Google está indisponível no momento. Tente novamente mais tarde.'
            : 'Não foi possível concluir o login. Tente novamente.'
      );
      setForgot(false);
    }
    setNotice('');
    history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const message = await actions.submitAuth({
      tab: ui.authTab,
      name,
      email,
      password,
      confirm,
    });
    setError(message || '');
    setBusy(false);
  }

  async function sendReset(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const message = await actions.requestPasswordReset(email);
    setError(message || '');
    if (!message) {
      setNotice('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
    }
    setBusy(false);
  }

  const orbs = Array.from({ length: 8 }, (_, i) => {
    const [a, b] = PAL[i % PAL.length];
    return (
      <i
        key={i}
        style={{ '--i': i, '--a': a, '--b': b, '--z': `${i % 2 ? 40 : 54}px` }}
      />
    );
  });

  return (
    <div className="auth">
      <section className="brand">
        <Logo size={40} />
        <h1>Entre no fluxo.</h1>
        <p className="lead">
          Feed para o que você vive, comunidades para o que você ama, conversas e lives
          com quem você segue. Tudo no mesmo fluxo.
        </p>
        <div className="orbit" aria-hidden="true">
          <div className="spin">{orbs}</div>
          <div className="core">
            <LogoMark size={46} />
          </div>
        </div>
      </section>

      <section className="card authcard">
        {forgot ? (
          <div className="forgot">
            <h2 className="auth-title">Recuperar senha</h2>
            <p className="auth-sub">
              Informe o e-mail da sua conta e enviaremos um link para você criar uma nova
              senha.
            </p>
            <form onSubmit={sendReset} noValidate>
              <div className="field">
                <label htmlFor="femail">E-mail</label>
                <input
                  className="in"
                  id="femail"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <p className="err" role="alert">
                {error}
              </p>
              {notice && (
                <p className="ok-msg" role="status">
                  {notice}
                </p>
              )}
              <button className="btn primary block" type="submit" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar link de redefinição'}
              </button>
            </form>
            <button
              className="link-btn block-link"
              type="button"
              onClick={() => {
                setForgot(false);
                setError('');
                setNotice('');
              }}
            >
              Voltar para entrar
            </button>
          </div>
        ) : (
          <>
          <div className="seg" role="group">
          <button
            type="button"
            className={up ? '' : 'on'}
            onClick={() => actions.setAuthTab('in')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={up ? 'on' : ''}
            onClick={() => actions.setAuthTab('up')}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          {up && (
            <div className="field">
              <label htmlFor="aname">Seu nome</label>
              <input
                className="in"
                id="aname"
                type="text"
                autoComplete="name"
                placeholder="Como você quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="aemail">E-mail</label>
            <input
              className="in"
              id="aemail"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="apass">Senha</label>
            <div className="passwrap">
              <input
                className="in"
                id="apass"
                type={showPass ? 'text' : 'password'}
                autoComplete={up ? 'new-password' : 'current-password'}
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
          {up && (
            <div className="field">
              <label htmlFor="aconfirm">Confirmar senha</label>
              <input
                className="in"
                id="aconfirm"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          )}
          {!up && (
            <div className="auth-links">
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setForgot(true);
                  setError('');
                  setNotice('');
                }}
              >
                Esqueceu sua senha?
              </button>
            </div>
          )}
          <p className="err" role="alert">
            {error}
          </p>
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : up ? 'Criar minha conta' : 'Entrar'}
          </button>
        </form>

        <div className="or">
          <span>ou</span>
        </div>
        <button className="btn ghost block" type="button" onClick={actions.google}>
          {GLOGO} Continuar com Google
        </button>
        <p className="fine">
          {import.meta.env.VITE_SUPABASE_URL
            ? 'Autenticação e dados salvos no Supabase.'
            : 'Versão de demonstração: contas e dados ficam apenas neste navegador.'}
        </p>
        </>
        )}
      </section>
    </div>
  );
}
