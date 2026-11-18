import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { fmt, hm } from '../lib/utils';
import { art } from '../lib/art';
import { mediaOf } from '../lib/media';
import { isLiveKitEnabled } from '../lib/livekit';
import { Avatar, LiveAvatar } from './Avatar';
import AnimatedEmoji from './AnimatedEmoji';
import Empty from './Empty';
import { Icon } from './Icon';
import { Verified } from './Brand';
import Post from './Post';

const LiveStage = lazy(() => import('./LiveStage'));

const NAV = [
  ['publicacoes', 'Publicações', 'chat'],
  ['visao', 'Visão geral', 'spark'],
  ['comunicados', 'Comunicados', 'mega'],
  ['galeria', 'Galeria', 'camera'],
  ['enquetes', 'Enquetes', 'chart'],
  ['eventos', 'Eventos', 'clock'],
  ['classificados', 'Classificados', 'tag'],
  ['membros', 'Membros', 'users'],
  ['admin', 'Administração', 'shield'],
];

const QUICK_EMOTES = ['❤️', '🔥', '👏', '😂', '🎉', '👍', '💜', '🚀'];

function personOf(data, id) {
  if (id === 'me') return data.me;
  return data.users?.[id] || { id, name: String(id || '').slice(0, 8) };
}

// Composer da comunidade: comunicação livre com texto, áudio, fotos e vídeos.
function CommunityComposer({ community, canPost }) {
  const { ui, actions } = useApp();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const media = ui.draft?.media || [];

  function submit(event) {
    event.preventDefault();
    if (!text.trim() && !media.length) return;
    actions.publish(text, community.id);
    setText('');
    actions.resetDraft();
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (type) => MediaRecorder.isTypeSupported?.(type)
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
        actions.attachMedia([file]);
        stream.getTracks().forEach((track) => track.stop());
        recRef.current = null;
      };
      recorder.start();
      recRef.current = recorder;
      setRecording(true);
    } catch {
      actions.notify?.('Não foi possível acessar o microfone.');
      setRecording(false);
    }
  }

  if (!canPost) {
    return (
      <div className="card comm-compose locked">
        <Icon name="lock" />
        <span>Entre na comunidade para participar das conversas.</span>
      </div>
    );
  }

  return (
    <form className="card comm-compose" onSubmit={submit}>
      <textarea
        className="in comm-compose-text"
        rows={2}
        maxLength={600}
        placeholder={`Escreva para ${community.name}…`}
        aria-label="Escrever na comunidade"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="comm-compose-emotes" aria-label="Emojis rápidos">
        {QUICK_EMOTES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            title={`Inserir ${emoji}`}
            onClick={() => setText((value) => value + emoji)}
          >
            <AnimatedEmoji emoji={emoji} size={22} />
          </button>
        ))}
      </div>
      {media.length ? (
        <div className="comm-compose-media">
          {media.map((item, index) => (
            <div className="comm-compose-thumb" key={index}>
              {item.kind === 'audio' ? (
                <span><Icon name="mic" /> Áudio</span>
              ) : item.kind === 'video' ? (
                <video src={item.src} muted preload="metadata" />
              ) : (
                <img src={item.src} alt="Mídia selecionada" />
              )}
              <button
                type="button"
                aria-label="Remover mídia"
                onClick={() => actions.removeDraftMedia(index)}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="comm-compose-actions">
        <label className="btn ghost sm" htmlFor={`comm-media-${community.id}`}>
          <Icon name="camera" /> Fotos, vídeos e áudios
        </label>
        <input
          id={`comm-media-${community.id}`}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) actions.attachMedia(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className={`btn ${recording ? 'hot' : 'tonal'} sm`}
          onClick={toggleRecord}
          aria-pressed={recording}
        >
          <Icon name="mic" /> {recording ? 'Gravando… toque para parar' : 'Gravar áudio'}
        </button>
        <span className="grow" />
        <button className="btn primary sm" type="submit">
          <Icon name="send" /> Publicar
        </button>
      </div>
    </form>
  );
}

export default function CommunitySpace({ community, onAdmin }) {
  const { data, ui, actions } = useApp();
  const [tab, setTab] = useState('publicacoes');
  const extras = data.commExtras || { events: [], rsvps: [], classifieds: [] };

  const owner = community.owner === 'me';
  const mod = (community.mods || []).includes('me');
  const canManage = owner || mod;
  const uid = data.me?.id || 'me';

  const posts = useMemo(
    () => (data.posts || []).filter((p) => p.communityId === community.id),
    [data.posts, community.id]
  );
  // Galeria = somente mídias publicadas dentro das publicações da comunidade.
  const gallery = useMemo(
    () =>
      posts.flatMap((post) =>
        mediaOf(post)
          .filter((item) => item.src)
          .map((item, index) => ({
            id: `${post.id}-${index}`,
            kind: item.kind,
            src: item.src,
            title: String(post.text || '').trim().slice(0, 60) ||
              (item.kind === 'audio' ? 'Áudio' : item.kind === 'video' ? 'Vídeo' : 'Foto'),
            author_id: post.by,
            post_id: post.id,
            ts: post.ts,
          }))
      ),
    [posts]
  );
  const events = (extras.events || []).filter((e) => e.community_id === community.id);
  const classifieds = (extras.classifieds || []).filter((c) => c.community_id === community.id);
  const rsvps = extras.rsvps || [];
  const topics = [...(community.topics || [])].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned)
  );
  const members = community.members || [];
  const stageChannel = (community.channelIds || [])
    .map((id) => (data.chans || []).find((c) => c.id === id))
    .find((c) => c && c.kind === 'palco');

  const [topic, setTopic] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [clTitle, setClTitle] = useState('');
  const [clCat, setClCat] = useState('venda');
  const [clDesc, setClDesc] = useState('');
  const [clPrice, setClPrice] = useState('');
  const [clContact, setClContact] = useState('');

  // Comunidades abertas permitem que qualquer pessoa participe.
  const canPost = !community.private || community.joined || canManage;
  const backToFluxo = () => actions.go('conexoes');
  const navItems = NAV.filter(([key]) => key !== 'admin' || canManage);

  return (
    <div className="comm-page">
      <header className="comm-hero">
        <div
          className="comm-cover"
          style={{
            backgroundImage: `url('${community.coverUrl || art(community.id, 1200, 400)}')`,
          }}
        >
          <button className="btn ghost comm-back" onClick={backToFluxo}>
            <Icon name="back" /> Voltar ao Fluxo
          </button>
        </div>
        <div className="comm-hero-body">
          <div className="comm-icon">
            {community.iconUrl ? (
              <img src={community.iconUrl} alt="" />
            ) : (
              <Avatar user={personOf(data, community.owner)} size={72} />
            )}
          </div>
          <div className="comm-hero-info">
            <h1>
              {community.name} <Verified user={personOf(data, community.owner)} />
            </h1>
            <p className="muted">{community.desc || 'Comunidade no Fluxo'}</p>
            <div className="comm-pills">
              <span className="pill">
                {community.private ? <Icon name="lock" /> : <Icon name="globe" />}{' '}
                {community.private ? 'Privada' : 'Pública'}
              </span>
              <span className="pill">
                <Icon name="users" /> {fmt(members.length)} participantes
              </span>
              <span className="pill">
                <Icon name="image" /> {gallery.length} mídias
              </span>
              {stageChannel?.live ? (
                <span className="pill live">
                  <Icon name="radio" /> Ao vivo
                </span>
              ) : null}
            </div>
          </div>
          <div className="comm-hero-actions">
            <button
              className={`btn ${community.joined ? 'ghost' : 'primary'}`}
              onClick={() => actions.toggleComm(community.id)}
            >
              {community.joined
                ? 'Sair da comunidade'
                : community.private
                  ? 'Solicitar entrada'
                  : 'Entrar na comunidade'}
            </button>
            {canManage ? (
              <>
                <button
                  className="btn hot"
                  onClick={() =>
                    stageChannel?.live
                      ? actions.endCommunityLive(community.id)
                      : actions.startCommunityLive(community.id)
                  }
                >
                  <Icon name="radio" />
                  {stageChannel?.live ? 'Encerrar live' : 'Iniciar live'}
                </button>
                <button
                  className="btn tonal"
                  onClick={() => actions.openCommunityObs(community.id)}
                  title="Transmitir com OBS Studio"
                >
                  <Icon name="screen" /> OBS
                </button>
                <button className="btn tonal" onClick={() => setTab('admin')}>
                  <Icon name="shield" /> Administração
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {stageChannel?.live ? (
        <section className="card comm-stage">
          {stageChannel.livekit && isLiveKitEnabled ? (
            <Suspense
              fallback={
                <div className="stage lk-stage">
                  <div className="lk-status">
                    <span className="lk-dot" /> Carregando transmissão...
                  </div>
                </div>
              }
            >
              <LiveStage channel={stageChannel} owner={false} clock="" hearts={null} />
            </Suspense>
          ) : (
            <div
              className="stage"
              style={{
                backgroundImage: `url('${art(community.id, 960, 540)}')`,
              }}
            >
              <span className="glowb" />
              <div className="tl">
                <span className="livepill">AO VIVO</span>
                <span className="vpill">
                  <Icon name="eye" /> {fmt(stageChannel.viewers)}
                </span>
              </div>
              <div className="cap">
                <b>{community.name}</b>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <div className="comm-layout">
        <nav className="comm-nav" aria-label="Navegação da comunidade">
          <div className="comm-nav-title">
            <Icon name="spark" /> Espaço da comunidade
          </div>
          {navItems.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'on' : ''}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              <Icon name={icon} /> <span>{label}</span>
            </button>
          ))}
        </nav>

        <main className="comm-main">
          {tab === 'publicacoes' ? (
            <div className="comm-section">
              <h2 className="h2">Publicações</h2>
              <CommunityComposer community={community} canPost={canPost} />
              {posts.length ? (
                <div className="comm-posts">
                  {posts.map((post) => (
                    <Post key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Nenhuma publicação ainda"
                  text="Mensagens, áudios, fotos e vídeos aparecem aqui."
                />
              )}
            </div>
          ) : null}

          {tab === 'visao' ? (
            <div className="comm-section comm-overview">
              <h2 className="h2">Visão geral</h2>
              <div className="comm-cards">
                <div className="card comm-stat">
                  <b>{posts.length}</b>
                  <span className="muted sm">Publicações</span>
                </div>
                <div className="card comm-stat">
                  <b>{gallery.length}</b>
                  <span className="muted sm">Mídias</span>
                </div>
                <div className="card comm-stat">
                  <b>{events.length}</b>
                  <span className="muted sm">Eventos</span>
                </div>
                <div className="card comm-stat">
                  <b>{classifieds.length}</b>
                  <span className="muted sm">Anúncios</span>
                </div>
              </div>
              {topics.filter((t) => t.pinned).length ? (
                <section className="comm-sub">
                  <h3>Comunicados fixados</h3>
                  {topics.filter((t) => t.pinned).map((t) => (
                    <div key={t.id} className="comm-topic">
                      <b>{t.title}</b>
                    </div>
                  ))}
                </section>
              ) : null}
              {posts.length ? (
                <section className="comm-sub">
                  <h3>Últimas publicações</h3>
                  <div className="comm-posts">
                    {posts.slice(0, 3).map((p) => (
                      <Post key={p.id} post={p} />
                    ))}
                  </div>
                </section>
              ) : (
                <Empty
                  title="Tudo pronto para começar"
                  text="Publique algo ou convide membros para animar a comunidade."
                />
              )}
            </div>
          ) : null}

          {tab === 'comunicados' ? (
            <div className="comm-section">
              <h2 className="h2">Comunicados</h2>
              {canPost ? (
                <form
                  className="comm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!topic.trim()) return;
                    actions.addTopic(community.id, topic.trim());
                    setTopic('');
                  }}
                >
                  <input
                    className="in"
                    placeholder="Novo comunicado"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name="plus" /> Publicar
                  </button>
                </form>
              ) : null}
              {topics.length ? (
                topics.map((t) => (
                  <div key={t.id} className="comm-topic">
                    <div className="grow">
                      {t.pinned ? (
                        <span className="pill acc">
                          <Icon name="mega" /> Fixado
                        </span>
                      ) : null}
                      <b>{t.title}</b>
                      <div className="muted sm">{personOf(data, t.by).name}</div>
                    </div>
                    {canManage ? (
                      <>
                        <button
                          className="icon-btn"
                          title={t.pinned ? 'Desafixar' : 'Fixar'}
                          onClick={() =>
                            actions.pinCommunityTopic(community.id, t.id)
                          }
                        >
                          <Icon name="mega" />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Remover"
                          onClick={() => actions.deleteTopic(community.id, t.id)}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    ) : null}
                  </div>
                ))
              ) : (
                <Empty
                  title="Sem comunicados"
                  text="Avisos importantes fixados pela administração."
                />
              )}
            </div>
          ) : null}

          {tab === 'galeria' ? (
            <div className="comm-section">
              <h2 className="h2">Galeria da comunidade</h2>
              <p className="muted sm">
                Fotos, vídeos e áudios publicados pela comunidade aparecem aqui.
              </p>
              {gallery.length ? (
                <div className="comm-gallery">
                  {gallery.map((g) => (
                    <div key={g.id} className="comm-gallery-item">
                      {g.kind === 'video' ? (
                        <video src={g.src} controls preload="metadata" />
                      ) : g.kind === 'audio' ? (
                        <div className="comm-gallery-audio">
                          <Icon name="mic" />
                          <audio src={g.src} controls preload="metadata" />
                        </div>
                      ) : (
                        <img src={g.src} alt={g.title || 'Mídia'} loading="lazy" />
                      )}
                      <div className="comm-gallery-meta">
                        <b className="ell">{g.title || 'Sem título'}</b>
                        <span className="muted sm">
                          {personOf(data, g.author_id).name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Galeria vazia"
                  text="Publique fotos, vídeos ou áudios para preencher a galeria."
                />
              )}
            </div>
          ) : null}

          {tab === 'enquetes' ? (
            <div className="comm-section">
              <h2 className="h2">Enquetes</h2>
              {posts.filter(
                (p) =>
                  p.interactive?.format === 'poll' ||
                  p.interactive?.format === 'imageVote'
              ).length ? (
                <div className="comm-posts">
                  {posts
                    .filter(
                      (p) =>
                        p.interactive?.format === 'poll' ||
                        p.interactive?.format === 'imageVote'
                    )
                    .map((p) => (
                      <Post key={p.id} post={p} />
                    ))}
                </div>
              ) : (
                <Empty
                  title="Nenhuma enquete"
                  text="Crie enquetes nas publicações da comunidade."
                />
              )}
            </div>
          ) : null}

          {tab === 'eventos' ? (
            <div className="comm-section">
              <h2 className="h2">Eventos</h2>
              {canPost ? (
                <form
                  className="comm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!evTitle.trim() || !evDate) return;
                    actions.addCommunityEventEntry({
                      community_id: community.id,
                      title: evTitle.trim(),
                      starts_at: new Date(evDate).toISOString(),
                      description: evDesc.trim(),
                    });
                    setEvTitle('');
                    setEvDate('');
                    setEvDesc('');
                  }}
                >
                  <input
                    className="in"
                    placeholder="Nome do evento"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                  />
                  <input
                    className="in"
                    type="datetime-local"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Descrição / local"
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name="plus" /> Criar evento
                  </button>
                </form>
              ) : null}
              {events.length ? (
                events.map((ev) => {
                  const going = rsvps.some(
                    (r) => r.event_id === ev.id && r.user_id === uid
                  );
                  const count = rsvps.filter((r) => r.event_id === ev.id).length;
                  return (
                    <div key={ev.id} className="comm-event">
                      <div className="comm-event-date">
                        <b>{new Date(ev.starts_at).getDate()}</b>
                        <span>
                          {new Date(ev.starts_at).toLocaleString('pt-BR', {
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="grow">
                        <b>{ev.title}</b>
                        <div className="muted sm">
                          {hm(ev.starts_at)} · {count} confirmado(s)
                        </div>
                        {ev.description ? (
                          <p className="muted sm">{ev.description}</p>
                        ) : null}
                      </div>
                      <button
                        className={`btn ${going ? 'ghost' : 'primary'}`}
                        onClick={() => actions.toggleCommunityRsvpEntry(ev.id)}
                      >
                        {going ? 'Cancelar' : 'Participar'}
                      </button>
                      {(ev.created_by === uid || canManage) ? (
                        <button
                          className="icon-btn danger"
                          onClick={() =>
                            actions.removeCommunityEventEntry(ev.id)
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <Empty
                  title="Nenhum evento"
                  text="Crie eventos e permita confirmação de presença."
                />
              )}
            </div>
          ) : null}

          {tab === 'classificados' ? (
            <div className="comm-section">
              <h2 className="h2">Classificados</h2>
              {canPost ? (
                <form
                  className="comm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!clTitle.trim()) return;
                    actions.addCommunityClassifiedEntry({
                      community_id: community.id,
                      title: clTitle.trim(),
                      category: clCat,
                      description: clDesc.trim(),
                      price: clPrice.trim(),
                      contact: clContact.trim(),
                      images: [],
                    });
                    setClTitle('');
                    setClDesc('');
                    setClPrice('');
                    setClContact('');
                  }}
                >
                  <input
                    className="in"
                    placeholder="Título do anúncio"
                    value={clTitle}
                    onChange={(e) => setClTitle(e.target.value)}
                  />
                  <select
                    className="in"
                    value={clCat}
                    onChange={(e) => setClCat(e.target.value)}
                  >
                    <option value="venda">Venda</option>
                    <option value="servico">Serviço</option>
                    <option value="trabalho">Trabalho</option>
                    <option value="parceria">Parceria</option>
                    <option value="outros">Outros</option>
                  </select>
                  <input
                    className="in"
                    placeholder="Descrição"
                    value={clDesc}
                    onChange={(e) => setClDesc(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Preço"
                    value={clPrice}
                    onChange={(e) => setClPrice(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Contato"
                    value={clContact}
                    onChange={(e) => setClContact(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name="plus" /> Publicar anúncio
                  </button>
                </form>
              ) : null}
              {classifieds.length ? (
                classifieds.map((c) => (
                  <div key={c.id} className="comm-classified">
                    <div className="grow">
                      <span className="pill">{c.category}</span>
                      <b>{c.title}</b>
                      {c.description ? (
                        <p className="muted sm">{c.description}</p>
                      ) : null}
                      <div className="muted sm">
                        {c.price ? `Preço: ${c.price}` : ''}{' '}
                        {c.contact ? `· ${c.contact}` : ''}
                      </div>
                    </div>
                    {(c.author_id === uid || canManage) ? (
                      <>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            const t = window.prompt('Novo título', c.title);
                            if (t?.trim())
                              actions.editCommunityClassifiedEntry(c.id, {
                                title: t.trim(),
                              });
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() =>
                            actions.removeCommunityClassifiedEntry(c.id)
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    ) : null}
                  </div>
                ))
              ) : (
                <Empty
                  title="Nenhum anúncio"
                  text="Venda, divulgue serviços ou encontre oportunidades."
                />
              )}
            </div>
          ) : null}

          {tab === 'membros' ? (
            <div className="comm-section">
              <h2 className="h2">Membros</h2>
              <div className="comm-members">
                {members.map((id) => {
                  const person = personOf(data, id);
                  const role = community.mods?.includes(id)
                    ? 'Moderador'
                    : id === community.owner
                      ? 'Criador'
                      : 'Membro';
                  return (
                    <button
                      key={id}
                      type="button"
                      className="comm-member"
                      onClick={() => actions.openUser?.(id)}
                    >
                      <LiveAvatar user={person} size={40} data={data} />
                      <span className="grow">
                        <b>{person.name}</b>
                        <span className="muted sm"> {role}</span>
                      </span>
                      <Icon name="chevron-right" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === 'admin' && canManage ? (
            <div className="comm-section">
              <h2 className="h2">Administração</h2>
              <p className="muted">
                Gerencie membros, moderadores e privacidade da comunidade.
              </p>
              <button
                className="btn primary"
                onClick={onAdmin || (() => actions.openCommAdmin?.(community.id))}
              >
                <Icon name="shield" /> Abrir painel completo
              </button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
