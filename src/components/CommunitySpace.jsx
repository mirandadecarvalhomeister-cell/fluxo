import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { fmt, hm } from '../lib/utils';
import { art } from '../lib/art';
import { mediaOf } from '../lib/media';
import { Avatar, LiveAvatar } from './Avatar';
import EmojiPicker from './EmojiPicker';
import EmojiText from './EmojiText';
import Empty from './Empty';
import { Icon } from './Icon';
import { Verified } from './Brand';
import Post from './Post';

const NAV = [
  ['publicacoes', 'Publicações', 'chat'],
  ['comunicados', 'Comunicados', 'mega'],
  ['galeria', 'Galeria', 'camera'],
  ['enquetes', 'Enquetes', 'chart'],
  ['eventos', 'Eventos', 'clock'],
  ['classificados', 'Classificados', 'tag'],
  ['membros', 'Membros', 'users'],
  ['admin', 'Administração', 'shield'],
];

function personOf(data, id) {
  if (id === 'me') return data.me;
  return data.users?.[id] || { id, name: String(id || '').slice(0, 8) };
}

// Barra de digitação da comunidade, no mesmo estilo da aba Mensagens.
function CommunityChatComposer({ community, canPost }) {
  const { ui, actions } = useApp();
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);
  const media = ui.draft?.media || [];

  function submit(event) {
    event.preventDefault();
    if (!text.trim() && !media.length) return;
    actions.publish(text, community.id);
    setText('');
    actions.resetDraft();
    setPickerOpen(false);
  }

  async function toggleRecord() {
    if (recRef.current) {
      recRef.current.stop();
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
        stream.getTracks().forEach((track) => track.stop());
        recRef.current = null;
        setRecording(false);
        if (blob.size) actions.sendCommunityAudio(community.id, blob);
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
      <div className="card comm-chat-locked">
        <Icon name="lock" />
        <span>Entre na comunidade para participar das conversas.</span>
      </div>
    );
  }

  return (
    <form className="comm-chat-composer" onSubmit={submit}>
      {pickerOpen ? (
        <>
          <button
            className="pop-scrim"
            type="button"
            aria-label="Fechar emojis"
            onClick={() => setPickerOpen(false)}
          />
          <div className="comm-chat-picker">
            <EmojiPicker
              embedded
              onPick={(emoji) => {
                setText((value) => value + emoji);
                setPickerOpen(false);
                inputRef.current?.focus();
              }}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        </>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) actions.attachMedia(event.target.files);
          event.target.value = '';
        }}
      />
      {media.length ? (
        <div className="comm-chat-media">
          {media.map((item, index) => (
            <div className="comm-chat-thumb" key={index}>
              {item.kind === 'video' ? (
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
      <div className="comm-chat-bar">
        <button
          className={`icon-btn ${pickerOpen ? 'on' : ''}`}
          type="button"
          aria-label="Emojis"
          title="Emojis"
          onClick={() => setPickerOpen((open) => !open)}
        >
          <Icon name="smile" />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Anexar fotos ou vídeos"
          title="Anexar"
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="paperclip" />
        </button>
        <textarea
          ref={inputRef}
          className="comm-chat-input"
          rows={1}
          maxLength={600}
          placeholder={`Escreva para ${community.name}…`}
          aria-label="Escrever na comunidade"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {text.trim() || media.length ? (
          <button className="icon-btn send" type="submit" aria-label="Enviar" title="Enviar">
            <Icon name="send" />
          </button>
        ) : (
          <button
            className={`icon-btn mic ${recording ? 'on' : ''}`}
            type="button"
            onClick={toggleRecord}
            aria-label={recording ? 'Parar gravação e enviar áudio' : 'Gravar áudio'}
            title={recording ? 'Toque para enviar' : 'Gravar áudio'}
          >
            <Icon name="mic" />
          </button>
        )}
      </div>
      {recording ? (
        <span className="comm-chat-recording">
          <span className="rec-dot" /> Gravando… toque no microfone para enviar
        </span>
      ) : null}
    </form>
  );
}

// Conversa da comunidade: mensagens em balões, como um chat amplo.
function CommunityChat({ posts, canPost, community }) {
  const { data } = useApp();
  const boxRef = useRef(null);
  const prevCount = useRef(posts.length);
  // data.posts vem do mais novo para o mais antigo; no chat vai do mais antigo
  // para o mais novo, como nas conversas.
  const messages = useMemo(() => [...posts].reverse(), [posts]);

  useEffect(() => {
    if (posts.length > prevCount.current) {
      boxRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
    prevCount.current = posts.length;
  }, [posts.length]);

  return (
    <div className="comm-chat">
      <div className="comm-chat-list" ref={boxRef}>
        {messages.map((post) => {
          const person = personOf(data, post.by);
          const mine = post.by === 'me';
          const allMedia = mediaOf(post).filter((item) => item.src);
          const items = allMedia.filter((item) => ['photo', 'video'].includes(item.kind));
          const audios = allMedia.filter((item) => item.kind === 'audio');
          return (
            <div className={`comm-chat-msg${mine ? ' me' : ''}`} key={post.id}>
              {!mine ? <Avatar user={person} size={32} /> : null}
              <div className="comm-chat-body">
                <div className="comm-chat-head">
                  <b>{person.name}</b> <time>{hm(post.ts)}</time>
                </div>
                <div className="comm-chat-bubble">
                  {post.text ? <p><EmojiText text={post.text} size={19} /></p> : null}
                  {items.map((item, index) =>
                    item.kind === 'video' ? (
                      <video key={index} src={item.src} controls preload="metadata" />
                    ) : (
                      <img key={index} src={item.src} alt="Foto da comunidade" loading="lazy" />
                    )
                  )}
                  {audios.map((item, index) => (
                    <audio key={`a${index}`} src={item.src} controls preload="metadata" />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {!posts.length ? (
          <Empty
            title="Nenhuma mensagem ainda"
            text="Seja a primeira pessoa a escrever nesta comunidade."
          />
        ) : null}
      </div>
      <CommunityChatComposer community={community} canPost={canPost} />
    </div>
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
          .filter((item) => item.src && ['photo', 'video'].includes(item.kind))
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
              <button className="btn tonal" onClick={() => setTab('admin')}>
                <Icon name="shield" /> Administração
              </button>
            ) : null}
          </div>
        </div>
      </header>

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
            <div className="comm-section comm-chat-section">
              <h2 className="h2">Publicações</h2>
              <CommunityChat posts={posts} canPost={canPost} community={community} />
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
