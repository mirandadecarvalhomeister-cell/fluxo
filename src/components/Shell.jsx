import { useEffect, useRef } from 'react';
import { unreadNotifications, unreadTotal } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Logo } from './Brand';
import Connections from './Connections';
import Feed from './Feed';
import { Icon } from './Icon';
import Messages from './Messages';
import Profile from './Profile';
import SidePanel from './SidePanel';

const NAV = [
  ['feed', 'Feed', 'feed'],
  ['perfil', 'Perfil', 'user'],
  ['mensagens', 'Mensagens', 'chat'],
  ['conexoes', 'Conexões', 'orbit'],
];

const TITLES = {
  feed: 'Feed',
  perfil: 'Perfil',
  mensagens: 'Mensagens',
  conexoes: 'Conexões',
};

function AccountMenu({ compact = false }) {
  const { data, ui, actions } = useApp();
  const ref = useRef(null);
  const dark = ui.theme === 'dark';
  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  useEffect(() => {
    const onDocClick = (event) => {
      if (ref.current?.open && !ref.current.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details
      className={`post-menu account-menu${compact ? ' compact' : ''}`}
      ref={ref}
    >
      <summary
        className="account-trigger"
        aria-label="Conta, tema e configurações"
        title="Conta e preferências"
      >
        <Avatar user={data.me} size={compact ? 32 : 34} />
        <span className="account-gear">
          <Icon name="settings" />
        </span>
      </summary>
      <div className="menu-pop">
        <div className="account-head">
          <Avatar user={data.me} size={36} />
          <div>
            <b className="ell">{data.me.name}</b>
            <span className="muted sm ell">@{data.me.handle}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            actions.toggleTheme();
            close();
          }}
        >
          <Icon name={dark ? 'sun' : 'moon'} />
          {dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            actions.openSettings();
          }}
        >
          <Icon name="settings" /> Configurações
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            close();
            actions.logout();
          }}
        >
          <Icon name="logout" /> Sair
        </button>
      </div>
    </details>
  );
}

export default function Shell() {
  const { data, ui, actions, online } = useApp();
  const unread = unreadTotal(data);
  const notifUnread = unreadNotifications(data, ui.notifSeen || 0).length;
  const notifLabel = notifUnread
    ? `Notificações (${notifUnread} ${notifUnread === 1 ? 'nova' : 'novas'})`
    : 'Notificações';
  const bellBtn = (
    <button className="icon-btn" onClick={actions.openNotifications} aria-label={notifLabel} title={notifLabel}>
      <Icon name="bell" />
      {notifUnread ? (
        <span className="bubble">{notifUnread > 9 ? '9+' : notifUnread}</span>
      ) : null}
    </button>
  );

  useEffect(() => {
    document.title = `${TITLES[ui.route] || 'FluXo'} · FluXo`;
  }, [ui.route]);

  useEffect(() => {
    const onKey = (event) => {
      const el = event.target;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (event.key === '/' || combo) {
        event.preventDefault();
        actions.openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const navLink = ([key, label, icon]) => (
    <a
      key={key}
      href={`#${key}`}
      className={ui.route === key ? 'on' : ''}
      aria-current={ui.route === key ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        actions.go(key);
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {key === 'mensagens' && unread ? <span className="badge">{unread}</span> : null}
    </a>
  );

  const compose = () => {
    if (ui.route !== 'feed') actions.go('feed');
    setTimeout(() => document.getElementById('ctext')?.focus(), 60);
  };

  return (
    <>
      <a
        className="skip"
        href="#view"
        onClick={(event) => {
          event.preventDefault();
          const view = document.getElementById('view');
          view?.focus();
          view?.scrollIntoView({ block: 'start' });
        }}
      >
        Pular para o conteúdo
      </a>
      {!online && (
        <div className="netbanner" role="status">
          Você está offline. As publicações salvas continuam disponíveis.
        </div>
      )}
      <div className={`app ${ui.route === 'feed' ? 'has-side' : ''}`}>
        <aside className="rail" aria-label="Navegação principal">
          <Logo size={34} />
          <button
            className="search-trigger"
            onClick={actions.openSearch}
            aria-label="Buscar no FluXo (atalho /)"
          >
            <Icon name="search" />
            <span>Buscar</span>
            <kbd>/</kbd>
          </button>
          <nav className="nav">{NAV.map(navLink)}</nav>
          <button className="btn primary" style={{ margin: '10px 0 0' }} onClick={compose}>
            Nova publicação
          </button>
          <div className="spacer" />
          <a
            className="me-mini"
            href="#perfil"
            onClick={(event) => {
              event.preventDefault();
              actions.go('perfil');
            }}
          >
            <Avatar user={data.me} size={38} />
            <div className="grow">
              <b className="ell" style={{ display: 'block' }}>
                {data.me.name}
              </b>
              <span className="muted sm ell" style={{ display: 'block' }}>
                @{data.me.handle}
              </span>
            </div>
          </a>
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}>
            {bellBtn}
            <AccountMenu />
          </div>
        </aside>

        <div>
          <div className="mobtop">
            <Logo size={30} />
            <div className="row">
              <button className="icon-btn" onClick={actions.openSearch} aria-label="Buscar">
                <Icon name="search" />
              </button>
              {bellBtn}
              <AccountMenu compact />
            </div>
          </div>
          <main id="view" tabIndex={-1}>
            {ui.route === 'feed' && <Feed />}
            {ui.route === 'perfil' && <Profile />}
            {ui.route === 'mensagens' && <Messages />}
            {ui.route === 'conexoes' && <Connections />}
          </main>
        </div>

        <aside id="side" hidden={ui.route !== 'feed'}>
          {ui.route === 'feed' && <SidePanel />}
        </aside>
      </div>
      <nav className="tabbar" aria-label="Navegação">
        {NAV.map(navLink)}
      </nav>
    </>
  );
}
