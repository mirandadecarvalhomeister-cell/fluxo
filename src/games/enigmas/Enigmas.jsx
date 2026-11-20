import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Icon } from '../../components/Icon';
import Game3DBackground from '../../components/Game3DBackground';
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

function EnigmaMark({ className = '' }) {
  return (
    <svg
      className={`enigmas-mark-svg ${className}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nz-edge" x1="12" y1="10" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22e6ff" />
          <stop offset="1" stopColor="#9a5cff" />
        </linearGradient>
        <radialGradient id="nz-core">
          <stop stopColor="#22e6ff" />
          <stop offset="1" stopColor="#5b2bd9" />
        </radialGradient>
      </defs>
      <path d="M50 5 92 50 50 95 8 50Z" stroke="url(#nz-edge)" strokeWidth="2.4" />
      <path d="M50 20 76 50 50 80 24 50Z" stroke="url(#nz-edge)" strokeWidth="1.6" opacity=".8" />
      <path d="M50 34 64 50 50 66 36 50Z" fill="url(#nz-core)" opacity=".9" />
      <circle cx="50" cy="50" r="5" fill="#eafcff" />
      <path d="M8 50h16M76 50h16M50 5v15M50 80v15" stroke="#22e6ff" strokeWidth="1.4" opacity=".65" />
    </svg>
  );
}

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
    const normalized = { ...next, runId: next.runId || String(Date.now()) };
    setSave(normalized);
    writeSave(normalized);
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
    // Relê o progresso do armazenamento: o estado em memória pode estar
    // desatualizado se a aba foi recarregada ou o jogo reaberto.
    const stored = readSave() || save;
    if (!stored) {
      actions.notify?.('Nenhuma partida salva. Comece um novo jogo.');
      return;
    }
    setSave(stored);
    if (stored.finished) {
      setScreen('complete');
      return;
    }
    beginLevel(stored.level, stored);
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
      runId: save?.runId || String(Date.now()),
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
      `🧩 Cheguei ao nível ${reached} de ${TOTAL_LEVELS} no NÍVEL ZERO do Fluxo! "Consegue chegar mais longe?"`
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
      <Game3DBackground variant="enigmas" intensity={status === 'correct' ? 0.6 : 0} />
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
          <EnigmaMark className="enigmas-mark" />
          <span>NÍVEL ZERO</span>
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
          <div className="enigmas-intro">
            <div className="enigmas-intro-copy">
              <span className="enigmas-eyebrow"><Icon name="spark" /> DESAFIO DE LÓGICA</span>
              <b className="enigmas-title-solid">NÍVEL ZERO</b>
              <h1 aria-hidden="true">NÍVEL ZERO</h1>
              <p>
                100 enigmas em sequência, sem voltar e sem pular. Cada resposta
                certa desbloqueia o próximo nível — cada dica custa pontos.
                Até onde você chega?
              </p>
            </div>
            <div className="enigmas-intro-mark" aria-hidden="true">
              <EnigmaMark />
              <span className="enigmas-intro-spark">✦</span>
            </div>
          </div>

          <div className="enigmas-modes" role="group" aria-label="Regras do NÍVEL ZERO">
            <div className="enigmas-mode on">
              <span className="enigmas-mode-emoji">🧩</span>
              <span className="enigmas-mode-body">
                <b>100 enigmas</b>
                <small>Progressão sequencial obrigatória</small>
              </span>
            </div>
            <div className="enigmas-mode">
              <span className="enigmas-mode-emoji">💡</span>
              <span className="enigmas-mode-body">
                <b>3 dicas por nível</b>
                <small>Cada dica reduz 20 pontos</small>
              </span>
            </div>
            <div className="enigmas-mode">
              <span className="enigmas-mode-emoji">🏆</span>
              <span className="enigmas-mode-body">
                <b>Ranking global</b>
                <small>Compita por quem vai mais longe</small>
              </span>
            </div>
          </div>

          <div className="enigmas-setup">
            <div className="enigmas-progress-card">
              <div className="enigmas-progress-head">
                <b>Seu progresso</b>
                <span>
                  {save
                    ? `${Math.round(((save.level - 1) / TOTAL_LEVELS) * 100)}% concluído`
                    : 'Nenhuma partida salva'}
                </span>
              </div>
              <div className="enigmas-progress-bar">
                <span style={{ width: `${save ? Math.round(((save.level - 1) / TOTAL_LEVELS) * 100) : 0}%` }} />
              </div>
              <div className="enigmas-progress-stats">
                <span><b>Nível</b> {save?.level || 1}/{TOTAL_LEVELS}</span>
                <span><b>Pontos</b> {save?.score || 0}</span>
                <span><b>Dicas</b> {save?.hints || 0}</span>
                <span><b>Tentativas</b> {save?.attempts || 0}</span>
              </div>
            </div>
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
              <div className="enigmas-home-actions">
                <button className="btn enigmas-btn ghost" type="button" onClick={shareToFeed}>
                  <Icon name="share" /> COMPARTILHAR
                </button>
                <button className="btn enigmas-btn ghost" type="button" onClick={copyInvite}>
                  <Icon name="link" /> COPIAR LINK
                </button>
              </div>
            ) : (
              <p className="enigmas-hint-text">Comece um novo jogo para salvar seu progresso.</p>
            )}
          </div>

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
          <div className="enigmas-play-brand">
            <EnigmaMark /> <span>NÍVEL ZERO</span>
          </div>
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
          <div className="enigmas-logo enigmas-logo-win">
            <EnigmaMark />
          </div>
          <div className="enigmas-play-brand enigmas-play-brand-center">
            <EnigmaMark /> <span>NÍVEL ZERO</span>
          </div>
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
