import React, { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { fmt, hm } from '../lib/utils';
import { art } from '../lib/art';
import { Avatar, LiveAvatar } from './Avatar';
import Empty from './Empty';
import { Icon } from './Icon';
import { Verified } from './Brand';
import Post from './Post';

const TABS = [
  ['publicacoes', 'Publicações', 'image'],
  ['conversas', 'Conversas', 'chat'],
  ['topics', 'Tópicos', 'mega'],
  ['galeria', 'Galeria', 'camera'],
  ['eventos', 'Eventos', 'clock'],
  ['classificados', 'Classificados', 'tag'],
  ['admin', 'Administração', 'shield'],
];

function personOf(data, id) {
  if (id === 'me') return data.me;
  return data.users?.[id] || { id, name: id.slice(0, 8) };
}

export default function CommunitySpace({ community, onAdmin }) {
  const { data, ui, actions } = useApp();
  const [tab, setTab] = useState('publicacoes');
  const extras = data.commExtras || { gallery: [], events: [], rsvps: [], classifieds: [] };
  const owner = community.owner === 'me';
  const mod = (community.mods || []).includes('me');
  const canManage = owner || mod;
  const uid = data.me?.id || 'me';

  const posts = (data.posts || []).filter((p) => p.communityId === community.id);
  const gallery = extras.gallery.filter((g) => g.community_id === community.id);
  const events = extras.events.filter((e) => e.community_id === community.id);
  const classifieds = extras.classifieds.filter((c) => c.community_id === community.id);
  const rsvps = extras.rsvps || [];
  const topics = [...(community.topics || [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const linkedChannels = (community.channelIds || [])
    .map((id) => (data.chans || []).find((c) => c.id === id))
    .filter(Boolean);

  const [gTitle, setGTitle] = useState('');
  const [gKind, setGKind] = useState('photo');
  const [gSrc, setGSrc] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [clTitle, setClTitle] = useState('');
  const [clCat, setClCat] = useState('venda');
  const [clDesc, setClDesc] = useState('');
  const [clPrice, setClPrice] = useState('');
  const [clContact, setClContact] = useState('');

  const canPost = community.joined || canManage;

  return (
    <div className="comm-space">
      <div className="comm-hero">
        <div className="comm-cover" style={{ backgroundImage: `url('${community.coverUrl || art(community.id, 900, 300)}')` }} />
        <div className="comm-identity">
          <Avatar user={personOf(data, community.owner)} size={56} />
          <div style={{ flex: 1 }}>
            <h2>{community.name} <Verified user={personOf(data, community.owner)} /></h2>
            <p className="muted sm">{community.description || 'Comunidade no Fluxo'}</p>
          </div>
          <button className={`btn ${community.joined ? 'ghost' : 'primary'}`} onClick={() => actions.toggleComm(community.id)}>
            {community.joined ? 'Sair' : (community.private ? 'Solicitar entrada' : 'Entrar')}
          </button>
          {onAdmin && canManage ? (
            <button className="btn tonal" onClick={onAdmin}><Icon name="shield" /> Admin</button>
          ) : null}
        </div>
      </div>

      <div className="comm-tabs">
        {TABS.map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            <Icon name={icon} /> {label}
          </button>
        ))}
      </div>

      <div className="comm-body">
        {tab === 'publicacoes' ? (
          posts.length ? (
            <div className="comm-posts">
              {posts.map((post) => <Post key={post.id} post={post} />)}
            </div>
          ) : (
            <Empty title="Nenhuma publicação" text="As publicações desta comunidade aparecem aqui e podem ser compartilhadas no feed principal." />
          )
        ) : null}

        {tab === 'conversas' ? (
          <div className="comm-section">
            {linkedChannels.length ? linkedChannels.map((channel) => (
              <button key={channel.id} className="comm-channel" onClick={() => actions.openRoom(channel.id)}>
                <Icon name="hash" /> <span className="grow">{channel.name}</span>
                <span className="muted sm">{fmt(channel.followers || 0)} membros</span>
              </button>
            )) : (
              <Empty title="Sem conversas" text="Administradores podem vincular canais para conversas e discussões." />
            )}
          </div>
        ) : null}

        {tab === 'topics' ? (
          <div className="comm-section">
            {topics.length ? topics.map((t) => (
              <div key={t.id} className="comm-topic">
                <div className="grow">
                  {t.pinned ? <span className="pill acc"><Icon name="mega" /> Fixado</span> : null}
                  <b>{t.title}</b>
                  <div className="muted sm">{personOf(data, t.authorId).name} · {fmt(t.replies || 0)} respostas</div>
                </div>
                {canManage ? (
                  <button className="icon-btn" title={t.pinned ? 'Desafixar' : 'Fixar'} onClick={() => actions.pinCommunityTopic(community.id, t.id)}>
                    <Icon name="mega" />
                  </button>
                ) : null}
              </div>
            )) : <Empty title="Nenhum tópico" text="Crie tópicos para organizar discussões." />}
          </div>
        ) : null}

        {tab === 'galeria' ? (
          <div className="comm-section">
            {canPost ? (
              <form className="comm-form" onSubmit={(e) => {
                e.preventDefault();
                if (!gTitle.trim() || !gSrc.trim()) return;
                actions.addCommunityGalleryItem({
                  community_id: community.id, kind: gKind, src: gSrc.trim(), title: gTitle.trim(),
                });
                setGTitle(''); setGSrc('');
              }}>
                <input className="in" placeholder="Título da mídia" value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
                <select className="in" value={gKind} onChange={(e) => setGKind(e.target.value)}>
                  <option value="photo">Foto</option>
                  <option value="video">Vídeo</option>
                </select>
                <input className="in" placeholder="URL da mídia (imagem ou vídeo)" value={gSrc} onChange={(e) => setGSrc(e.target.value)} />
                <button className="btn primary" type="submit"><Icon name="plus" /> Adicionar</button>
              </form>
            ) : null}
            {gallery.length ? (
              <div className="comm-gallery">
                {gallery.map((g) => (
                  <div key={g.id} className="comm-gallery-item">
                    {g.kind === 'video' ? (
                      <video src={g.src} controls preload="metadata" />
                    ) : (
                      <img src={g.src} alt={g.title || 'Mídia'} loading="lazy" />
                    )}
                    <div className="comm-gallery-meta">
                      <b className="ell">{g.title || 'Sem título'}</b>
                      <span className="muted sm">{personOf(data, g.author_id).name}</span>
                      {(g.author_id === uid || canManage) ? (
                        <button className="icon-btn danger" onClick={() => actions.removeCommunityGalleryItem(g.id)}><Icon name="trash" /></button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty title="Galeria vazia" text="Compartilhe fotos e vídeos com os membros." />}
          </div>
        ) : null}

        {tab === 'eventos' ? (
          <div className="comm-section">
            {canPost ? (
              <form className="comm-form" onSubmit={(e) => {
                e.preventDefault();
                if (!evTitle.trim() || !evDate) return;
                actions.addCommunityEventEntry({
                  community_id: community.id, title: evTitle.trim(),
                  starts_at: new Date(evDate).toISOString(), description: evDesc.trim(),
                });
                setEvTitle(''); setEvDate(''); setEvDesc('');
              }}>
                <input className="in" placeholder="Nome do evento" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
                <input className="in" type="datetime-local" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                <input className="in" placeholder="Descrição / local" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
                <button className="btn primary" type="submit"><Icon name="plus" /> Criar evento</button>
              </form>
            ) : null}
            {events.length ? events.map((ev) => {
              const going = rsvps.some((r) => r.event_id === ev.id && r.user_id === uid);
              const count = rsvps.filter((r) => r.event_id === ev.id).length;
              return (
                <div key={ev.id} className="comm-event">
                  <div className="comm-event-date"><b>{new Date(ev.starts_at).getDate()}</b><span>{new Date(ev.starts_at).toLocaleString('pt-BR', { month: 'short' })}</span></div>
                  <div className="grow">
                    <b>{ev.title}</b>
                    <div className="muted sm">{hm(ev.starts_at)} · {count} confirmado(s)</div>
                    {ev.description ? <p className="muted sm">{ev.description}</p> : null}
                  </div>
                  <button className={`btn ${going ? 'ghost' : 'primary'}`} onClick={() => actions.toggleCommunityRsvpEntry(ev.id)}>
                    {going ? 'Cancelar' : 'Participar'}
                  </button>
                  {(ev.created_by === uid || canManage) ? (
                    <button className="icon-btn danger" onClick={() => actions.removeCommunityEventEntry(ev.id)}><Icon name="trash" /></button>
                  ) : null}
                </div>
              );
            }) : <Empty title="Nenhum evento" text="Crie eventos e permita confirmação de presença." />}
          </div>
        ) : null}

        {tab === 'classificados' ? (
          <div className="comm-section">
            {canPost ? (
              <form className="comm-form" onSubmit={(e) => {
                e.preventDefault();
                if (!clTitle.trim()) return;
                actions.addCommunityClassifiedEntry({
                  community_id: community.id, title: clTitle.trim(), category: clCat,
                  description: clDesc.trim(), price: clPrice.trim(), contact: clContact.trim(), images: [],
                });
                setClTitle(''); setClDesc(''); setClPrice(''); setClContact('');
              }}>
                <input className="in" placeholder="Título do anúncio" value={clTitle} onChange={(e) => setClTitle(e.target.value)} />
                <select className="in" value={clCat} onChange={(e) => setClCat(e.target.value)}>
                  <option value="venda">Venda</option>
                  <option value="servico">Serviço</option>
                  <option value="trabalho">Trabalho</option>
                  <option value="parceria">Parceria</option>
                  <option value="outros">Outros</option>
                </select>
                <input className="in" placeholder="Descrição" value={clDesc} onChange={(e) => setClDesc(e.target.value)} />
                <input className="in" placeholder="Preço (opcional)" value={clPrice} onChange={(e) => setClPrice(e.target.value)} />
                <input className="in" placeholder="Contato" value={clContact} onChange={(e) => setClContact(e.target.value)} />
                <button className="btn primary" type="submit"><Icon name="plus" /> Publicar anúncio</button>
              </form>
            ) : null}
            {classifieds.length ? classifieds.map((c) => (
              <div key={c.id} className="comm-classified">
                <div className="grow">
                  <span className="pill">{c.category}</span>
                  <b>{c.title}</b>
                  {c.description ? <p className="muted sm">{c.description}</p> : null}
                  <div className="muted sm">{c.price ? `Preço: ${c.price}` : ''} {c.contact ? `· ${c.contact}` : ''}</div>
                </div>
                {(c.author_id === uid || canManage) ? (
                  <>
                    <button className="icon-btn" title="Editar" onClick={() => {
                      const title = window.prompt('Novo título', c.title);
                      if (title && title.trim()) actions.editCommunityClassifiedEntry(c.id, { title: title.trim() });
                    }}><Icon name="edit" /></button>
                    <button className="icon-btn danger" onClick={() => actions.removeCommunityClassifiedEntry(c.id)}><Icon name="trash" /></button>
                  </>
                ) : null}
              </div>
            )) : <Empty title="Nenhum anúncio" text="Venda, divulgue serviços ou encontre oportunidades." />}
          </div>
        ) : null}

        {tab === 'admin' && canManage ? (
          <div className="comm-section">
            <p className="muted">Gerencie membros, moderadores, privacidade, regras e canais vinculados desta comunidade.</p>
            <button className="btn primary" onClick={onAdmin}><Icon name="shield" /> Abrir painel de administração</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
