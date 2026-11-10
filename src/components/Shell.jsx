import { useEffect } from 'react';
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

  const themeIcon = ui.theme === 'dark' ? 'sun' : 'moon';

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
            <button className="icon-btn" onClick={actions.toggleTheme} aria-label="Alternar tema">
              <Icon name={themeIcon} />
            </button>
            <button className="icon-btn" onClick={actions.openSettings} aria-label="Configurações">
              <Icon name="settings" />
            </button>
            <button className="icon-btn" onClick={actions.logout} aria-label="Sair">
              <Icon name="logout" />
            </button>
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
              <button className="icon-btn" onClick={actions.toggleTheme} aria-label="Alternar tema">
                <Icon name={themeIcon} />
              </button>
              <button className="icon-btn" onClick={actions.openSettings} aria-label="Configurações">
                <Icon name="settings" />
              </button>
              <button className="icon-btn" onClick={actions.logout} aria-label="Sair">
                <Icon name="logout" />
              </button>
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
