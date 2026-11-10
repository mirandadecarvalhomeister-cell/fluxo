import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { isLiveKitEnabled } from '../lib/livekit';
import { CATS, COVERS } from '../lib/seed';
import { roleOf, userOf } from '../lib/selectors';
import { ago, fmt, slug } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
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
  const mod = community.mods.includes('me');
  const candidates = data.follows.filter((id) => !community.mods.includes(id));
  const [topic, setTopic] = useState('');
  const [modSel, setModSel] = useState(candidates[0] || '');

  return (
    <>
      <div
        className="mcover"
        style={{ backgroundImage: `url('${art(community.seed, 800, 260)}')` }}
      />
      <div className="mbody">
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: '0 0 6px' }}>{community.name}</h2>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="pill acc">{community.cat}</span>
              <span className="muted sm">
                <Icon name="users" /> {fmt(community.subs)} inscritos
              </span>
              {roleOf(community) ? (
                <span className="pill sun">
                  <Icon name="shield" /> {roleOf(community)}
                </span>
              ) : null}
            </div>
          </div>
          {!owner && (
            <button
              className={`btn ${community.joined ? 'ghost' : 'primary'}`}
              onClick={() => actions.toggleComm(community.id)}
            >
              {community.joined ? 'Sair da comunidade' : 'Entrar na comunidade'}
            </button>
          )}
        </div>

        <p>{community.desc}</p>

        <section>
          <h3 className="h3">Moderação</h3>
          {community.mods.map((modId) => {
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
            {community.rules.map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="h3">Tópicos</h3>
          {community.topics.map((item) => {
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
          {!community.topics.length && <p className="muted sm">Nenhum tópico ainda.</p>}
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
  const [name, setName] = useState('');
  const [cat, setCat] = useState(CATS[0]);
  const [desc, setDesc] = useState('');
  const [rules, setRules] = useState('');
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
        });
      }}
    >
      <h2>Criar comunidade</h2>
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
              {isFollowing ? (
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

  if (!post) return <p className="muted">Publicação indisponível.</p>;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
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
          autoFocus
        />
        <span className="muted sm" style={{ textAlign: 'right' }}>
          {text.length}/600
        </span>
      </div>
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
      {post.media?.length ? (
        <p className="muted sm" style={{ marginTop: 8 }}>
          Esta publicação tem {post.media.length} mídia(s). Para trocar as mídias, exclua e
          publique novamente.
        </p>
      ) : null}
      <button className="btn primary block" type="submit" style={{ marginTop: 14 }}>
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

function StoryComposer() {
  const { actions } = useApp();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [kind, setKind] = useState('photo');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setKind(file.type.startsWith('video/') ? 'video' : 'photo');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await actions.publishStory({ text, file });
    setBusy(false);
    if (ok) actions.closeModal();
  };

  return (
    <form className="story-form" onSubmit={submit}>
      <p className="muted sm">
        Seu story aparece no topo do feed e some automaticamente em 24 horas.
      </p>
      <div className="story-pick">
        {preview ? (
          kind === 'video' ? (
            <video src={preview} muted loop autoPlay playsInline />
          ) : (
            <img src={preview} alt="" />
          )
        ) : (
          <div className="story-empty">
            <Icon name="camera" />
            <span>Escolha uma foto ou vídeo</span>
          </div>
        )}
      </div>
      <div className="story-actions">
        <label className="btn ghost sm" htmlFor="storyIn">
          <Icon name={kind === 'video' ? 'video' : 'image'} />{' '}
          {file ? 'Trocar mídia' : 'Escolher mídia'}
        </label>
        <input
          id="storyIn"
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            event.target.value = '';
          }}
        />
        {file ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setFile(null)}
          >
            <Icon name="x" /> Remover mídia
          </button>
        ) : null}
      </div>
      <textarea
        className="input"
        rows={3}
        maxLength={280}
        placeholder="Escreva uma legenda para o story..."
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        className="btn primary"
        type="submit"
        disabled={busy || (!file && !text.trim())}
      >
        <Icon name="plus" /> {busy ? 'Publicando...' : 'Publicar story'}
      </button>
    </form>
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
  editpost: 'Editar publicação',
  share: 'Compartilhar publicação',
  newchat: 'Nova conversa',
  newstory: 'Novo story',
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
    wide = true;
  } else if (modal.type === 'editpost') {
    content = <EditPostModal modal={modal} />;
  } else if (modal.type === 'share') {
    content = <SharePostModal modal={modal} />;
  } else if (modal.type === 'newchat') {
    content = <NewChatModal />;
  } else if (modal.type === 'newstory') {
    content = <StoryComposer />;
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
