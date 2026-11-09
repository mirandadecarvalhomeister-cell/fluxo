import { useMemo, useState } from 'react';
import { art } from '../lib/art';
import { CATS } from '../lib/seed';
import { userOf } from '../lib/selectors';
import { ago, fmt, lsGet, lsSet } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const RECENT_KEY = 'fluxo.searches';

const norm = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const readRecent = () => {
  try {
    const list = JSON.parse(lsGet(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const STOP = new Set(
  'a o e de da do das dos que em um uma para por com no na nos nas se ao aos as os é são ser foi mais como mas ou já não muito sua seu suas seus eu você ele ela nós eles elas isso isto aqui ali lá também tem ter vai vou pra pro pelo pela pelos pelas sobre entre depois antes quando onde quem qual quais tudo todo toda todos todas meu minha meus minhas'.split(
    /\s+/
  )
);

function buildTrending(data) {
  const map = new Map();
  const bump = (key, score) => {
    const cur = map.get(key) || { key, score: 0, hits: 0 };
    cur.score += score;
    cur.hits += 1;
    map.set(key, cur);
  };

  data.posts.forEach((post) => {
    const weight = 1 + (post.likes || 0) + (post.comments?.length || 0) * 2;
    const recency = post.ts
      ? Math.max(0.2, 1 - (Date.now() - post.ts) / (1000 * 60 * 60 * 24 * 14))
      : 0.5;
    const text = String(post.text || '');
    const tags = [...text.matchAll(/#([\p{L}\d_]+)/gu)].map((m) => norm(m[1]));
    tags.forEach((tag) => bump(tag, weight * 3 * recency));
    const words = norm(text).match(/[a-z0-9_]{3,}/g) || [];
    words.forEach((word) => {
      if (!STOP.has(word)) bump(word, weight * recency);
    });
  });

  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

function Section({ title, icon, children }) {
  return (
    <section className="sr-section">
      <h3 className="sr-title">
        {icon ? <Icon name={icon} /> : null} {title}
      </h3>
      {children}
    </section>
  );
}

export default function SearchModal() {
  const { data, actions } = useApp();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);

  const term = norm(query.replace(/^#+/, '')).trim();

  const remember = (value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    const next = [clean, ...recent.filter((item) => norm(item) !== norm(clean))].slice(0, 6);
    setRecent(next);
    lsSet(RECENT_KEY, JSON.stringify(next));
  };

  const clearRecent = () => {
    setRecent([]);
    lsSet(RECENT_KEY, '[]');
  };

  const trending = useMemo(() => buildTrending(data), [data]);
  const lives = useMemo(
    () => data.chans.filter((c) => c.live).sort((a, b) => (b.viewers || 0) - (a.viewers || 0)).slice(0, 4),
    [data]
  );
  const topComms = useMemo(
    () => [...data.comms].sort((a, b) => b.subs - a.subs).slice(0, 4),
    [data]
  );
  const rising = useMemo(
    () =>
      Object.values(data.users)
        .filter((u) => !data.follows.includes(u.id))
        .sort((a, b) => (b.followers || 0) - (a.followers || 0))
        .slice(0, 4),
    [data]
  );

  const postHits = term
    ? data.posts
        .filter((post) => {
          const author = userOf(data, post.by);
          return (
            norm(post.text).includes(term) ||
            norm(author.name).includes(term) ||
            norm(author.handle).includes(term) ||
            (post.by === 'me' && norm(data.me.name).includes(term))
          );
        })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 6)
    : [];
  const peopleHits = term
    ? Object.values(data.users)
        .filter(
          (u) => norm(u.name).includes(term) || norm(u.handle).includes(term)
        )
        .slice(0, 5)
    : [];
  const commHits = term
    ? data.comms
        .filter(
          (c) =>
            norm(c.name).includes(term) ||
            norm(c.desc).includes(term) ||
            norm(c.cat).includes(term)
        )
        .slice(0, 5)
    : [];
  const chanHits = term
    ? data.chans
        .filter(
          (c) =>
            norm(c.name).includes(term) ||
            norm(c.title).includes(term) ||
            norm(c.desc).includes(term)
        )
        .slice(0, 4)
    : [];

  const hasResults =
    postHits.length || peopleHits.length || commHits.length || chanHits.length;

  const openPost = (id) => {
    remember(query);
    actions.openPost(id);
  };
  const openComm = (id) => {
    remember(query);
    actions.openComm(id);
  };
  const openChan = (id) => {
    remember(query);
    actions.closeModal();
    actions.openRoom(id);
  };
  const pickTopic = (topic) => {
    setQuery(topic);
    remember(topic);
  };

  const maxScore = trending[0]?.score || 1;

  return (
    <div className="searchmodal">
      <div className="search-head">
        <h2>Radar FluXo</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={actions.closeModal}
          aria-label="Fechar busca"
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="searchbar">
        <Icon name="search" />
        <input
          autoFocus
          data-autofocus
          type="search"
          value={query}
          placeholder="Buscar pessoas, publicações, comunidades e assuntos"
          aria-label="Buscar no FluXo"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') remember(query);
          }}
        />
        {query ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>

      {!term ? (
        <>
          <div className="radar">
            <span className="radar-pulse" aria-hidden="true" />
            <div>
              <b>Radar do fluxo</b>
              <span className="muted sm">
                {lives.length} no ar · {data.posts.length} publicações · {trending.length}{' '}
                assuntos em alta
              </span>
            </div>
          </div>

          {recent.length ? (
            <Section title="Buscas recentes" icon="search">
              <div className="chips">
                {recent.map((item) => (
                  <button
                    type="button"
                    className="chip recent"
                    key={item}
                    onClick={() => setQuery(item)}
                  >
                    <Icon name="search" /> {item}
                  </button>
                ))}
                <button type="button" className="chip ghost" onClick={clearRecent}>
                  Limpar
                </button>
              </div>
            </Section>
          ) : null}

          <Section title="Assuntos do momento" icon="hash">
            {trending.length ? (
              <div className="trendlist">
                {trending.map((topic) => (
                  <button
                    type="button"
                    className="trend"
                    key={topic.key}
                    onClick={() => pickTopic(topic.key)}
                  >
                    <span
                      className="heat"
                      style={{ '--heat': `${Math.max(12, (topic.score / maxScore) * 100)}%` }}
                      aria-hidden="true"
                    />
                    <span className="trend-label">#{topic.key}</span>
                    <span className="muted sm">{fmt(topic.hits)} posts</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="chips">
                {CATS.slice(0, 8).map((cat) => (
                  <button
                    type="button"
                    className="chip"
                    key={cat}
                    onClick={() => pickTopic(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {lives.length ? (
            <Section title="No ar agora" icon="radio">
              <div className="sr-list">
                {lives.map((channel) => {
                  const owner = userOf(data, channel.owner);
                  return (
                    <button
                      type="button"
                      className="sr-row"
                      key={channel.id}
                      onClick={() => openChan(channel.id)}
                    >
                      <span
                        className="cthumb live"
                        style={{ backgroundImage: `url('${art(channel.seed, 120, 120)}')` }}
                      />
                      <span className="grow">
                        <b className="ell">{channel.title || channel.name}</b>
                        <span className="muted sm ell">
                          {owner.name} · <Icon name="eye" /> {fmt(channel.viewers)}
                        </span>
                      </span>
                      <span className="tag-live">AO VIVO</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {topComms.length ? (
            <Section title="Comunidades em alta" icon="users">
              <div className="sr-list">
                {topComms.map((community) => (
                  <button
                    type="button"
                    className="sr-row"
                    key={community.id}
                    onClick={() => openComm(community.id)}
                  >
                    <span
                      className="cthumb"
                      style={{ backgroundImage: `url('${art(community.seed, 120, 120)}')` }}
                    />
                    <span className="grow">
                      <b className="ell">{community.name}</b>
                      <span className="muted sm ell">
                        {community.cat} · {fmt(community.subs)} inscritos
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {rising.length ? (
            <Section title="Vozes em ascensão" icon="user">
              <div className="sr-list">
                {rising.map((person) => (
                  <div className="sr-row as-div" key={person.id}>
                    <Avatar user={person} size={38} />
                    <span className="grow">
                      <b className="ell">{person.name}</b>
                      <span className="muted sm ell">
                        @{person.handle} · {fmt(person.followers)} seguidores
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn tonal sm"
                      onClick={() => actions.follow(person.id)}
                    >
                      Seguir
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : hasResults ? (
        <>
          {postHits.length ? (
            <Section title="Publicações" icon="comment">
              <div className="sr-list">
                {postHits.map((post) => {
                  const author = userOf(data, post.by);
                  return (
                    <button
                      type="button"
                      className="sr-row post"
                      key={post.id}
                      onClick={() => openPost(post.id)}
                    >
                      <Avatar user={author} size={38} />
                      <span className="grow">
                        <b className="ell">
                          {author.name} <span className="muted sm">· {ago(post.ts)}</span>
                        </b>
                        <span className="sr-snippet ell">{post.text}</span>
                      </span>
                      <span className="muted sm row" style={{ gap: 8 }}>
                        <Icon name="heart" /> {fmt(post.likes)}
                        <Icon name="comment" /> {post.comments.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {commHits.length ? (
            <Section title="Comunidades" icon="users">
              <div className="sr-list">
                {commHits.map((community) => (
                  <button
                    type="button"
                    className="sr-row"
                    key={community.id}
                    onClick={() => openComm(community.id)}
                  >
                    <span
                      className="cthumb"
                      style={{ backgroundImage: `url('${art(community.seed, 120, 120)}')` }}
                    />
                    <span className="grow">
                      <b className="ell">{community.name}</b>
                      <span className="muted sm ell">
                        {community.cat} · {fmt(community.subs)} inscritos
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {chanHits.length ? (
            <Section title="Canais e lives" icon="radio">
              <div className="sr-list">
                {chanHits.map((channel) => {
                  const owner = userOf(data, channel.owner);
                  return (
                    <button
                      type="button"
                      className="sr-row"
                      key={channel.id}
                      onClick={() => openChan(channel.id)}
                    >
                      <span
                        className="cthumb"
                        style={{ backgroundImage: `url('${art(channel.seed, 120, 120)}')` }}
                      />
                      <span className="grow">
                        <b className="ell">{channel.name}</b>
                        <span className="muted sm ell">
                          {owner.name} · {fmt(channel.followers)} seguidores
                        </span>
                      </span>
                      {channel.live ? <span className="tag-live">AO VIVO</span> : null}
                    </button>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {peopleHits.length ? (
            <Section title="Pessoas" icon="user">
              <div className="sr-list">
                {peopleHits.map((person) => (
                  <div className="sr-row as-div" key={person.id}>
                    <Avatar user={person} size={38} />
                    <span className="grow">
                      <b className="ell">{person.name}</b>
                      <span className="muted sm ell">
                        @{person.handle} · {fmt(person.followers)} seguidores
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn tonal sm"
                      onClick={() => actions.follow(person.id)}
                    >
                      Seguir
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : (
        <p className="muted sm sr-empty">
          Nada encontrado para “{query}”. Tente outro termo ou um assunto em alta.
        </p>
      )}
    </div>
  );
}
