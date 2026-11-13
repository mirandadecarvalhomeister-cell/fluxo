import { useEffect, useState } from 'react';
import { art } from '../lib/art';
import { mediaOf } from '../lib/media';
import * as remote from '../lib/remote';
import { roleOf, userOf } from '../lib/selectors';
import { ago, fmt } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { TagText, Verified } from './Brand';
import Empty from './Empty';
import { Icon } from './Icon';

const coverBg = (me) => (me.cover.k === 'img' ? me.cover.v : art(me.cover.v, 1400, 420));

export function PostThumb({ post }) {
  const { data, actions } = useApp();
  const author = userOf(data, post.by);
  const media = mediaOf(post);
  const first = media[0];
  const isVideo = first?.kind === 'video' && !!first.src;
  const picture =
    first?.kind === 'photo'
      ? first.src || art(first.seed || post.seed || post.id, 500, 500)
      : !isVideo && first?.seed
        ? art(first.seed, 500, 500)
        : null;

  return (
    <button
      type="button"
      className="pgitem"
      onClick={() => actions.openPost(post.id)}
      aria-label={`Abrir publicação de ${author.name}`}
    >
      {isVideo ? (
        <video
          className="pgvideo-src"
          src={first.src}
          muted
          playsInline
          preload="metadata"
        />
      ) : picture ? (
        <img src={picture} alt="" loading="lazy" />
      ) : (
        <div className="pgtxt">
          <p>
            <TagText text={post.text || 'Publicação'} />
          </p>
        </div>
      )}
      {first?.kind === 'video' ? (
        <span className="pgvideo">
          <Icon name="play" className="fill" />
        </span>
      ) : null}
      {media.length > 1 ? <span className="pgcount">{media.length}</span> : null}
      <span className="pgov">
        <span>
          <Icon name="heart" /> {fmt(post.likes)}
        </span>
        <span>
          <Icon name="comment" /> {post.comments.length}
        </span>
        {post.views ? (
          <span>
            <Icon name="eye" /> {fmt(post.views)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function CommunityCard({ community }) {
  const { data, actions } = useApp();
  const role = roleOf(community);
  return (
    <article className="card comm">
      <div
        className="ccover"
        style={{
          backgroundImage: `url('${community.coverUrl || art(community.seed, 600, 260)}')`,
        }}
      >
        <span
          className="ccover-ic"
          style={{
            backgroundImage: `url('${
              community.iconUrl || art(community.seed + '-icone', 160, 160)
            }')`,
          }}
        />
        {community.private ? (
          <span className="pill priv">
            <Icon name="lock" /> Privada
          </span>
        ) : null}
        {role ? (
          <span className="pill sun role">
            <Icon name="shield" /> {role}
          </span>
        ) : null}
      </div>
      <div className="cbody">
        <div className="ctitle">
          <h3>{community.name}</h3>
          <span className="pill acc">{community.cat}</span>
        </div>
        <p className="muted sm clamp">{community.desc}</p>
        <div className="cmeta">
          <span>
            <Icon name="users" /> {fmt(community.subs)} inscritos
          </span>
          <div className="mods">
            {(community.mods || []).slice(0, 3).map((mod) => (
              <Avatar key={mod} user={userOf(data, mod)} size={24} />
            ))}
          </div>
        </div>
        <div className="cact">
          <button className="btn primary sm" onClick={() => actions.openComm(community.id)}>
            Abrir
          </button>
          {community.owner !== 'me' && (
            <button
              className="btn ghost sm"
              onClick={() =>
                community.invited
                  ? actions.respondCommunityInvite(community.id, community.invited, true)
                  : actions.toggleComm(community.id)
              }
            >
              {community.joined
                ? 'Sair'
                : community.pending
                  ? 'Pendente'
                  : community.invited
                    ? 'Aceitar'
                    : 'Entrar'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Profile() {
  const { data, ui, actions, session } = useApp();
  const [scrap, setScrap] = useState('');
  const [arena, setArena] = useState(null);
  const me = data.me;
  const arenaUserId = session?.id || (me?.id !== 'me' ? me?.id : null);

  useEffect(() => {
    let active = true;
    if (!arenaUserId) {
      setArena({ stats: null, history: [], hasData: false });
      return undefined;
    }
    remote
      .loadArenaProfile(arenaUserId)
      .then((profile) => {
        if (active) setArena(profile);
      })
      .catch(() => {
        if (active) setArena({ stats: null, history: [], hasData: false });
      });
    return () => {
      active = false;
    };
  }, [arenaUserId]);
  const mine = data.posts
    .filter((p) => p.by === 'me' && p.kind !== 'story')
    .sort((a, b) => b.ts - a.ts);
  const saved = data.posts
    .filter((p) => p.saved && p.kind !== 'story')
    .sort((a, b) => b.ts - a.ts);
  const joined = data.comms.filter((c) => c.joined);
  const created = data.comms.filter((c) => c.owner === 'me');
  const following = joined.filter((c) => c.owner !== 'me');
  const discover = data.comms.filter((c) => !c.joined);
  const tab = ui.profTab;

  let body = null;
  if (tab === 'saved') {
    body = saved.length ? (
      <div className="postgrid">
        {saved.map((post) => (
          <PostThumb key={post.id} post={post} />
        ))}
      </div>
    ) : (
      <Empty
        title="Nenhuma publicação salva"
        text="Toque no marcador de uma publicação para guardar e ler depois."
      >
        <button className="btn primary" onClick={() => actions.go('feed')}>
          Explorar o feed
        </button>
      </Empty>
    );
  } else if (tab === 'posts') {
    body = mine.length ? (
      <div className="postgrid">
        {mine.map((post) => (
          <PostThumb key={post.id} post={post} />
        ))}
      </div>
    ) : (
      <Empty
        title="Nenhuma publicação ainda"
        text="Conte o que está rolando por aí. A primeira publicação aparece aqui."
      >
        <button
          className="btn primary"
          onClick={() => {
            actions.go('feed');
            setTimeout(() => document.getElementById('ctext')?.focus(), 60);
          }}
        >
          Criar publicação
        </button>
      </Empty>
    );
  } else {
    body = (
      <>
        <div className="sechead">
          <h2 className="h2">Criadas por você</h2>
          <button className="btn tonal sm" onClick={actions.openNewComm}>
            <Icon name="plus" /> Criar comunidade
          </button>
        </div>
        {created.length ? (
          <div className="cgrid">
            {created.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 22 }}>
            <Empty
              title="Você ainda não criou comunidades"
              text="Crie uma para reunir gente em torno de um assunto e escolha quem modera."
            >
              <button className="btn primary" onClick={actions.openNewComm}>
                Criar a primeira
              </button>
            </Empty>
          </div>
        )}

        <div className="sechead">
          <h2 className="h2">Que você segue</h2>
        </div>
        {following.length ? (
          <div className="cgrid">
            {following.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ marginBottom: 22 }}>
            Você ainda não entrou em nenhuma comunidade.
          </p>
        )}

        <div className="sechead">
          <h2 className="h2">Descobrir</h2>
        </div>
        {discover.length ? (
          <div className="cgrid">
            {discover.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        ) : (
          <p className="muted">Você já está em todas as comunidades disponíveis.</p>
        )}
      </>
    );
  }

  return (
    <>
      <section className="card" style={{ overflow: 'visible' }}>
        <div className="cover" style={{ backgroundImage: `url('${coverBg(me)}')` }}>
          <label className="edit" htmlFor="coverIn">
            <Icon name="camera" /> Alterar capa
          </label>
          <input
            id="coverIn"
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

        <div className="phead">
          <div className="avwrap">
            <span className="ring">
              <Avatar user={me} size={112} />
            </span>
            <label className="cam" htmlFor="avIn" aria-label="Alterar foto de perfil">
              <Icon name="camera" />
            </label>
            <input
              id="avIn"
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
          <div className="pinfo">
            <h1>
              {me.name} <Verified user={me} />
            </h1>
            <span className="muted">
              @{me.handle}
              {me.city ? ` · ${me.city}` : ''}
            </span>
            <p className="bio">{me.bio}</p>
          </div>
          <button
            className="btn ghost"
            onClick={actions.openEditProfile}
            style={{ marginBottom: 6 }}
          >
            <Icon name="edit" /> Editar perfil
          </button>
        </div>

        <div className="stats">
          <button
            type="button"
            className="statbtn"
            onClick={() => actions.setProfTab('posts')}
          >
            <b>{mine.length}</b>
            <span>Publicações</span>
          </button>
          <button
            type="button"
            className="statbtn"
            onClick={() => actions.openProfileList('followers')}
          >
            <b>{fmt(me.followers)}</b>
            <span>Seguidores</span>
          </button>
          <button
            type="button"
            className="statbtn"
            onClick={() => actions.openProfileList('following')}
          >
            <b>{data.follows.length}</b>
            <span>Seguindo</span>
          </button>
          <button
            type="button"
            className="statbtn"
            onClick={() => actions.openProfileList('communities')}
          >
            <b>{joined.length}</b>
            <span>Comunidades</span>
          </button>
        </div>
      </section>

      <div className="pgrid">
        <aside className="about">
          <section className="card pad">
            <h2 className="h3">Sobre mim</h2>
            <dl>
              <div>
                <dt>Humor</dt>
                <dd>{me.humor || 'Sem humor definido'}</dd>
              </div>
              <div>
                <dt>Interesses</dt>
                <dd className="chips">
                  {(me.interests || []).length ? (
                    me.interests.map((interest) => (
                      <span className="pill acc" key={interest}>
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Nenhum ainda</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>No fluxo desde</dt>
                <dd>
                  {new Date(me.since).toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card arena-profile">
            <div className="arena-profile-head">
              <h3>
                <Icon name="game" /> Arena do Caos
              </h3>
              <button
                type="button"
                className="btn tonal sm"
                onClick={() => actions.openArena('')}
              >
                <Icon name="play" /> Jogar agora
              </button>
            </div>
            {arena?.hasData && arena.stats ? (
              <>
                <div className="arena-stats-grid">
                  <div className="arena-stat">
                    <strong>{arena.stats.matches}</strong>
                    <span>Partidas</span>
                  </div>
                  <div className="arena-stat">
                    <strong>{arena.stats.wins}</strong>
                    <span>Vitórias</span>
                  </div>
                  <div className="arena-stat">
                    <strong>{arena.stats.kills}</strong>
                    <span>Eliminações</span>
                  </div>
                  <div className="arena-stat">
                    <strong>{arena.stats.best ? `#${arena.stats.best}` : '—'}</strong>
                    <span>Melhor posição</span>
                  </div>
                </div>
                {arena.history?.length ? (
                  <div className="arena-history">
                    {arena.history.slice(0, 5).map((match) => (
                      <div
                        className={`arena-history-item ${match.isWinner ? 'win' : ''}`}
                        key={match.matchId}
                      >
                        <span className="pos">
                          {match.isWinner ? '🏆' : `#${match.placement || '-'}`}
                        </span>
                        <span className="grow muted sm">
                          {match.kills || 0} abates • {match.damage || 0} dano
                        </span>
                        <span className="muted sm">{ago(match.playedAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted sm">
                {arenaUserId
                  ? 'Nenhuma partida registrada ainda. Entre na Arena e dispute o ranking.'
                  : 'Entre com sua conta para registrar partidas e aparecer no ranking.'}
              </p>
            )}
          </section>

          <section className="card pad">
            <h2 className="h3">Recados</h2>
            {me.scraps.length ? (
              me.scraps.map((item, index) => {
                const author = userOf(data, item.by);
                return (
                  <div className="scrap" key={item.id || index}>
                    <Avatar user={author} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <b className="sm">{author.name}</b>{' '}
                      <span className="muted sm">{ago(item.ts)}</span>
                      <p>
                        <TagText text={item.text} />
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="muted sm">Nenhum recado ainda. Deixe o primeiro.</p>
            )}
            <form
              className="cmform"
              style={{ marginTop: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                actions.addScrap(scrap);
                setScrap('');
              }}
            >
              <input
                className="in"
                type="text"
                maxLength={200}
                placeholder="Escreva um recado"
                aria-label="Recado"
                value={scrap}
                onChange={(event) => setScrap(event.target.value)}
              />
              <button className="btn primary sm" type="submit">
                Enviar
              </button>
            </form>
          </section>
        </aside>

        <div style={{ minWidth: 0 }}>
          <div className="ptabs" role="tablist">
            <button
              className={tab === 'posts' ? 'on' : ''}
              onClick={() => actions.setProfTab('posts')}
            >
              Publicações
            </button>
            <button
              className={tab === 'saved' ? 'on' : ''}
              onClick={() => actions.setProfTab('saved')}
            >
              Salvos
            </button>
            <button
              className={tab === 'comms' ? 'on' : ''}
              onClick={() => actions.setProfTab('comms')}
            >
              Comunidades
            </button>
          </div>
          {body}
        </div>
      </div>
    </>
  );
}
