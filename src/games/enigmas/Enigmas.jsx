import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Icon } from '../../components/Icon';
import {
  TOTAL_LEVELS,
  clearSave,
  isCorrect,
  levelAt,
  medalFor,
  newSave,
  pointsForLevel,
  readRank,
  readSave,
  recordScore,
  writeSave,
} from './enigmasData';

const INCENTIVES = [
  'Mente afiada. Continue assim!',
  'Excelente raciocínio!',
  'Você está cada vez mais perto do topo.',
  'Solução encontrada. Avance!',
  'Nada escapa de você.',
];

export default function Enigmas() {
  const { data, actions } = useApp();
  const [screen, setScreen] = useState('home');
  const [save, setSave] = useState(readSave);
  const [rank, setRank] = useState(readRank);
  const [level, setLevel] = useState(1);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [hintsShown, setHintsShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  useEffect(() => {
    let alive = true;
    actions
      .loadEnigmaRanking?.()
      .then((list) => {
        if (alive && Array.isArray(list) && list.length) setRank(list);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [actions]);

  const puzzle = levelAt(level - 1);

  function persist(next) {
    setSave(next);
    writeSave(next);
  }

  function beginLevel(n, current = save) {
    setLevel(n);
    setInput('');
    setHintsShown(0);
    setStatus(null);
    setMessage('');
    setScreen('playing');
    void current;
  }

  function newGame() {
    actions.requestConfirm({
      title: 'Novo jogo',
      text: 'Tem certeza que deseja iniciar um novo jogo? Todo o progresso anterior será perdido.',
      confirmLabel: 'CONFIRMAR',
      cancelLabel: 'CANCELAR',
      tone: 'hot',
      action: () => {
        clearSave();
        const fresh = newSave();
        persist(fresh);
        beginLevel(1, fresh);
      },
    });
  }

  function continueGame() {
    if (!save) return;
    if (save.finished) {
      setScreen('complete');
      return;
    }
    beginLevel(save.level);
  }

  function answer() {
    if (!puzzle || busy) return;
    if (!isCorrect(input, puzzle)) {
      setStatus('wrong');
      setMessage('Resposta incorreta! Pense mais um pouco.');
      persist({ ...save, attempts: (save?.attempts || 0) + 1 });
      timers.current.push(setTimeout(() => setStatus(null), 700));
      return;
    }

    setStatus('correct');
    const next = {
      level: Math.min(level + 1, TOTAL_LEVELS),
      score: (save?.score || 0) + pointsForLevel(hintsShown),
      hints: save?.hints || 0,
      attempts: (save?.attempts || 0) + 1,
      finished: level >= TOTAL_LEVELS,
    };
    persist(next);
    const reached = Math.min(level + 1, TOTAL_LEVELS);
    setRank(
      recordScore({
        runId: save?.runId,
        name: data.me?.name || 'Você',
        level: reached,
        score: next.score,
        hints: next.hints,
      })
    );
    Promise.resolve(
      actions.recordEnigmaScore?.({
        level: reached,
        score: next.score,
        hints: next.hints,
      })
    )
      .then((saved) => {
        if (!saved) return undefined;
        return actions.loadEnigmaRanking?.().then((list) => {
          if (Array.isArray(list) && list.length) setRank(list);
        });
      })
      .catch(() => undefined);
    setMessage(INCENTIVES[(level - 1) % INCENTIVES.length]);
    setBusy(true);
    timers.current.push(
      setTimeout(() => {
        setBusy(false);
        if (next.finished) setScreen('complete');
        else beginLevel(next.level, next);
      }, 1400)
    );
  }

  function revealHint() {
    if (hintsShown >= (puzzle?.hints.length || 0)) return;
    setHintsShown((count) => count + 1);
    persist({ ...save, hints: (save?.hints || 0) + 1 });
  }

  function shareToFeed() {
    const reached = screen === 'complete' ? TOTAL_LEVELS : level;
    actions.publish(
      `🧩 Cheguei ao nível ${reached} de ${TOTAL_LEVELS} nos Enigmas do Fluxo! "Consegue chegar mais longe?"`
    );
    actions.notify?.('Desafio compartilhado no feed!');
  }

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}#conexoes/enigmas`;
    try {
      await navigator.clipboard.writeText(url);
      actions.notify?.('Link copiado!');
    } catch {
      actions.notify?.('Não foi possível copiar o link.');
    }
  }

  function rankList(limit = 8) {
    return rank.slice(0, limit).map((entry, index) => (
      <div className="enigmas-rank-row" key={`${entry.runId}-${index}`}>
        <span className="enigmas-rank-medal">{medalFor(index) || `#${index + 1}`}</span>
        <span className="grow">
          <b>{entry.name}</b>
          <small> nível {entry.level} · {entry.score} pts</small>
        </span>
      </div>
    ));
  }

  return (
    <div className="enigmas-game">
      <header className="enigmas-top">
        <button
          className="icon-btn enigmas-back"
          type="button"
          onClick={actions.closeEnigmas}
          aria-label="Voltar para Conexões"
        >
          <Icon name="back" />
        </button>
        <div className="enigmas-brand">
          <span className="enigmas-mark">◇</span>
          <span>ENIGMAS</span>
        </div>
        <span className="enigmas-top-progress">
          {screen === 'playing' ? `${level} / ${TOTAL_LEVELS}` : `${save?.score || 0} pts`}
        </span>
        {save ? (
          <button
            className="icon-btn enigmas-share"
            type="button"
            onClick={shareToFeed}
            aria-label="Compartilhar progresso"
            title="Compartilhar no feed"
          >
            <Icon name="share" />
          </button>
        ) : null}
      </header>

      {screen === 'home' ? (
        <section className="enigmas-home enigmas-fade">
          <div className="enigmas-logo" aria-hidden="true">
            <span>◇</span>
          </div>
          <h1>ENIGMAS</h1>
          <p className="enigmas-tagline">Você consegue resolver todos os enigmas?</p>
          <div className="enigmas-home-actions">
            <button
              className="btn enigmas-btn primary"
              type="button"
              disabled={!save}
              onClick={continueGame}
            >
              <Icon name="play" /> CONTINUAR
            </button>
            <button className="btn enigmas-btn ghost" type="button" onClick={newGame}>
              <Icon name="plus" /> NOVO JOGO
            </button>
          </div>
          {save ? (
            <div className="enigmas-progress">
              <div className="enigmas-progress-bar">
                <span style={{ width: `${Math.round(((save.level - 1) / TOTAL_LEVELS) * 100)}%` }} />
              </div>
              <span>
                Nível {save.level} de {TOTAL_LEVELS} · {save.score} pontos · {save.hints} dicas
              </span>
            </div>
          ) : (
            <p className="enigmas-hint-text">Nenhuma partida salva. Comece um novo jogo.</p>
          )}
          {save ? (
            <div className="enigmas-home-actions">
              <button className="btn enigmas-btn ghost" type="button" onClick={shareToFeed}>
                <Icon name="share" /> COMPARTILHAR
              </button>
              <button className="btn enigmas-btn ghost" type="button" onClick={copyInvite}>
                <Icon name="link" /> COPIAR LINK
              </button>
            </div>
          ) : null}
          {rank.length ? (
            <div className="enigmas-rank">
              <b>RANKING GLOBAL · ATÉ ONDE VOCÊ CHEGOU</b>
              {rankList()}
            </div>
          ) : null}
          <p className="enigmas-rule">100 níveis · progressão obrigatória e sequencial</p>
        </section>
      ) : null}

      {screen === 'playing' && puzzle ? (
        <section className="enigmas-play enigmas-fade" key={level}>
          <div className="enigmas-level-badge">
            NÍVEL {String(level).padStart(2, '0')} <span>· {TOTAL_LEVELS}</span>
          </div>
          <h2 className="enigmas-title">{puzzle.title}</h2>
          <p className="enigmas-statement">{puzzle.text}</p>

          <div className="enigmas-hints">
            <button
              className="btn enigmas-hint-btn"
              type="button"
              onClick={revealHint}
              disabled={hintsShown >= puzzle.hints.length}
            >
              <Icon name="spark" /> DICA {hintsShown ? `(${hintsShown}/${puzzle.hints.length})` : ''}
            </button>
            {puzzle.hints.slice(0, hintsShown).map((hint, index) => (
              <p className="enigmas-hint" key={index}>
                <b>{index + 1}.</b> {hint}
              </p>
            ))}
          </div>

          <form
            className="enigmas-answer-form"
            onSubmit={(event) => {
              event.preventDefault();
              answer();
            }}
          >
            <input
              className={`enigmas-input${status === 'wrong' ? ' wrong' : ''}${status === 'correct' ? ' correct' : ''}`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua resposta"
              aria-label="Resposta do enigma"
              autoComplete="off"
              disabled={busy}
            />
            <button className="btn enigmas-btn primary" type="submit" disabled={busy}>
              RESPONDER
            </button>
          </form>

          {message ? (
            <p
              className={`enigmas-feedback${status === 'wrong' ? ' wrong' : ''}${status === 'correct' ? ' correct' : ''}`}
            >
              {status === 'correct' ? `CORRETO! ${message}` : message}
            </p>
          ) : null}
          {status === 'correct' ? (
            <div className="enigmas-success" aria-hidden="true">
              <span>✓</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {screen === 'complete' ? (
        <section className="enigmas-home enigmas-fade">
          <div className="enigmas-logo enigmas-logo-win">◇</div>
          <h1>VOCÊ CONSEGUIU!</h1>
          <p className="enigmas-tagline">
            Resolveu todos os {TOTAL_LEVELS} enigmas e terminou com {save?.score || 0} pontos.
          </p>
          <div className="enigmas-home-actions">
            <button className="btn enigmas-btn primary" type="button" onClick={shareToFeed}>
              <Icon name="share" /> COMPARTILHAR
            </button>
            <button className="btn enigmas-btn ghost" type="button" onClick={() => setScreen('home')}>
              VOLTAR AO INÍCIO
            </button>
          </div>
          {rank.length ? (
            <div className="enigmas-rank">
              <b>RANKING GLOBAL · ATÉ ONDE VOCÊ CHEGOU</b>
              {rankList()}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
