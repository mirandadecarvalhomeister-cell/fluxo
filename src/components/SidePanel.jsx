import { art } from '../lib/art';
import { fmt } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';

export default function SidePanel() {
  const { data, actions, mode } = useApp();
  const people = Object.values(data.users);
  const suggestions = people.filter((u) => !data.follows.includes(u.id)).slice(0, 3);
  const hot = [...data.comms].sort((a, b) => b.subs - a.subs).slice(0, 4);

  return (
    <>
      <section className="card pad">
        <h2 className="h3">Quem seguir</h2>
        {suggestions.length ? (
          suggestions.map((u) => (
            <div className="srow" key={u.id}>
              <Avatar user={u} size={40} />
              <div className="grow">
                <b className="ell" style={{ display: 'block' }}>
                  {u.name}
                </b>
                <span className="muted sm">@{u.handle}</span>
              </div>
              <button className="btn tonal sm" onClick={() => actions.follow(u.id)}>
                Seguir
              </button>
            </div>
          ))
        ) : (
          <p className="muted sm">
            {people.length
              ? 'Você já segue todo mundo por aqui.'
              : 'Nenhuma outra conta para seguir ainda.'}
          </p>
        )}
      </section>

      <section className="card pad">
        <h2 className="h3">Comunidades em alta</h2>
        {!hot.length ? (
          <p className="muted sm">Nenhuma comunidade criada ainda. Que tal começar uma?</p>
        ) : null}
        {hot.map((c) => (
          <button
            className="srow link"
            key={c.id}
            onClick={() => actions.openComm(c.id)}
          >
            <span
              className="cthumb"
              style={{ backgroundImage: `url('${art(c.seed, 120, 120)}')` }}
            />
            <div className="grow">
              <b className="ell" style={{ display: 'block' }}>
                {c.name}
              </b>
              <span className="muted sm">{fmt(c.subs)} inscritos</span>
            </div>
          </button>
        ))}
      </section>

      <p className="foot muted sm">
        {mode === 'supabase'
          ? 'FLUXO conectado ao Supabase. Seu conteúdo é sincronizado na nuvem.'
          : 'FLUXO, versão de demonstração. Seus dados ficam só neste navegador.'}
      </p>
    </>
  );
}
