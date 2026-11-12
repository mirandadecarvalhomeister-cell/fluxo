import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { isLiveKitEnabled } from '../lib/livekit';
import { MAX_POST_MEDIA, mediaOf } from '../lib/media';
import { ALGO_LEVELS, FEED_FORMATS, FEED_MODES, communityActivity, feedPrefs } from '../lib/feed';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { CATS, COVERS, KINDS } from '../lib/seed';
import {
  groupNotifications,
  likesGroupText,
  notificationText,
  roleOf,
  userOf,
} from '../lib/selectors';
import { ago, fmt, slug } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import MediaEditor, { EditOverlay } from './MediaEditor';
import Post from './Post';
import { PostThumb } from './Profile';
import SearchModal from './SearchModal';

function ProfileEditModal() {
  const { data, actions } = useApp();
  const me = data.me;
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio);
  const [city, setCity] = useState(me.city);
  const [humor, setHumor] = useState(me.humor);
  const [interests, setInterests] = useState((me.interests || []).join(', '));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        actions.saveProfile({
          name: name.trim() || me.name,
          handle: slug(handle) || me.handle,
          bio: bio.trim(),
          city: city.trim(),
          humor: humor.trim(),
          interests: interests
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8),
        });
      }}
    >
      <h2>Editar perfil</h2>

      <div className="row" style={{ marginBottom: 14 }}>
        <span className="ring">
          <Avatar user={me} size={64} />
        </span>
        <label className="btn ghost sm" htmlFor="mAvIn">
          <Icon name="camera" /> Trocar foto
        </label>
        <input
          id="mAvIn"
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) actions.uploadAvatar(file);
            event.target.value = '';
          }}
        />
      </div>

      <div className="field">
        <label>Capa</label>
        <div className="swatches">
          {COVERS.map((cover) => (
            <button
              type="button"
              key={cover}
              className={me.cover.k === 'art' && me.cover.v === cover ? 'on' : ''}
              style={{ backgroundImage: `url('${art(cover, 120, 80)}')` }}
              onClick={() => actions.pickCover(cover)}
              aria-label={`Capa ${cover}`}
            />
          ))}
        </div>
        <label className="btn ghost sm" htmlFor="mCoverIn" style={{ width: 'fit-content' }}>
          <Icon name="image" /> Enviar minha capa
        </label>
        <input
          id="mCoverIn"
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) actions.uploadCover(file);
            event.target.value = '';
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="pName">Nome</label>
        <input
          className="in"
          id="pName"
          type="text"
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pHandle">Usuário</label>
        <input
          className="in"
          id="pHandle"
          type="text"
          maxLength={24}
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pBio">Bio</label>
        <textarea
          className="in"
          id="pBio"
          rows={3}
          maxLength={160}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pCity">Cidade</label>
        <input
          className="in"
          id="pCity"
          type="text"
          maxLength={40}
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pHumor">Humor de hoje</label>
        <input
          className="in"
          id="pHumor"
          type="text"
          maxLength={60}
          value={humor}
          onChange={(event) => setHumor(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pInt">Interesses (separe por vírgula)</label>
        <input
          className="in"
          id="pInt"
          type="text"
          maxLength={100}
          value={interests}
          onChange={(event) => setInterests(event.target.value)}
        />
      </div>
      <button className="btn primary block" type="submit">
        Salvar perfil
      </button>
    </form>
  );
}

function CommunityModal({ community }) {
  const { data, actions } = useApp();
  const owner = community.owner === 'me';
  const mod = (community.mods || []).includes('me');
  const canManage = owner || mod;
  const activity = communityActivity(community, data.posts);
  const members = community.members || [];
  const requests = community.requests || [];
  const topics = community.topics || [];
  const candidates = data.follows.filter((id) => !(community.mods || []).includes(id));
  const inviteCandidates = data.follows.filter(
    (id) => id !== 'me' && !members.includes(id)
  );
  const linkableChannels = (data.chans || []).filter(
    (channel) => channel.owner === 'me' || channel.joined
  );
  const linkedChannels = (community.channelIds || [])
    .map((id) => (data.chans || []).find((channel) => channel.id === id))
    .filter(Boolean);
  const [topic, setTopic] = useState('');
  const [modSel, setModSel] = useState(candidates[0] || '');
  const [inviteSel, setInviteSel] = useState(inviteCandidates[0] || '');
  const [chanSel, setChanSel] = useState('');
  const coverInputRef = useRef(null);
  const iconInputRef = useRef(null);

  const joinButton = () => {
    if (community.joined) {
      return (
        <button className="btn ghost" onClick={() => actions.toggleComm(community.id)}>
          Sair da comunidade
        </button>
      );
    }
    if (community.invited) {
      return (
        <div className="row wrap">
          <button
            className="btn primary"
            onClick={() =>
              actions.respondCommunityInvite(community.id, community.invited, true)
            }
          >
            Aceitar convite
          </button>
          <button
            className="btn ghost"
            onClick={() =>
              actions.respondCommunityInvite(community.id, community.invited, false)
            }
          >
            Recusar
          </button>
        </div>
      );
    }
    if (community.pending) {
      return (
        <button className="btn ghost" onClick={() => actions.toggleComm(community.id)}>
          Solicitação pendente · Cancelar
        </button>
      );
    }
    return (
      <button className="btn primary" onClick={() => actions.toggleComm(community.id)}>
        {community.private ? 'Solicitar entrada' : 'Entrar na comunidade'}
      </button>
    );
  };

  return (
    <>
      <div
        className="mcover"
        style={{
          backgroundImage: `url('${community.coverUrl || art(community.seed, 800, 260)}')`,
        }}
      >
        {canManage ? (
          <div className="mcover-tools">
            <button
              type="button"
              className="mcover-btn"
              onClick={() => coverInputRef.current?.click()}
              title="Trocar capa"
              aria-label="Trocar capa"
            >
              <Icon name="image" />
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) actions.uploadCommunityArt(community.id, 'cover', file);
                event.target.value = '';
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="mbody">
        <div className="comm-head">
          <button
            type="button"
            className="comm-icon"
            onClick={() => canManage && iconInputRef.current?.click()}
            aria-label={canManage ? 'Trocar ícone da comunidade' : 'Ícone da comunidade'}
            title={canManage ? 'Trocar ícone' : undefined}
          >
            {community.iconUrl ? (
              <img src={community.iconUrl} alt="" />
            ) : (
              <span
                style={{ backgroundImage: `url('${art(community.seed + '-icone', 160, 160)}')` }}
              />
            )}
          </button>
          {canManage ? (
            <input
              ref={iconInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) actions.uploadCommunityArt(community.id, 'icon', file);
                event.target.value = '';
              }}
            />
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: '0 0 6px' }}>{community.name}</h2>
            <div className="row wrap">
              <span className="pill acc">{community.cat}</span>
              <span className="pill">
                <Icon name={community.private ? 'lock' : 'globe'} />
                {community.private ? 'Privada' : 'Aberta'}
              </span>
              {roleOf(community) ? (
                <span className="pill sun">
                  <Icon name="shield" /> {roleOf(community)}
                </span>
              ) : null}
            </div>
          </div>
          {!owner ? joinButton() : null}
        </div>

        <div className="comm-stats">
          <span>
            <Icon name="users" /> {fmt(community.subs)} participantes
          </span>
          <span>
            <Icon name="chat" /> {topics.length} discussões
          </span>
          <span>
            <Icon name="spark" /> {activity.level}
          </span>
          {activity.lastTs ? <span>{ago(activity.lastTs)}</span> : null}
        </div>

        {community.pending ? (
          <p className="comm-note">
            Sua solicitação está aguardando aprovação de quem modera.
          </p>
        ) : null}

        <p>{community.desc}</p>

        <section>
          <h3 className="h3">Participantes</h3>
          {community.joined ? (
            <>
              <div className="comm-members">
                {members.slice(0, 14).map((memberId) => {
                  const person = userOf(data, memberId);
                  const isOwner = memberId === community.owner;
                  const isMod = community.mods.includes(memberId);
                  return (
                    <div className="comm-member" key={memberId}>
                      <Avatar user={person} size={32} />
                      <span className="ell">
                        {person.name}
                        {isOwner ? ' · criador' : isMod ? ' · moderador' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              {members.length > 14 ? (
                <p className="muted sm">e mais {members.length - 14} participantes</p>
              ) : null}
            </>
          ) : (
            <p className="muted sm">
              Entre na comunidade para ver quem participa.
            </p>
          )}
        </section>

        {canManage && requests.length ? (
          <section>
            <h3 className="h3">Solicitações para entrar</h3>
            {requests.map((request) => {
              const person = userOf(data, request.userId);
              return (
                <div className="mrow" key={request.id}>
                  <Avatar user={person} size={34} />
                  <div className="grow">
                    <b>{person.name}</b>
                    <div className="muted sm">Quer participar · {ago(request.ts)}</div>
                  </div>
                  <button
                    className="btn primary sm"
                    onClick={() => actions.approveJoin(community.id, request.userId)}
                  >
                    Aprovar
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={() => actions.rejectJoin(community.id, request.userId)}
                  >
                    Recusar
                  </button>
                </div>
              );
            })}
          </section>
        ) : null}

        <section>
          <h3 className="h3">Canais da comunidade</h3>
          {linkedChannels.length ? (
            linkedChannels.map((channel) => (
              <div className="mrow" key={channel.id}>
                <span className="comm-chan-ic">
                  <Icon name={KINDS[channel.kind]?.[0] || 'chat'} />
                </span>
                <div className="grow">
                  <b>{channel.name}</b>
                  <div className="muted sm">
                    {KINDS[channel.kind]?.[1] || 'Conversa'}
                    {channel.live ? ' · ao vivo' : ''}
                  </div>
                </div>
                <button
                  className="btn ghost sm"
                  onClick={() => actions.openRoom(channel.id)}
                >
                  Abrir
                </button>
                {canManage ? (
                  <button
                    className="icon-btn"
                    onClick={() => actions.unlinkCommChannel(community.id, channel.id)}
                    aria-label="Desvincular canal"
                    title="Desvincular canal"
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="muted sm">Nenhum canal vinculado ainda.</p>
          )}
          {canManage && linkableChannels.length ? (
            <form
              className="cmform"
              style={{ marginTop: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                actions.linkCommChannel(community.id, chanSel);
                setChanSel('');
              }}
            >
              <select
                className="in"
                value={chanSel}
                onChange={(event) => setChanSel(event.target.value)}
                aria-label="Canal para vincular"
              >
                <option value="">Escolher canal…</option>
                {linkableChannels
                  .filter((channel) => !(community.channelIds || []).includes(channel.id))
                  .map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
              </select>
              <button className="btn tonal sm" type="submit">
                Vincular
              </button>
            </form>
          ) : null}
        </section>

        {community.joined && inviteCandidates.length ? (
          <section>
            <h3 className="h3">Convidar pessoas</h3>
            <form
              className="cmform"
              onSubmit={(event) => {
                event.preventDefault();
                actions.inviteToComm(community.id, inviteSel);
              }}
            >
              <select
                className="in"
                value={inviteSel}
                onChange={(event) => setInviteSel(event.target.value)}
                aria-label="Pessoa para convidar"
              >
                {inviteCandidates.map((id) => (
                  <option key={id} value={id}>
                    {userOf(data, id).name}
                  </option>
                ))}
              </select>
              <button className="btn tonal sm" type="submit">
                Enviar convite
              </button>
            </form>
          </section>
        ) : null}

        <section>
          <h3 className="h3">Moderação</h3>
          {(community.mods || []).map((modId) => {
            const person = userOf(data, modId);
            return (
              <div className="mrow" key={modId}>
                <Avatar user={person} size={36} />
                <div className="grow">
                  <b>{person.name}</b>
                  <div className="muted sm">
                    {modId === community.owner ? 'Criador' : 'Moderador'}
                  </div>
                </div>
                {owner && modId !== community.owner && (
                  <button
                    className="btn ghost sm"
                    onClick={() => actions.removeModerator(community.id, modId)}
                  >
                    Remover
                  </button>
                )}
              </div>
            );
          })}
          {owner &&
            (candidates.length ? (
              <form
                className="cmform"
                style={{ marginTop: 8 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (modSel) actions.addModerator(community.id, modSel);
                }}
              >
                <select
                  className="in"
                  value={modSel}
                  onChange={(event) => setModSel(event.target.value)}
                  aria-label="Novo moderador"
                >
                  {candidates.map((id) => (
                    <option key={id} value={id}>
                      {userOf(data, id).name}
                    </option>
                  ))}
                </select>
                <button className="btn tonal sm" type="submit">
                  Adicionar moderador
                </button>
              </form>
            ) : (
              <p className="muted sm">Todas as pessoas que você segue já moderam.</p>
            ))}
        </section>

        <section>
          <h3 className="h3">Regras</h3>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
            {(community.rules || []).map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="h3">Tópicos</h3>
          {topics.map((item) => {
            const person = userOf(data, item.by);
            return (
              <div className="mrow" key={item.id}>
                <Avatar user={person} size={34} />
                <div className="grow">
                  <b>{item.title}</b>
                  <div className="muted sm">
                    {person.name} · {item.replies} respostas · {ago(item.ts)}
                  </div>
                </div>
                {mod && (
                  <button
                    className="icon-btn"
                    onClick={() => actions.deleteTopic(community.id, item.id)}
                    aria-label="Remover tópico"
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            );
          })}
          {!topics.length && <p className="muted sm">Nenhum tópico ainda.</p>}
          {community.joined ? (
            <form
              className="cmform"
              style={{ marginTop: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                actions.addTopic(community.id, topic);
                setTopic('');
              }}
            >
              <input
                className="in"
                type="text"
                maxLength={90}
                placeholder="Abrir um novo tópico"
                aria-label="Novo tópico"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
              <button className="btn primary sm" type="submit">
                Publicar
              </button>
            </form>
          ) : (
            <p className="muted sm" style={{ marginTop: 8 }}>
              Entre na comunidade para abrir tópicos.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function NewCommunityModal() {
  const { ui, actions } = useApp();
  const [name, setName] = useState(ui.commDraft?.name || '');
  const [cat, setCat] = useState(CATS[0]);
  const [desc, setDesc] = useState('');
  const [rules, setRules] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const seed = ui.commSeed;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        actions.createComm({
          name: name.trim(),
          cat,
          desc: desc.trim(),
          rules: rules
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          seed,
          private: isPrivate,
        });
      }}
    >
      <h2>Criar comunidade</h2>
      <div className="comm-preview">
        <span
          className="comm-preview-cover"
          style={{ backgroundImage: `url('${art(seed, 600, 200)}')` }}
        />
        <span
          className="comm-preview-icon"
          style={{ backgroundImage: `url('${art(seed + '-icone', 160, 160)}')` }}
        />
        <b>{name.trim() || 'Sua nova comunidade'}</b>
        <small>{isPrivate ? 'Privada · entrada por aprovação' : 'Aberta · entre quem quiser'}</small>
      </div>
      <div className="field">
        <label htmlFor="cnName">Nome</label>
        <input
          className="in"
          id="cnName"
          type="text"
          maxLength={40}
          placeholder="Ex.: Violão de Quintal"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="cnCat">Categoria</label>
        <select
          className="in"
          id="cnCat"
          value={cat}
          onChange={(event) => setCat(event.target.value)}
        >
          {CATS.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cnDesc">Descrição</label>
        <textarea
          className="in"
          id="cnDesc"
          rows={3}
          maxLength={200}
          placeholder="Sobre o que é este fluxo?"
          value={desc}
          onChange={(event) => setDesc(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="cnRules">Regras (uma por linha)</label>
        <textarea
          className="in"
          id="cnRules"
          rows={3}
          maxLength={300}
          placeholder={'Respeito sempre\nSem spam'}
          value={rules}
          onChange={(event) => setRules(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Privacidade</label>
        <div className="seg wrap">
          <button
            type="button"
            className={!isPrivate ? 'on' : ''}
            onClick={() => setIsPrivate(false)}
          >
            <Icon name="globe" /> Aberta
          </button>
          <button
            type="button"
            className={isPrivate ? 'on' : ''}
            onClick={() => setIsPrivate(true)}
          >
            <Icon name="lock" /> Privada
          </button>
        </div>
        <p className="muted sm">
          {isPrivate
            ? 'Quem quiser entrar precisa de aprovação de quem modera.'
            : 'Qualquer pessoa pode entrar sem burocracia.'}
        </p>
      </div>
      <div className="field">
        <label>Capa</label>
        <div className="swatches">
          {COVERS.map((cover) => (
            <button
              type="button"
              key={cover}
              className={seed === cover ? 'on' : ''}
              style={{ backgroundImage: `url('${art(cover + '-c', 120, 80)}')` }}
              onClick={() => actions.setCommSeed(cover)}
              aria-label={`Capa ${cover}`}
            />
          ))}
        </div>
      </div>
      <p className="muted sm" style={{ marginBottom: 12 }}>
        Você será o criador e moderador. Depois, escolha outros moderadores entre quem
        você segue.
      </p>
      <button className="btn primary block" type="submit">
        Criar comunidade
      </button>
    </form>
  );
}

function NewChannelModal() {
  const { actions } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState('avisos');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        actions.createChannel({ name: name.trim(), desc: desc.trim(), kind });
      }}
    >
      <h2>Criar canal</h2>
      <div className="field">
        <label htmlFor="chName">Nome do canal</label>
        <input
          className="in"
          id="chName"
          type="text"
          maxLength={40}
          placeholder="Ex.: Sala do Violão"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="chDesc">Descrição</label>
        <input
          className="in"
          id="chDesc"
          type="text"
          maxLength={100}
          placeholder="Do que se trata?"
          value={desc}
          onChange={(event) => setDesc(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Tipo</label>
        <div className="radios">
          <label>
            <input
              type="radio"
              name="chKind"
              value="avisos"
              checked={kind === 'avisos'}
              onChange={() => setKind('avisos')}
            />
            <span>
              <b>Avisos</b>
              <br />
              <span className="muted sm">Só você publica; os outros reagem.</span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="chKind"
              value="conversa"
              checked={kind === 'conversa'}
              onChange={() => setKind('conversa')}
            />
            <span>
              <b>Conversa</b>
              <br />
              <span className="muted sm">Sala aberta, todo mundo escreve.</span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="chKind"
              value="palco"
              checked={kind === 'palco'}
              onChange={() => setKind('palco')}
            />
            <span>
              <b>Palco ao vivo</b>
              <br />
              <span className="muted sm">Transmissões com chat ao lado.</span>
            </span>
          </label>
        </div>
      </div>
      <button className="btn primary block" type="submit">
        Criar canal
      </button>
    </form>
  );
}

function LiveModal() {
  const { data, actions } = useApp();
  const mine = data.chans.filter((c) => c.owner === 'me' && c.kind === 'palco');
  const [chanId, setChanId] = useState(mine[0]?.id || 'new');
  const [title, setTitle] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        actions.startLive({ chanId, title: title.trim() });
      }}
    >
      <h2>Iniciar live</h2>
      {mine.length ? (
        <div className="field">
          <label htmlFor="lvChan">Palco</label>
          <select
            className="in"
            id="lvChan"
            value={chanId}
            onChange={(event) => setChanId(event.target.value)}
          >
            {mine.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
            <option value="new">Criar um novo palco</option>
          </select>
        </div>
      ) : (
        <p className="muted sm" style={{ marginBottom: 12 }}>
          Vamos criar o seu primeiro palco automaticamente.
        </p>
      )}
      <div className="field">
        <label htmlFor="lvTitle">Título da transmissão</label>
        <input
          className="in"
          id="lvTitle"
          type="text"
          maxLength={70}
          placeholder="Ex.: Conversa de sexta à noite"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <p className="muted sm" style={{ marginBottom: 12 }}>
        {isLiveKitEnabled
          ? 'Ao entrar no ar, o navegador vai pedir permissão para câmera e microfone. Você poderá desligar cada um durante a transmissão.'
          : 'Sem o servidor de vídeo configurado, a live fica registrada no canal apenas com o chat de texto.'}
      </p>
      <button className="btn hot block" type="submit">
        Entrar no ar
      </button>
    </form>
  );
}

function ProfileConnectionsModal({ modal }) {
  const { data, actions } = useApp();
  const [tab, setTab] = useState(modal.kind || 'following');
  const following = data.follows || [];
  const followers = data.followers || [];
  const communities = data.comms.filter((community) => community.joined);

  const tabs = [
    ['following', 'Seguindo', following.length],
    ['followers', 'Seguidores', followers.length],
    ['communities', 'Comunidades', communities.length],
  ];

  let list = null;
  if (tab === 'communities') {
    list = communities.length ? (
      communities.map((community) => (
        <div className="share-person conn-row" key={community.id}>
          <span
            className="cthumb"
            style={{ backgroundImage: `url('${art(community.seed, 120, 120)}')` }}
          />
          <span className="grow">
            <b className="ell" style={{ display: 'block' }}>
              {community.name}
            </b>
            <span className="muted sm">
              {community.cat} · {fmt(community.subs)} inscritos
            </span>
          </span>
          <button
            type="button"
            className="btn tonal sm"
            onClick={() => actions.openComm(community.id)}
          >
            Abrir
          </button>
        </div>
      ))
    ) : (
      <p className="muted sm">Você ainda não participa de nenhuma comunidade.</p>
    );
  } else {
    const ids = [...new Set(tab === 'followers' ? followers : following)].filter(
      (id) => id && id !== 'me'
    );
    list = ids.length ? (
      ids.map((id) => {
        const person = userOf(data, id);
        const isFollowing = following.includes(id);
        return (
            <div
              className="share-person conn-row"
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => actions.openUser(id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  actions.openUser(id);
                }
              }}
            >
              <Avatar user={person} size={40} />
              <span className="grow">
                <b className="ell" style={{ display: 'block' }}>
                  {person.name}
                </b>
                <span className="muted sm">
                  @{person.handle} · {fmt(person.followers || 0)} seguidores
                </span>
              </span>
              {tab === 'following' ? (
                isFollowing ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.follow(id);
                    }}
                  >
                    Deixar de seguir
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn tonal sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.follow(id);
                    }}
                  >
                    Seguir
                  </button>
                )
              ) : isFollowing ? (
                <span className="pill acc" title="Você segue esta pessoa">
                  Seguindo
                </span>
              ) : (
                <button
                  type="button"
                  className="btn tonal sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.follow(id);
                  }}
                >
                  Seguir de volta
                </button>
              )}
            </div>
        );
      })
    ) : (
      <p className="muted sm">
        {tab === 'followers'
          ? 'Ninguém segue você ainda. Publique e interaja para aparecer no fluxo.'
          : 'Você ainda não segue ninguém. Explore o feed e as comunidades.'}
      </p>
    );
  }

  return (
    <div className="connections-modal">
      <h2>Conexões</h2>
      <div className="seg" style={{ marginBottom: 14 }}>
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'on' : ''}
            onClick={() => setTab(key)}
          >
            {label} {count}
          </button>
        ))}
      </div>
      <div className="share-list">{list}</div>
    </div>
  );
}

function UserModal({ modal }) {
  const { data, actions } = useApp();
  const person = userOf(data, modal.id);
  const following = (data.follows || []).includes(modal.id);
  const posts = data.posts
    .filter((post) => post.by === modal.id && post.kind !== 'story')
    .sort((a, b) => b.ts - a.ts);
  const cover =
    person.cover?.k === 'img'
      ? person.cover.v
      : art(person.cover?.v || person.id, 1000, 320);

  return (
    <div className="user-modal">
      <div className="mcover" style={{ backgroundImage: `url('${cover}')` }} />
      <div className="mbody">
        <div className="user-hero">
          <span className="ring">
            <Avatar user={person} size={84} />
          </span>
          <div className="grow">
            <h2>{person.name}</h2>
            <span className="muted">
              @{person.handle}
              {person.city ? ` · ${person.city}` : ''}
            </span>
          </div>
        </div>

        {person.bio ? <p className="user-bio">{person.bio}</p> : null}

        <div className="row user-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => actions.startChat(modal.id)}
          >
            <Icon name="chat" /> Mensagem
          </button>
          <button
            type="button"
            className={`btn ${following ? 'ghost' : 'tonal'}`}
            onClick={() => actions.follow(modal.id)}
          >
            {following ? 'Seguindo' : 'Seguir'}
          </button>
          <span className="pill">
            <Icon name="users" /> {fmt(person.followers || 0)} seguidores
          </span>
          {person.humor ? <span className="pill acc">{person.humor}</span> : null}
        </div>

        {person.interests?.length ? (
          <div className="chips">
            {person.interests.map((interest) => (
              <span className="pill" key={interest}>
                {interest}
              </span>
            ))}
          </div>
        ) : null}

        <h3 className="h3">Publicações</h3>
        {posts.length ? (
          <div className="postgrid">
            {posts.map((post) => (
              <PostThumb key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="muted sm">Nenhuma publicação ainda.</p>
        )}
      </div>
    </div>
  );
}

function EditPostModal({ modal }) {
  const { data, actions } = useApp();
  const post = data.posts.find((item) => item.id === modal.id);
  const [text, setText] = useState(post?.text || '');
  const [commentsDisabled, setCommentsDisabled] = useState(
    !!post?.commentsDisabled
  );
  const [editing, setEditing] = useState(null);

  if (!post) return <p className="muted">Publicação indisponível.</p>;

  const media = mediaOf(post);
  const editingItem = editing !== null ? media[editing] : null;
  const canSave = Boolean(text.trim() || media.length);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        actions.updatePost(post.id, { text, commentsDisabled });
      }}
    >
      <h2>Editar publicação</h2>
      <div className="field">
        <label htmlFor="epText">Texto</label>
        <textarea
          className="in"
          id="epText"
          rows={5}
          maxLength={600}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escreva algo ou use @ para mencionar alguém..."
          autoFocus
        />
        <span className="muted sm" style={{ textAlign: 'right' }}>
          {text.length}/600
        </span>
      </div>

      <div className="field">
        <label>Mídia</label>
        {media.length ? (
          <div className="cprev-list" aria-label="Mídias da publicação">
            {media.map((item, index) => (
              <div className="cprev-item" key={`${item.src || item.seed}-${index}`}>
                {!item.src ? (
                  <img
                    src={art(item.seed || `${post.id}-${index}`, 480, 480)}
                    alt={`Mídia ${index + 1}`}
                  />
                ) : item.edit ? (
                  <span className="cprev-frame">
                    {item.kind === 'photo' ? (
                      <img src={item.src} alt="" style={mediaDisplayStyle(item.edit)} />
                    ) : (
                      <video
                        src={item.src}
                        muted
                        playsInline
                        preload="metadata"
                        style={mediaDisplayStyle(item.edit)}
                      />
                    )}
                    <EditOverlay edit={item.edit} />
                  </span>
                ) : item.kind === 'photo' ? (
                  <img src={item.src} alt={`Mídia ${index + 1}`} />
                ) : (
                  <video src={item.src} muted playsInline preload="metadata" />
                )}
                <span className="cprev-tag">
                  {item.kind === 'photo' ? <Icon name="image" /> : <Icon name="video" />}
                </span>
                {item.src ? (
                  <button
                    type="button"
                    className="cprev-edit"
                    onClick={() => setEditing(index)}
                    aria-label="Editar mídia"
                    title="Editar mídia"
                  >
                    <Icon name="edit" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="x"
                  onClick={() => {
                    setEditing(null);
                    actions.removePostMedia(post.id, index);
                  }}
                  aria-label="Remover mídia"
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted sm">Esta publicação está sem mídia.</p>
        )}
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <label className="btn ghost sm" htmlFor="epMedia">
            <Icon name="image" /> Adicionar fotos ou vídeos
          </label>
          <input
            id="epMedia"
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) actions.attachPostMedia(post.id, files);
              event.target.value = '';
            }}
          />
          <span className="muted sm">
            {media.length}/{MAX_POST_MEDIA} · vídeos até 3 min
          </span>
        </div>
      </div>

      {editingItem ? (
        <MediaEditor
          key={`${editing}-${editingItem.src}`}
          kind={editingItem.kind}
          src={editingItem.src}
          fileName={editingItem.name || 'foto'}
          initialEdit={editingItem.edit}
          onDone={(result) => {
            actions.applyPostMediaEdit(post.id, editing, result);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <label className="switch-row">
        <span>
          <b>Permitir comentários</b>
          <span className="muted sm">Desative para fechar a conversa desta publicação.</span>
        </span>
        <input
          type="checkbox"
          checked={!commentsDisabled}
          onChange={(event) => setCommentsDisabled(!event.target.checked)}
        />
      </label>
      <button
        className="btn primary block"
        type="submit"
        disabled={!canSave}
        style={{ marginTop: 14 }}
      >
        Salvar alterações
      </button>
    </form>
  );
}

function SharePostModal({ modal }) {
  const { data, actions } = useApp();
  const post = data.posts.find((item) => item.id === modal.id);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const people = Object.values(data.users)
    .filter(
      (person) =>
        person.name.toLowerCase().includes(query.toLowerCase()) ||
        person.handle.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!post) return <p className="muted">Publicação indisponível.</p>;

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  return (
    <div>
      <h2>Compartilhar publicação</h2>
      <div className="share-preview">
        <p>{post.text || 'Publicação com mídia'}</p>
        <span className="muted sm">
          {post.comments.length} comentários · {post.likes} reações
        </span>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="shareQ">Enviar para</label>
        <input
          className="in"
          id="shareQ"
          type="search"
          placeholder="Buscar pessoa"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="share-list">
        {people.length ? (
          people.map((person) => {
            const on = selected.includes(person.id);
            return (
              <button
                type="button"
                key={person.id}
                className={`share-person ${on ? 'on' : ''}`}
                onClick={() => toggle(person.id)}
              >
                <Avatar user={person} size={38} />
                <span className="grow">
                  <b className="ell" style={{ display: 'block' }}>
                    {person.name}
                  </b>
                  <span className="muted sm">@{person.handle}</span>
                </span>
                <span className={`check ${on ? 'on' : ''}`}>
                  {on ? <Icon name="check" /> : null}
                </span>
              </button>
            );
          })
        ) : (
          <p className="muted sm">
            Nenhuma outra conta por aqui ainda. Convide alguém para o FluXo.
          </p>
        )}
      </div>
      <div className="confirm-acts" style={{ marginTop: 16 }}>
        <button className="btn ghost" type="button" onClick={() => actions.sharePost(post.id)}>
          <Icon name="link" /> Compartilhar fora
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={!selected.length}
          onClick={() => actions.sharePostTo(post.id, selected)}
        >
          <Icon name="send" /> Enviar{selected.length ? ` (${selected.length})` : ''}
        </button>
      </div>
    </div>
  );
}

function NewChatModal() {
  const { data, actions } = useApp();
  const [query, setQuery] = useState('');
  const people = Object.values(data.users)
    .filter(
      (person) =>
        person.name.toLowerCase().includes(query.toLowerCase()) ||
        person.handle.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h2>Nova conversa</h2>
      <div className="field">
        <input
          className="in"
          type="search"
          placeholder="Buscar pessoa"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          aria-label="Buscar pessoa"
        />
      </div>
      <div className="share-list">
        {people.length ? (
          people.map((person) => (
            <button
              type="button"
              key={person.id}
              className="share-person"
              onClick={() => actions.startChat(person.id)}
            >
              <Avatar user={person} size={38} />
              <span className="grow">
                <b className="ell" style={{ display: 'block' }}>
                  {person.name}
                </b>
                <span className="muted sm">@{person.handle}</span>
              </span>
              <Icon name="chat" />
            </button>
          ))
        ) : (
          <p className="muted sm">
            Nenhuma outra conta por aqui ainda. Quando alguém entrar no FluXo, aparece nesta
            lista.
          </p>
        )}
      </div>
    </div>
  );
}

function SwitchRow({ title, text, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>
        <b>{title}</b>
        <span className="muted sm">{text}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function FeedPrefsModal() {
  const { data, ui, actions } = useApp();
  const prefs = feedPrefs(ui.settings);
  const [interest, setInterest] = useState('');
  const [topic, setTopic] = useState('');

  const hiddenPeople = prefs.hiddenProfiles.map((id) => userOf(data, id));
  const mutedComms = prefs.mutedComms
    .map((id) => data.comms.find((item) => item.id === id))
    .filter(Boolean);
  const suggestions = [
    ...new Set([
      ...(data.me.interests || []),
      ...(data.comms || []).filter((item) => item.joined).map((item) => item.cat),
      ...CATS,
    ]),
  ].filter((item) => item && !(data.me.interests || []).includes(item));

  return (
    <div className="settings feed-prefs">
      <h2>Preferências do Feed</h2>
      <p className="muted sm">
        O algoritmo recomenda, mas você escolhe. Tudo aqui é salvo automaticamente.
      </p>

      <section className="set-block">
        <h3 className="h3">Modo preferido</h3>
        <div className="seg wrap">
          {FEED_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={prefs.mode === mode.id ? 'on' : ''}
              onClick={() => actions.setFeedPref({ mode: mode.id })}
              title={mode.hint}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section className="set-block">
        <h3 className="h3">Personalização do algoritmo</h3>
        <div className="seg wrap">
          {ALGO_LEVELS.map((level) => (
            <button
              key={level.id}
              type="button"
              className={prefs.level === level.id ? 'on' : ''}
              onClick={() => actions.setFeedPref({ level: level.id })}
              title={level.hint}
            >
              {level.label}
            </button>
          ))}
        </div>
        <p className="muted sm">
          {ALGO_LEVELS.find((item) => item.id === prefs.level)?.hint}
        </p>
        <SwitchRow
          title="Mostrar por que recomendei"
          text="Exibe uma etiqueta discreta nas publicações recomendadas."
          checked={prefs.showReasons}
          onChange={(value) => actions.setFeedPref({ showReasons: value })}
        />
      </section>

      <section className="set-block">
        <h3 className="h3">Formatos de conteúdo</h3>
        <div className="chips-wrap">
          <button
            type="button"
            className={`chip${!prefs.formats.length ? ' on' : ''}`}
            onClick={() => actions.setFeedPref({ formats: [] })}
          >
            Todos
          </button>
          {FEED_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className={`chip${prefs.formats.includes(format.id) ? ' on' : ''}`}
              onClick={() =>
                actions.setFeedPref({
                  formats: prefs.formats.includes(format.id)
                    ? prefs.formats.filter((item) => item !== format.id)
                    : [...prefs.formats, format.id],
                })
              }
            >
              {format.label}
            </button>
          ))}
        </div>
      </section>

      <section className="set-block">
        <h3 className="h3">Meus interesses</h3>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            actions.addInterest(interest);
            setInterest('');
          }}
        >
          <input
            className="in"
            value={interest}
            maxLength={40}
            placeholder="Adicionar assunto de interesse"
            onChange={(event) => setInterest(event.target.value)}
          />
          <button className="btn ghost sm" type="submit">
            <Icon name="plus" /> Adicionar
          </button>
        </form>
        <div className="chips-wrap">
          {(data.me.interests || []).map((item) => (
            <button
              key={item}
              type="button"
              className="chip on"
              onClick={() => actions.removeInterest(item)}
              title="Remover interesse"
            >
              {item} <Icon name="x" />
            </button>
          ))}
          {!(data.me.interests || []).length ? (
            <span className="muted sm">Nenhum interesse cadastrado ainda.</span>
          ) : null}
        </div>
        {suggestions.length ? (
          <div className="chips-wrap">
            <span className="muted sm">Descobrir:</span>
            {suggestions.slice(0, 10).map((item) => (
              <button
                key={item}
                type="button"
                className="chip"
                onClick={() => actions.addInterest(item)}
              >
                <Icon name="plus" /> {item}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="set-block">
        <h3 className="h3">Assuntos silenciados</h3>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            actions.muteTopic(topic);
            setTopic('');
          }}
        >
          <input
            className="in"
            value={topic}
            maxLength={40}
            placeholder="Silenciar um assunto"
            onChange={(event) => setTopic(event.target.value)}
          />
          <button className="btn ghost sm" type="submit">
            <Icon name="eyeoff" /> Silenciar
          </button>
        </form>
        <div className="chips-wrap">
          {prefs.mutedTopics.map((item) => (
            <button
              key={item}
              type="button"
              className="chip on"
              onClick={() => actions.unmuteTopic(item)}
              title="Reativar assunto"
            >
              {item} <Icon name="x" />
            </button>
          ))}
          {!prefs.mutedTopics.length ? (
            <span className="muted sm">Nenhum assunto silenciado.</span>
          ) : null}
        </div>
      </section>

      <section className="set-block">
        <h3 className="h3">Perfis e comunidades ocultados</h3>
        <div className="chips-wrap">
          {hiddenPeople.map((person) => (
            <button
              key={person.id}
              type="button"
              className="chip on"
              onClick={() => actions.setFeedPref({ hiddenProfiles: prefs.hiddenProfiles.filter((id) => id !== person.id) })}
            >
              {person.name} <Icon name="x" />
            </button>
          ))}
          {mutedComms.map((community) => (
            <button
              key={community.id}
              type="button"
              className="chip on"
              onClick={() => actions.setFeedPref({ mutedComms: prefs.mutedComms.filter((id) => id !== community.id) })}
            >
              {community.name} <Icon name="x" />
            </button>
          ))}
          {!hiddenPeople.length && !mutedComms.length ? (
            <span className="muted sm">Nada ocultado no momento.</span>
          ) : null}
        </div>
        {prefs.hiddenPosts.length ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => actions.setFeedPref({ hiddenPosts: [] })}
          >
            <Icon name="broom" /> Reexibir {prefs.hiddenPosts.length} publicações ocultadas
          </button>
        ) : null}
      </section>

      <button type="button" className="btn ghost" onClick={actions.resetFeedPrefs}>
        <Icon name="broom" /> Restaurar configurações originais
      </button>
    </div>
  );
}

function SettingsModal() {
  const { data, ui, actions, mode, canInstall, session } = useApp();
  const settings = ui.settings;
  const permission =
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  const toggleNotifications = async (next) => {
    if (next && typeof Notification === 'undefined') {
      actions.notify('Este navegador não oferece notificações.');
      return;
    }
    if (next && Notification.permission === 'denied') {
      actions.notify('As notificações estão bloqueadas nas permissões do navegador.');
      return;
    }
    if (next && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        actions.notify('Permissão de notificações não concedida.');
        return;
      }
    }
    actions.setSetting('notifications', next);
  };

  return (
    <div className="settings">
      <h2>Configurações</h2>

      <section className="set-block">
        <h3 className="h3">Aparência</h3>
        <div className="seg">
          <button
            type="button"
            className={ui.theme === 'light' ? 'on' : ''}
            onClick={() => ui.theme !== 'light' && actions.toggleTheme()}
          >
            <Icon name="sun" /> Claro
          </button>
          <button
            type="button"
            className={ui.theme === 'dark' ? 'on' : ''}
            onClick={() => ui.theme !== 'dark' && actions.toggleTheme()}
          >
            <Icon name="moon" /> Escuro
          </button>
        </div>
        <SwitchRow
          title="Reduzir animações"
          text="Desativa transições e movimentos decorativos."
          checked={settings.reduceMotion}
          onChange={(value) => actions.setSetting('reduceMotion', value)}
        />
      </section>

      <section className="set-block">
        <h3 className="h3">Mensagens</h3>
        <SwitchRow
          title="Som ao receber mensagem"
          text="Toca um aviso curto quando uma nova mensagem chega."
          checked={settings.messageSound}
          onChange={(value) => actions.setSetting('messageSound', value)}
        />
        <SwitchRow
          title="Som ao enviar"
          text="Um clique discreto confirma o envio."
          checked={settings.soundOnSend}
          onChange={(value) => actions.setSetting('soundOnSend', value)}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => actions.playTestSound()}
        >
          <Icon name="volume" /> Testar som
        </button>
      </section>

      <section className="set-block">
        <h3 className="h3">Notificações</h3>
        <SwitchRow
          title="Notificações do navegador"
          text={
            permission === 'granted'
              ? 'Permissão concedida. Avisamos quando a aba estiver em segundo plano.'
              : 'Peça permissão ao ativar. Você pode revogar no navegador.'
          }
          checked={settings.notifications && permission === 'granted'}
          onChange={toggleNotifications}
        />
        <p className="muted sm">
          Silencie conversas no botão de sino dentro do chat e ative alertas de live
          no cabeçalho do canal. Assim você só recebe o que importa.
        </p>
      </section>

      <section className="set-block">
        <h3 className="h3">Aplicativo</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn tonal sm" type="button" onClick={actions.installApp}>
            <Icon name="download" />
            {canInstall ? 'Instalar no dispositivo' : 'Como instalar'}
          </button>
          <button className="btn ghost sm" type="button" onClick={actions.clearCache}>
            <Icon name="broom" /> Limpar cache local
          </button>
        </div>
        <p className="muted sm">
          No Android, use o menu do navegador e toque em “Instalar aplicativo” ou “Adicionar à
          tela inicial” para abrir em tela cheia.
        </p>
      </section>

      <section className="set-block">
        <h3 className="h3">Conta</h3>
        <p className="muted sm">
          {session?.email || data.email} ·{' '}
          {mode === 'supabase' ? 'sincronizado na nuvem' : 'dados neste dispositivo'}
        </p>
        <button className="btn hot sm" type="button" onClick={actions.logout}>
          <Icon name="logout" /> Sair da conta
        </button>
      </section>

      <p className="muted sm settings-foot">
        FluXo 1.0.0 · {mode === 'supabase' ? 'Conectado' : 'Modo local'} · ©{' '}
        {new Date().getFullYear()}
      </p>
    </div>
  );
}

function ObsModal({ modal }) {
  const { data, actions } = useApp();
  const channel = data.chans.find((item) => item.id === modal.id);
  if (!channel) return <p className="muted">Canal indisponível.</p>;
  const url =
    location.href.split('#')[0] +
    '#conexoes/' +
    encodeURIComponent(channel.id);
  const ingressHost = import.meta.env.VITE_LIVEKIT_INGRESS_URL || '';
  const copy = async (value, message) => {
    try {
      await navigator.clipboard.writeText(value);
      actions.notify(message);
    } catch {
      actions.notify('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  return (
    <div className="obs-modal">
      <p className="muted">
        Transmita pelo OBS no computador e mantenha o chat, os corações e as
        notificações do palco funcionando no FluXo.
      </p>
      <span className={`obs-status${ingressHost ? ' on' : ''}`}>
        <Icon name={ingressHost ? 'check' : 'radio'} />{' '}
        {ingressHost ? 'Ingress RTMP configurado' : 'Ingress RTMP em preparação'}
      </span>

      <section className="set-block">
        <h3 className="h3">1. Agora, sem OBS</h3>
        <p className="muted sm">
          Entre na transmissão e use <b>Compartilhar tela</b> para mostrar o
          jogo, o navegador ou a pré-visualização do OBS. Funciona no
          Chrome/Edge do computador e não precisa instalar nada.
        </p>
      </section>

      <section className="set-block">
        <h3 className="h3">2. Com OBS</h3>
        <ol className="obs-steps">
          <li>
            No painel do LiveKit, crie um <b>Ingress</b> para a sala{' '}
            <code>{channel.id}</code> e copie a URL RTMPS e a chave.
          </li>
          <li>
            No OBS, abra <b>Configurações → Transmissão</b> e escolha o
            serviço <b>Personalizado</b>.
          </li>
          <li>
            Servidor:{' '}
            <code>
              {ingressHost || 'rtmps://SEU-INGRESS.livekit.cloud:1935/x'}
            </code>{' '}
            e cole a chave gerada no painel.
          </li>
          <li>
            Saída 1080p a 30 fps, keyframe 2 s, áudio 48 kHz. Monte a cena com
            o jogo ou a câmera.
          </li>
          <li>
            Inicie a transmissão no OBS e abra o palco no FluXo para conferir.
          </li>
        </ol>
        <p className="muted sm">
          A URL e a chave são secretas: não compartilhe a chave com o público.
        </p>
      </section>

      <section className="set-block">
        <h3 className="h3">Link do palco</h3>
        <div className="obs-copy">
          <code>{url}</code>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => copy(url, 'Link do palco copiado')}
          >
            <Icon name="link" /> Copiar
          </button>
        </div>
      </section>
    </div>
  );
}


function NotificationsModal() {
  const { data, ui, actions } = useApp();
  const notifications = data.notifications || [];
  const seen = ui.notifSeen || 0;

  useEffect(() => {
    // Ao abrir a lista, tudo conta como lido.
    actions.markNotifsSeen();
  }, []);

  if (!notifications.length) {
    return (
      <div>
        <h2>Notificações</h2>
        <p className="muted">
          Nada por aqui ainda. Quando alguém curtir a sua foto, comentar na sua
          publicação, votar em uma enquete, responder a uma pergunta, participar
          do seu desafio, mencionar você com @ ou começar a seguir você, aparece
          aqui.
        </p>
      </div>
    );
  }

  const groups = groupNotifications(notifications);

  return (
    <div className="notifications-modal">
      <h2>Notificações</h2>
      <div className="share-list notif-list">
        {groups.map((group) => {
          const n = group.kind === 'likes' ? group.latest : group.notification;
          const person = userOf(data, n.actorId);
          const post = n.postId
            ? data.posts.find((p) => p.id === n.postId)
            : null;
          const unread =
            group.kind === 'likes'
              ? group.items.some((item) => item.ts > seen)
              : n.ts > seen;
          const others = group.kind === 'likes' ? group.count - 1 : 0;
          const handle = `@${person.handle || person.name}`;
          const label = others
            ? `${handle} e ${others === 1 ? 'outra pessoa' : `outras ${others} pessoas`}`
            : handle;
          const text =
            group.kind === 'likes' && others
              ? likesGroupText(n, post)
              : notificationText(n, post);
          return (
            <button
              type="button"
              className="share-person notif-row"
              key={group.kind === 'likes' ? `likes:${group.postId}` : n.id}
              onClick={() =>
                n.communityId
                  ? actions.openComm(n.communityId)
                  : n.postId
                    ? actions.openPost(n.postId)
                    : actions.openUser(n.actorId)
              }
            >
              <Avatar user={person} size={40} />
              <span className="grow">
                <b className="ell" style={{ display: 'block' }}>
                  {label}
                </b>
                <span className="muted sm ell" style={{ display: 'block' }}>
                  {text} · {ago(n.ts)}
                </span>
              </span>
              {unread ? <span className="notif-dot" title="Nova" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmModal({ modal }) {
  const { actions } = useApp();
  const confirm = () => {
    actions.closeModal();
    modal.action?.();
  };
  return (
    <div className="confirm">
      <h2>{modal.title || 'Confirmar ação'}</h2>
      <p className="muted">{modal.text}</p>
      <div className="confirm-acts">
        <button className="btn ghost" onClick={actions.closeModal}>
          Cancelar
        </button>
        <button
          className={`btn ${modal.tone === 'hot' ? 'hot' : 'primary'}`}
          onClick={confirm}
          autoFocus
        >
          {modal.confirmLabel || 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

const MODAL_LABELS = {
  profile: 'Editar perfil',
  post: 'Publicação',
  comm: 'Comunidade',
  newcomm: 'Criar comunidade',
  newchan: 'Criar canal',
  live: 'Iniciar live',
  confirm: 'Confirmar ação',
  settings: 'Configurações',
  feedprefs: 'Preferências do feed',
  editpost: 'Editar publicação',
  share: 'Compartilhar publicação',
  newchat: 'Nova conversa',
  notifications: 'Notificações',
  obs: 'Transmitir com OBS',
  profilelist: 'Conexões',
  user: 'Perfil',
  search: 'Radar FluXo',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ModalHost() {
  const { data, ui, actions } = useApp();
  const modal = ui.modal;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const sheetRef = useRef(null);
  const modalRef = useRef(false);

  // Botão voltar fecha a janela/modal em vez de sair do app ou trocar de rota.
  useEffect(() => {
    const wasOpen = modalRef.current;
    modalRef.current = !!modal;
    if (modal && !wasOpen) {
      if (!history.state?.fluxoModal) {
        try {
          history.pushState({ ...(history.state || {}), fluxoModal: true }, '');
        } catch {
          /* histórico indisponível */
        }
      }
    } else if (!modal && wasOpen && history.state?.fluxoModal) {
      history.back();
    }
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    const onPop = (event) => {
      if (!event.state?.fluxoModal) actionsRef.current.closeModal();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    const previous = document.activeElement;
    document.body.classList.add('lock');
    const focusTimer = window.setTimeout(() => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const target =
        sheet.querySelector('[autofocus],[data-autofocus]') ||
        sheet.querySelector(FOCUSABLE);
      target?.focus?.();
    }, 0);

    const onKey = (event) => {
      if (event.key === 'Escape') {
        // Se o editor de mídia estiver aberto, só ele deve fechar.
        if (document.querySelector('.med-screen')) return;
        actionsRef.current.closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const nodes = Array.from(sheet.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.classList.remove('lock');
      window.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [modal]);

  // No mobile, arrastar a folha para baixo fecha (quando o conteúdo já está
  // no topo). Vale para perfil de outra pessoa, listas, publicações etc.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !modal) return undefined;
    let start = null;

    const reset = () => {
      sheet.style.transform = '';
      sheet.style.opacity = '';
    };

    const onStart = (event) => {
      start = null;
      if (event.touches.length !== 1 || sheet.scrollTop > 0) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    };

    const onMove = (event) => {
      if (!start) return;
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      if (dy > 0 && dy > Math.abs(dx)) {
        sheet.style.transform = `translateY(${dy}px)`;
        sheet.style.opacity = String(Math.max(0.35, 1 - dy / 460));
      }
    };

    const onEnd = (event) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      const fast = Date.now() - start.at < 320;
      start = null;
      reset();
      if ((dy > 120 || (fast && dy > 64)) && dy > Math.abs(dx) * 1.4) {
        actionsRef.current.closeModal();
      }
    };

    const onCancel = () => {
      start = null;
      reset();
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: true });
    sheet.addEventListener('touchend', onEnd, { passive: true });
    sheet.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      reset();
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onCancel);
    };
  }, [modal]);

  if (!data || !modal) return null;

  let content = null;
  let wide = false;

  if (modal.type === 'profile') {
    content = <ProfileEditModal />;
  } else if (modal.type === 'post') {
    const post = data.posts.find((p) => p.id === modal.id);
    content = post ? (
      <Post post={post} detail />
    ) : (
      <p className="muted">Publicação indisponível.</p>
    );
    wide = true;
  } else if (modal.type === 'comm') {
    const community = data.comms.find((c) => c.id === modal.id);
    content = community ? (
      <CommunityModal community={community} />
    ) : (
      <p className="muted">Comunidade indisponível.</p>
    );
    wide = true;
  } else if (modal.type === 'newcomm') {
    content = <NewCommunityModal />;
  } else if (modal.type === 'newchan') {
    content = <NewChannelModal />;
  } else if (modal.type === 'live') {
    content = <LiveModal />;
  } else if (modal.type === 'settings') {
    content = <SettingsModal />;
  } else if (modal.type === 'feedprefs') {
    content = <FeedPrefsModal />;
    wide = true;
  } else if (modal.type === 'editpost') {
    content = <EditPostModal modal={modal} />;
  } else if (modal.type === 'share') {
    content = <SharePostModal modal={modal} />;
  } else if (modal.type === 'newchat') {
    content = <NewChatModal />;
  } else if (modal.type === 'notifications') {
    content = <NotificationsModal />;
  } else if (modal.type === 'obs') {
    content = <ObsModal modal={modal} />;
    wide = true;
  } else if (modal.type === 'profilelist') {
    content = <ProfileConnectionsModal modal={modal} />;
  } else if (modal.type === 'user') {
    content = <UserModal modal={modal} />;
    wide = true;
  } else if (modal.type === 'search') {
    content = <SearchModal />;
    wide = true;
  } else if (modal.type === 'confirm') {
    content = <ConfirmModal modal={modal} />;
  }

  return (
    <div id="modal">
      <div className="scrim" onClick={actions.closeModal} />
      <div
        className={`sheet ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={MODAL_LABELS[modal.type] || 'Janela'}
        ref={sheetRef}
      >
        {modal.type !== 'search' ? (
          <button
            className="icon-btn x"
            onClick={actions.closeModal}
            aria-label="Fechar"
          >
            <Icon name="x" />
          </button>
        ) : null}
        {content}
      </div>
    </div>
  );
}
