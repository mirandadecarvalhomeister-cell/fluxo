import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useApp } from '../../store/AppContext';
import { fmt, shareLink } from '../../lib/utils';
import { quizCardImage } from '../../lib/quizCard';
import { ALL_CATEGORY, CATEGORIES, buildRound, categoryById, poolFor } from './bank';
import {
  BONUS_ROUNDS,
  CLASSIC_FUSE_SECONDS,
  FREE_ROUNDS,
  MODES,
  ROUND_SIZES,
  beginRun,
  challengeLink,
  claimInvite,
  comboFor,
  fetchChallenge,
  finishRun,
  inviteLink,
  loadMedals,
  medalName,
  modeById,
  pointsFor,
  readBest,
  readQuizParams,
  roundStatus,
  runSeconds,
  saveMedal,
  rankings as loadRankings,
} from './quizData';

const LETTERS = ['A', 'B', 'C', 'D'];
const BEST_KEY = 'fluxo.quiz.best';

const fuseColor = (ratio) => {
  if (ratio > 0.55) return 'linear-gradient(90deg, #31d158, #9ff34a)';
  if (ratio > 0.3) return 'linear-gradient(90deg, #ffc93c, #ffb020)';
  if (ratio > 0.15) return 'linear-gradient(90deg, #ff8a3c, #ff5a3c)';
  return 'linear-gradient(90deg, #ff2d87, #ff5a3c)';
};

const newRunId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const medalIcon = (position) => {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return null;
};

function Stat({ label, value, hint }) {
  return (
    <div className="quiz-stat">
      <b>{value}</b>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function RankRow({ row, me, compact = false }) {
  return (
    <div className={`quiz-rank-row${row.position <= 3 ? ` top top-${row.position}` : ''}${me ? ' me' : ''}${compact ? ' compact' : ''}`}>
      <span className="quiz-rank-pos">
        {medalIcon(row.position) || <b>{row.position}</b>}
      </span>
      <Avatar
        user={{ id: row.userId, name: row.name, avatar: row.avatar }}
        size={compact ? 34 : 38}
      />
      <span className="quiz-rank-name">
        <b className="ell">{row.name}</b>
        <small className="ell">
          {row.handle ? `@${String(row.handle).replace(/^@/, '')}` : 'Jogador do Fluxo'}
          {row.bestCombo ? ` · combo ${row.bestCombo}x` : ''}
        </small>
      </span>
      <span className="quiz-rank-score">
        <b>{fmt(row.score)}</b>
        <small>{row.rounds ? `${row.rounds} rodada${row.rounds > 1 ? 's' : ''}` : 'pts'}</small>
      </span>
    </div>
  );
}

function ChallengePicker({
  open,
  friends,
  chosen,
  onToggle,
  onClose,
  onSend,
  sharing,
}) {
  if (!open) return null;
  return (
    <div className="quiz-picker-layer">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Fechar desafio"
        onClick={onClose}
      />
      <div className="quiz-picker" role="dialog" aria-label="Desafiar amigo">
        <header>
          <b>Desafiar um amigo</b>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" />
          </button>
        </header>
        <p className="muted sm">
          O desafio vai por mensagem no Fluxo com link para jogar fora também.
        </p>
        {friends.length ? (
          <div className="quiz-picker-list">
            {friends.map((friend) => {
              const on = chosen.includes(friend.id);
              return (
                <button
                  type="button"
                  key={friend.id}
                  className={on ? 'on' : ''}
                  onClick={() => onToggle(friend.id)}
                >
                  <Avatar user={friend} size={38} />
                  <span className="grow ell">
                    <b>{friend.name}</b>
                    {friend.handle ? <small>@{friend.handle}</small> : null}
                  </span>
                  <span className={`quiz-check${on ? ' on' : ''}`}>
                    {on ? <Icon name="check" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="empty-note">
            Você ainda não segue ninguém. Use “Compartilhar fora do Fluxo”
            para mandar o desafio por qualquer app.
          </p>
        )}
        <div className="quiz-picker-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onSend}
            disabled={!chosen.length || sharing}
          >
            <Icon name="send" /> {sharing ? 'Enviando…' : 'Enviar desafio'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuizBoom() {
  const { data, ui, actions } = useApp();
  const [screen, setScreen] = useState('home');
  const [mode, setMode] = useState('classic');
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [size, setSize] = useState(10);
  const [round, setRound] = useState([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(CLASSIC_FUSE_SECONDS);
  const [totalTime, setTotalTime] = useState(CLASSIC_FUSE_SECONDS);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [best, setBest] = useState(readBest);
  const [stats, setStats] = useState({
    correct: 0,
    wrong: 0,
    timeouts: 0,
    answered: 0,
  });
  const [shake, setShake] = useState(false);
  const [comboFlash, setComboFlash] = useState(null);
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [ranks, setRanks] = useState({ global: [], friends: [], online: false });
  const [rankTab, setRankTab] = useState('global');
  const [medals, setMedals] = useState([]);
  const [newMedal, setNewMedal] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [challengeOutcome, setChallengeOutcome] = useState(null);
  const [targetScore, setTargetScore] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [reason, setReason] = useState('finished');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenFriends, setChosenFriends] = useState([]);
  const [sharing, setSharing] = useState(false);

  const advanceRef = useRef(null);
  const shakeRef = useRef(null);
  const comboRef = useRef(null);
  const finishedRef = useRef(false);
  const startedAtRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestComboRef = useRef(0);
  const statsRef = useRef({ correct: 0, wrong: 0, timeouts: 0, answered: 0 });
  const roundRef = useRef([]);
  const categoryRef = useRef(categoryId);
  const modeRef = useRef(mode);
  const runIdRef = useRef('');
  const runOnlineRef = useRef(false);
  const challengeRef = useRef(null);
  const targetRef = useRef(null);
  const inviteRef = useRef(false);
  const challengeLoadedRef = useRef(null);

  const category = useMemo(() => categoryById(categoryId), [categoryId]);
  const available = useMemo(() => poolFor(categoryId).length, [categoryId]);
  const roundSize = Math.min(size, available);
  const question = round[index];
  const total = round.length;
  const answered = stats.correct + stats.wrong;
  const accuracy = answered ? Math.round((stats.correct / answered) * 100) : 0;
  const modeInfo = modeById(mode);
  const limit = mode === 'insane' ? totalTime || runSeconds(mode, roundSize) : CLASSIC_FUSE_SECONDS;
  const timeRatio = Math.max(0, Math.min(1, timeLeft / Math.max(1, limit)));
  const combo = comboFor(streak);
  const remaining = status?.remaining ?? FREE_ROUNDS;
  const isMe = useCallback(
    (row) => {
      if (!row) return false;
      const myHandle = String(data?.me?.handle || '').replace(/^@/, '').toLowerCase();
      const myName = String(data?.me?.name || '').toLowerCase();
      return (
        row.userId === data?.me?.id ||
        (myHandle && String(row.handle || '').replace(/^@/, '').toLowerCase() === myHandle) ||
        (!myHandle && myName && String(row.name || '').toLowerCase() === myName)
      );
    },
    [data?.me?.handle, data?.me?.id, data?.me?.name]
  );

  const clearPending = useCallback(() => {
    if (advanceRef.current) {
      window.clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
    if (shakeRef.current) {
      window.clearTimeout(shakeRef.current);
      shakeRef.current = null;
    }
    if (comboRef.current) {
      window.clearTimeout(comboRef.current);
      comboRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPending(), [clearPending]);

  const refreshStatus = useCallback(async () => {
    const next = await roundStatus();
    setStatus(next);
    return next;
  }, []);

  const refreshRankings = useCallback(async () => {
    const next = await loadRankings({
      follows: data?.follows || [],
      me: data?.me || null,
      limit: 50,
    });
    setRanks(next);
  }, [data?.follows, data?.me]);

  const refreshMedals = useCallback(async () => {
    setMedals(await loadMedals(Boolean(data?.me?.id && data.me.id !== 'me')));
  }, [data?.me?.id]);

  useEffect(() => {
    refreshStatus();
    refreshRankings();
    refreshMedals();
  }, [refreshStatus, refreshRankings, refreshMedals]);

  // Convite recebido por link/param: libera +3 rodadas uma única vez.
  useEffect(() => {
    if (inviteRef.current) return;
    const params = readQuizParams();
    const inviter = ui.quizInvite || params.invite;
    if (!inviter) return;
    inviteRef.current = true;
    claimInvite(inviter).then((ok) => {
      if (!ok) return;
      actions.notify?.(`Convite aceito! Você ganhou +${BONUS_ROUNDS} rodadas.`);
      refreshStatus();
    });
  }, [ui.quizInvite, actions, refreshStatus]);

  // Desafio aberto pelo chat, por link ou pela própria tela.
  useEffect(() => {
    const params = readQuizParams();
    const id = ui.quizChallenge || params.challenge;
    if (!id || challengeLoadedRef.current === id) return;
    challengeLoadedRef.current = id;
    fetchChallenge(id, true).then((loaded) => {
      if (!loaded) {
        actions.notify?.('Não encontramos esse desafio.');
        return;
      }
      setChallenge(loaded);
      setMode(loaded.mode);
      setCategoryId(loaded.category);
      setSize(loaded.size);
    });
  }, [ui.quizChallenge, actions]);

  const saveBest = (value) => {
    if (value <= best) return;
    setBest(value);
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch {
      /* armazenamento indisponível */
    }
  };

  const finishRound = useCallback(
    (why) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearPending();
      const currentStats = statsRef.current;
      const result = {
        score: scoreRef.current,
        correct: currentStats.correct,
        wrong: currentStats.wrong,
        timeouts: currentStats.timeouts,
        answered: currentStats.correct + currentStats.wrong,
        total: roundRef.current.length,
        bestCombo: bestComboRef.current,
        categoryId: categoryRef.current,
        categoryName: categoryById(categoryRef.current).name,
        mode: modeRef.current,
        durationMs: Math.max(0, Date.now() - startedAtRef.current),
        userId: data?.me?.id || 'me',
        name: data?.me?.name || 'Você',
        handle: data?.me?.handle || '',
        avatar: data?.me?.avatar || null,
      };
      setFinalResult(result);
      setReason(why);
      setScreen(
        why === 'timeout' && modeRef.current === 'classic' ? 'boom' : 'results'
      );
      finishRun(runIdRef.current, result, runOnlineRef.current).then(saveBest);
      refreshStatus();

      const perfect =
        result.total > 0 &&
        result.correct === result.total &&
        categoryRef.current !== ALL_CATEGORY.id;
      if (perfect) {
        const medal = medalName(categoryRef.current);
        setNewMedal(medal);
        saveMedal(categoryRef.current, runOnlineRef.current).then(() =>
          refreshMedals()
        );
      } else {
        setNewMedal(null);
      }

      if (challengeRef.current) {
        setChallengeOutcome(
          result.score >= (targetRef.current || 0) ? 'won' : 'lost'
        );
      } else {
        setChallengeOutcome(null);
      }
      refreshRankings();
    },
    [clearPending, data?.me, refreshStatus, refreshRankings, refreshMedals, best]
  );

  const start = useCallback(
    async (override = {}) => {
      if (starting) return;
      const nextCategory = override.categoryId || categoryId;
      const nextSize = Number(override.size) || size;
      const nextMode = override.mode || mode;
      const nextChallenge = override.challenge || null;
      clearPending();
      setStarting(true);
      try {
        const current = await refreshStatus();
        if ((current?.remaining ?? 0) <= 0) {
          setScreen('limit');
          return;
        }
        const questions = buildRound(nextCategory, nextSize);
        if (!questions.length) {
          actions.notify?.('Não há perguntas suficientes nesta categoria.');
          return;
        }
        const run = {
          id: newRunId(),
          category: nextCategory,
          mode: nextMode,
          total: questions.length,
        };
        const begun = await beginRun(run);
        if (!begun.ok) {
          if (/limit/i.test(begun.error || '')) setScreen('limit');
          else actions.notify?.('Não foi possível iniciar a rodada. Tente de novo.');
          return;
        }
        runIdRef.current = run.id;
        runOnlineRef.current = Boolean(begun.online);
        finishedRef.current = false;
        startedAtRef.current = Date.now();
        scoreRef.current = 0;
        streakRef.current = 0;
        bestComboRef.current = 0;
        statsRef.current = { correct: 0, wrong: 0, timeouts: 0, answered: 0 };
        roundRef.current = questions;
        categoryRef.current = nextCategory;
        modeRef.current = nextMode;
        challengeRef.current = nextChallenge;
        targetRef.current = nextChallenge?.targetScore ?? null;
        setRound(questions);
        setIndex(0);
        setPicked(null);
        setScore(0);
        setStreak(0);
        setBestCombo(0);
        setStats({ correct: 0, wrong: 0, timeouts: 0, answered: 0 });
        setShake(false);
        setComboFlash(null);
        setNewMedal(null);
        setChallengeOutcome(null);
        setTargetScore(nextChallenge?.targetScore ?? null);
        setMode(nextMode);
        setCategoryId(nextCategory);
        setSize(nextSize);
        const perQuestion =
          nextMode === 'classic' ? CLASSIC_FUSE_SECONDS : runSeconds(nextMode, questions.length);
        setTotalTime(perQuestion);
        setTimeLeft(perQuestion);
        setFinalResult(null);
        setReason('finished');
        setScreen('playing');
      } finally {
        setStarting(false);
      }
    },
    [categoryId, size, mode, starting, clearPending, refreshStatus, actions]
  );

  // Cronômetro: no Clássico pausa durante a revelação; no Insano corre até o fim.
  useEffect(() => {
    if (screen !== 'playing') return undefined;
    if (mode === 'classic' && picked !== null) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 0.1));
    }, 100);
    return () => window.clearInterval(timer);
  }, [screen, mode, picked, index]);

  useEffect(() => {
    if (screen !== 'playing' || timeLeft > 0) return;
    if (mode === 'classic' && statsRef.current) {
      statsRef.current = {
        ...statsRef.current,
        timeouts: statsRef.current.timeouts + 1,
      };
      setStats(statsRef.current);
    }
    finishRound('timeout');
  }, [timeLeft, screen, mode, finishRound]);

  const advance = useCallback(() => {
    if (index + 1 >= roundRef.current.length) {
      finishRound('finished');
      return;
    }
    setIndex((current) => current + 1);
    setPicked(null);
    setComboFlash(null);
    if (modeRef.current === 'classic') setTimeLeft(CLASSIC_FUSE_SECONDS);
  }, [index, finishRound]);

  const answer = (optionIndex) => {
    if (screen !== 'playing' || picked !== null || !question) return;
    const correct = optionIndex === question.answer;
    setPicked(optionIndex);

    if (correct) {
      const nextStreak = streakRef.current + 1;
      const { points, combo: nextCombo } = pointsFor({
        streak: nextStreak,
        mode,
        timeLeft,
        perQuestion: totalTime / Math.max(1, round.length),
      });
      scoreRef.current += points;
      streakRef.current = nextStreak;
      bestComboRef.current = Math.max(bestComboRef.current, nextStreak);
      statsRef.current = {
        ...statsRef.current,
        correct: statsRef.current.correct + 1,
        answered: statsRef.current.answered + 1,
      };
      setScore(scoreRef.current);
      setStreak(nextStreak);
      setBestCombo(bestComboRef.current);
      setStats(statsRef.current);
      setComboFlash({ ...nextCombo, multiplier: nextStreak, points });
      window.clearTimeout(comboRef.current);
      comboRef.current = window.setTimeout(() => setComboFlash(null), 1200);
    } else {
      streakRef.current = 0;
      statsRef.current = {
        ...statsRef.current,
        wrong: statsRef.current.wrong + 1,
        answered: statsRef.current.answered + 1,
      };
      setStreak(0);
      setStats(statsRef.current);
      setComboFlash(null);
      setShake(true);
      window.clearTimeout(shakeRef.current);
      shakeRef.current = window.setTimeout(() => setShake(false), 520);
    }

    window.clearTimeout(advanceRef.current);
    advanceRef.current = window.setTimeout(advance, correct ? 820 : 1350);
  };

  const shareScoreToFeed = () => {
    if (!finalResult) return;
    actions.shareQuizResult?.({
      ...finalResult,
      medal: newMedal,
    });
  };

  const friends = useMemo(
    () =>
      (data?.follows || [])
        .map((id) => {
          const person = data?.users?.[id];
          return person ? { id, name: person.name, handle: person.handle, avatar: person.avatar } : null;
        })
        .filter(Boolean)
        .slice(0, 60),
    [data?.follows, data?.users]
  );

  const challengeFriend = async () => {
    if (!finalResult || !chosenFriends.length) return;
    setSharing(true);
    try {
      const result = actions.shareQuizChallenge?.(finalResult, chosenFriends);
      if (result?.link) {
        await shareLink({
          title: 'Quiz BOOM!',
          text: `${data?.me?.name || 'Um amigo'} te desafiou no Quiz BOOM! Faça ${finalResult.score} pontos ou mais:`,
          url: result.link,
          image: quizCardImage({
            mode: finalResult.mode,
            categoryName: finalResult.categoryName,
            challengerName: data?.me?.name || 'Um amigo',
            size: finalResult.total,
            targetScore: finalResult.score,
          }),
          imageName: 'quiz-boom.png',
        });
      }
      setPickerOpen(false);
      setChosenFriends([]);
    } finally {
      setSharing(false);
    }
  };

  const shareOutside = async (payload) => {
    // Prévia visual real do Quiz BOOM: quando o link é um convite/desafio do
    // jogo, anexa a imagem ilustrativa gerada em canvas ao compartilhamento.
    const isQuizLink = /[?#].*(desafio|challenge|convite|invite)=/.test(payload.url || '');
    const finalPayload = isQuizLink
      ? {
          ...payload,
          image: quizCardImage({
            mode: finalResult?.mode || 'classic',
            categoryName: finalResult?.categoryName,
            challengerName: data?.me?.name || 'Um amigo',
            size: finalResult?.total,
            targetScore: finalResult?.score,
          }),
          imageName: 'quiz-boom.png',
        }
      : payload;
    const result = await shareLink(finalPayload);
    if (result === 'copied') actions.notify?.('Link copiado');
    else if (result === 'error') actions.notify?.('Não foi possível compartilhar.');
  };

  // --------------------------------------------------------------- Home -----
  if (screen === 'home') {
    const others = ranks[rankTab].filter((row) => !isMe(row));
    const mine = ranks[rankTab].find((row) => isMe(row));

    return (
      <div className="quiz quiz-home">
        <header className="quiz-top">
          <button
            type="button"
            className="icon-btn quiz-back"
            onClick={actions.closeQuiz}
            aria-label="Voltar para Conexões"
          >
            <Icon name="back" />
          </button>
          <div className="quiz-brand">
            <span className="quiz-logo" aria-hidden="true">
              💣
            </span>
            <div>
              <b>QUIZ BOOM!</b>
              <small>Clássico ou Insano — escolha seu pavio</small>
            </div>
          </div>
          <span className="quiz-best">
            <Icon name="trophy" /> {fmt(best)}
          </span>
        </header>

        <div className="quiz-intro">
          <div>
            <h1>
              Escolha a categoria
              <br />
              e acenda o pavio.
            </h1>
            <p>
              4 alternativas por pergunta. Combos multiplicam os pontos: Good
              x1, Great x2, Excellent x3... erre e o combo zera. No modo Insano
              existe um único tempo para a partida inteira.
            </p>
          </div>
          <div className="quiz-intro-bomb" aria-hidden="true">
            💣
            <span className="quiz-intro-spark">🔥</span>
          </div>
        </div>

        {challenge ? (
          <div className="quiz-challenge-banner">
            <span className="quiz-challenge-icon" aria-hidden="true">
              ⚔️
            </span>
            <div className="grow">
              <b>{challenge.challengerName} te desafiou!</b>
              <small>
                {challenge.category ? categoryById(challenge.category).name : 'Todas as categorias'} ·{' '}
                {MODES[challenge.mode]?.name || 'Clássico'} · meta{' '}
                {fmt(challenge.targetScore)} pontos
              </small>
            </div>
            <button
              type="button"
              className="btn hot"
              onClick={() => start({ challenge })}
              disabled={starting}
            >
              <Icon name="sword" /> Aceitar
            </button>
          </div>
        ) : null}

        <div className="quiz-modes" role="group" aria-label="Modo de jogo">
          {Object.values(MODES).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`quiz-mode${mode === item.id ? ' on' : ''}`}
              onClick={() => setMode(item.id)}
              aria-pressed={mode === item.id}
            >
              <span className="quiz-mode-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="quiz-mode-body">
                <b>{item.name}</b>
                <small>{item.tagline}</small>
              </span>
              {mode === item.id ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>

        <div className="quiz-quota">
          <span className="quiz-quota-pill">
            <Icon name="game" /> {remaining} de {FREE_ROUNDS + (status?.bonus || 0)} rodadas
          </span>
          <small>
            {remaining > 0
              ? `${FREE_ROUNDS} grátis por semana${status?.bonus ? ` + ${status.bonus} de convites` : ''}.`
              : 'Suas rodadas desta semana acabaram. Convide alguém para liberar mais.'}
          </small>
          <button
            type="button"
            className="quiz-invite-btn"
            onClick={() =>
              shareOutside({
                title: 'Quiz BOOM!',
                text: `Entre no Fluxo e me desafie no Quiz BOOM! Você ganha +${BONUS_ROUNDS} rodadas:`,
                url: inviteLink(data?.me?.id || ''),
              })
            }
          >
            <Icon name="users" /> Convidar e ganhar +{BONUS_ROUNDS}
          </button>
        </div>

        <div className="quiz-cats" role="group" aria-label="Categorias do quiz">
          <button
            type="button"
            className={`quiz-cat quiz-cat-all${categoryId === ALL_CATEGORY.id ? ' on' : ''}`}
            onClick={() => setCategoryId(ALL_CATEGORY.id)}
            aria-pressed={categoryId === ALL_CATEGORY.id}
            style={{ '--cat-color': ALL_CATEGORY.color }}
          >
            <span className="quiz-cat-emoji">{ALL_CATEGORY.emoji}</span>
            <span className="quiz-cat-name">{ALL_CATEGORY.name}</span>
            <small>{poolFor(ALL_CATEGORY.id).length} perguntas</small>
          </button>
          {CATEGORIES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`quiz-cat${categoryId === item.id ? ' on' : ''}`}
              onClick={() => setCategoryId(item.id)}
              aria-pressed={categoryId === item.id}
              style={{ '--cat-color': item.color }}
            >
              <span className="quiz-cat-emoji">{item.emoji}</span>
              <span className="quiz-cat-name">{item.name}</span>
              <small>{item.questions.length} perguntas</small>
            </button>
          ))}
        </div>

        <div className="quiz-setup">
          <div className="quiz-size">
            <span className="quiz-size-label">Perguntas na rodada</span>
            <div className="seg">
              {ROUND_SIZES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={size === value ? 'on' : ''}
                  onClick={() => setSize(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <span className="muted sm quiz-size-note">
              {available < size
                ? `${category.name} tem ${available} perguntas — a rodada usa todas.`
                : `${roundSize} perguntas de ${category.name}. ${
                    mode === 'insane'
                      ? `Tempo total: ${runSeconds(mode, roundSize)}s.`
                      : 'Pavio de 15s por pergunta.'
                  }`}
            </span>
          </div>
          <button
            type="button"
            className="btn hot quiz-start"
            onClick={() => start()}
            disabled={starting}
          >
            <Icon name="play" /> {starting ? 'Acendendo…' : 'Acender o pavio'}
          </button>
        </div>

        {medals.length ? (
          <div className="quiz-medals">
            <span className="quiz-section-label">
              <Icon name="trophy" /> Suas medalhas
            </span>
            <div className="quiz-medal-row">
              {medals.map((item) => {
                const cat = categoryById(item.category);
                return (
                  <span
                    className="quiz-medal"
                    key={item.category}
                    style={{ '--cat-color': cat.color }}
                    title={medalName(item.category)}
                  >
                    <span aria-hidden="true">{cat.emoji}</span>
                    {medalName(item.category)}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="quiz-ranking">
          <div className="quiz-ranking-head">
            <span className="quiz-section-label">
              <Icon name="trophy" /> Ranking semanal
            </span>
            <div className="seg quiz-rank-tabs">
              <button
                type="button"
                className={rankTab === 'global' ? 'on' : ''}
                onClick={() => setRankTab('global')}
              >
                Global
              </button>
              <button
                type="button"
                className={rankTab === 'friends' ? 'on' : ''}
                onClick={() => setRankTab('friends')}
              >
                Amigos
              </button>
            </div>
          </div>
          {mine ? (
            <div className="quiz-my-rank">
              <span className="quiz-my-rank-label">Sua posição</span>
              <RankRow row={mine} me />
            </div>
          ) : (
            <p className="quiz-rank-empty">
              Jogue uma rodada para entrar no ranking {rankTab === 'friends' ? 'entre amigos' : 'global'} desta semana.
            </p>
          )}
          <div className="quiz-rank-list">
            {others.length ? (
              others
                .slice(0, 10)
                .map((row) => (
                  <RankRow
                    key={`${row.userId}-${row.position}`}
                    row={row}
                    me={isMe(row)}
                  />
                ))
            ) : (
              <p className="quiz-rank-empty">
                {rankTab === 'friends'
                  ? 'Você ainda não segue ninguém que jogou esta semana.'
                  : 'Ninguém pontuou esta semana ainda. Seja o primeiro!'}
              </p>
            )}
          </div>
          <small className="quiz-rank-note">
            {ranks.online
              ? 'Ranking atualizado pelo servidor do Fluxo.'
              : 'Ranking local: rode a migração do Quiz no Supabase para sincronizar entre dispositivos.'}
          </small>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- Limite -----
  if (screen === 'limit') {
    return (
      <div className="quiz quiz-limit">
        <div className="quiz-limit-icon" aria-hidden="true">
          ⏳
        </div>
        <h1>Rodadas esgotadas</h1>
        <p className="quiz-limit-msg">
          Convide um amigo para o Fluxo e desbloqueie mais 3 rodadas!
        </p>
        <div className="quiz-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              shareOutside({
                title: 'Quiz BOOM!',
                text: `Entre no Fluxo e me desafie no Quiz BOOM! Você ganha +${BONUS_ROUNDS} rodadas:`,
                url: inviteLink(data?.me?.id || ''),
              })
            }
          >
            <Icon name="users" /> Convidar amigo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              refreshStatus();
              setScreen('home');
            }}
          >
            Voltar
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={actions.closeQuiz}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------- Explosion -----
  if (screen === 'boom') {
    return (
      <div className="quiz quiz-boom">
        <div className="quiz-boom-flash" aria-hidden="true" />
        <div className="quiz-boom-burst" aria-hidden="true">
          💥
        </div>
        <h1>BOOM!</h1>
        <p className="quiz-boom-sub">O PAVIO QUEIMOU</p>
        <p className="quiz-boom-note">
          Você parou na pergunta {index + 1} de {total}. No modo Clássico, o
          tempo de cada pergunta é o seu limite. Respire e tente de novo!
        </p>
        <div className="quiz-stat-row">
          <Stat label="Pontos" value={fmt(score)} />
          <Stat label="Acertos" value={stats.correct} />
          <Stat label="Precisão" value={`${accuracy}%`} />
          <Stat label="Recorde" value={fmt(best)} />
        </div>
        <div className="quiz-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => start()}
            disabled={starting}
          >
            <Icon name="play" /> Jogar de novo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={shareScoreToFeed}
          >
            <Icon name="share" /> Compartilhar no Fluxo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setScreen('home')}
          >
            Trocar categoria
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={actions.closeQuiz}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- Results -----
  if (screen === 'results' && finalResult) {
    const perfect = finalResult.total > 0 && finalResult.correct === finalResult.total;
    const missed = finalResult.total - finalResult.correct;
    return (
      <div className="quiz quiz-results">
        <div
          className={`quiz-results-icon${reason === 'timeout' ? ' timeout' : ''}`}
          aria-hidden="true"
        >
          {reason === 'timeout' ? '⏰' : perfect ? '🏆' : '💣'}
        </div>
        <span className={`pill ${perfect ? 'acc' : ''}`}>
          {reason === 'timeout' ? 'Tempo esgotado' : 'Rodada concluída'}
        </span>
        <h1>
          {perfect
            ? 'Rodada perfeita!'
            : reason === 'timeout'
              ? 'O tempo acabou!'
              : 'Você desarmou a bomba!'}
        </h1>
        <p className="muted">
          {finalResult.correct} de {finalResult.total} perguntas certas em{' '}
          {finalResult.categoryName} · Modo{' '}
          {MODES[finalResult.mode]?.name || 'Clássico'}.
        </p>
        <div className="quiz-score-hero">
          <b>{fmt(finalResult.score)}</b>
          <span>pontos</span>
        </div>
        <div className="quiz-stat-row">
          <Stat label="Acertos" value={finalResult.correct} />
          <Stat label="Erros" value={finalResult.wrong} />
          <Stat label="Precisão" value={`${accuracy}%`} />
          <Stat label="Melhor combo" value={`${finalResult.bestCombo}x`} />
        </div>

        {targetScore !== null ? (
          <div className={`quiz-challenge-result ${challengeOutcome || ''}`}>
            <b>
              {challengeOutcome === 'won'
                ? '⚔️ Você venceu o desafio!'
                : '⚔️ Desafio não superado'}
            </b>
            <small>
              Meta de {challenge?.challengerName || 'seu amigo'}:{' '}
              {fmt(targetScore)} pontos. Você fez {fmt(finalResult.score)}.
            </small>
          </div>
        ) : null}

        {newMedal ? (
          <div className="quiz-medal-unlock">
            <span className="quiz-medal-big" aria-hidden="true">
              🏅
            </span>
            <div className="grow">
              <b>Nova medalha: {newMedal}</b>
              <small>Você acertou 100% das perguntas desta categoria.</small>
            </div>
            <span className="quiz-medal-unlock-label">Compartilhe sua conquista</span>
            <div className="quiz-medal-unlock-actions">
              <button type="button" className="btn primary" onClick={shareScoreToFeed}>
                <Icon name="share" /> Compartilhar no Fluxo
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  shareOutside({
                    title: 'Fluxo — Quiz BOOM!',
                    text: `🏅 Conquistei a medalha "${newMedal}" no Quiz BOOM! com ${finalResult.score} pontos.`,
                    url: challengeLink(finalResult.categoryId),
                  })
                }
              >
                <Icon name="users" /> Compartilhar com amigos
              </button>
            </div>
          </div>
        ) : null}

        {missed > 0 && !newMedal ? (
          <p className="quiz-medal-hint">
            🏅 Acerte 100% nesta categoria para ganhar a medalha{' '}
            <b>{medalName(finalResult.categoryId)}</b>.
          </p>
        ) : null}

        <div className="quiz-share">
          <button type="button" className="btn primary" onClick={shareScoreToFeed}>
            <Icon name="share" /> Compartilhar pontuação no Fluxo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setChosenFriends([]);
              setPickerOpen(true);
            }}
          >
            <Icon name="sword" /> Desafiar um amigo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              shareOutside({
                title: 'Quiz BOOM!',
                text: `Fiz ${finalResult.score} pontos no Quiz BOOM! (${finalResult.categoryName}, modo ${
                  MODES[finalResult.mode]?.name || 'Clássico'
                }). Consegue me superar?`,
                url: inviteLink(data?.me?.id || ''),
              })
            }
          >
            <Icon name="link" /> Compartilhar fora do Fluxo
          </button>
        </div>

        <div className="quiz-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => start()}
            disabled={starting}
          >
            <Icon name="play" /> Jogar de novo
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setScreen('home')}
          >
            Trocar categoria
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={actions.closeQuiz}
          >
            Voltar para Conexões
          </button>
        </div>

        <ChallengePicker
          open={pickerOpen}
          friends={friends}
          chosen={chosenFriends}
          onToggle={(id) =>
            setChosenFriends((current) =>
              current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
            )
          }
          onClose={() => setPickerOpen(false)}
          onSend={challengeFriend}
          sharing={sharing}
        />
      </div>
    );
  }

  // ----------------------------------------------------------- Playing -----
  const ratioPct = Math.max(0, Math.min(100, timeRatio * 100));
  const urgent = timeRatio <= 0.3;
  const progressPct =
    total > 0 ? Math.min(100, ((index + (picked !== null ? 1 : 0)) / total) * 100) : 0;
  const multi = comboFor(Math.max(1, streak));

  return (
    <div className={`quiz quiz-play${shake ? ' quiz-shake' : ''}`}>
      <header className="quiz-top quiz-top-play">
        <button
          type="button"
          className="icon-btn quiz-back"
          onClick={actions.closeQuiz}
          aria-label="Sair do quiz"
        >
          <Icon name="x" />
        </button>
        <div className="quiz-progress">
          <span>
            Pergunta <b>{index + 1}</b> de {total} · {modeInfo.name}
          </span>
          <div className="quiz-progress-track">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="quiz-score">
          <b>{fmt(score)}</b>
          <span>pontos</span>
        </div>
      </header>

      <div className="quiz-fuse" aria-hidden="true">
        <div
          className="quiz-fuse-bar"
          style={{ width: `${ratioPct}%`, background: fuseColor(timeRatio) }}
        />
        <span className="quiz-fuse-time">
          <Icon name="clock" /> {Math.max(0, timeLeft).toFixed(1)}s
        </span>
      </div>

      <div className="quiz-stage">
        <div className={`quiz-bomb${urgent ? ' urgent' : ''}`} aria-hidden="true">
          <span className="quiz-bomb-emoji">{mode === 'insane' ? '⚡' : '💣'}</span>
          <span className="quiz-bomb-spark">🔥</span>
        </div>

        <div className="quiz-meta">
          <span className="quiz-cat-tag" style={{ '--cat-color': question?.color }}>
            {question?.emoji} {question?.category}
          </span>
          {streak > 0 ? (
            <span
              className="quiz-streak"
              style={{ '--combo-color': multi.color }}
            >
              🔥 {multi.name} · x{Math.min(streak, 7)}
            </span>
          ) : null}
          {targetScore !== null ? (
            <span className="quiz-target">
              Meta: {fmt(targetScore)}
            </span>
          ) : null}
        </div>

        {comboFlash ? (
          <div
            className="quiz-combo-flash"
            style={{ '--combo-color': comboFlash.color }}
            role="status"
          >
            <b>
              {comboFlash.name} x{comboFlash.multiplier}
            </b>
            <span>+{comboFlash.points} pontos</span>
          </div>
        ) : null}

        <h2 className="quiz-question">{question?.question}</h2>

        <div className="quiz-options">
          {question?.options.map((option, optionIndex) => {
            const revealed = picked !== null;
            const isAnswer = optionIndex === question.answer;
            const isPicked = optionIndex === picked;
            const state = revealed
              ? isAnswer
                ? ' correct'
                : isPicked
                  ? ' wrong'
                  : ' dim'
              : '';
            return (
              <button
                type="button"
                key={option}
                className={`quiz-opt${state}`}
                onClick={() => answer(optionIndex)}
                disabled={revealed}
              >
                <span className="quiz-opt-letter">{LETTERS[optionIndex]}</span>
                <span className="quiz-opt-text">{option}</span>
                {revealed && isAnswer ? (
                  <span className="quiz-opt-mark">
                    <Icon name="check" />
                  </span>
                ) : null}
                {revealed && isPicked && !isAnswer ? (
                  <span className="quiz-opt-mark">
                    <Icon name="x" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="quiz-footnote">
        {picked === null
          ? mode === 'insane'
            ? 'Um único tempo para toda a partida. Responda o mais rápido que puder!'
            : 'Toque na alternativa certa antes que o pavio chegue ao fim.'
          : picked === question?.answer
            ? `Isso! ${multi.name} x${Math.min(streak, 7)} — o combo continua.`
            : 'Resposta errada: o combo voltou para x1.'}
      </p>

      <ChallengePicker
        open={pickerOpen}
        friends={friends}
        chosen={chosenFriends}
        onToggle={(id) =>
          setChosenFriends((current) =>
            current.includes(id)
              ? current.filter((item) => item !== id)
              : [...current, id]
          )
        }
        onClose={() => setPickerOpen(false)}
        onSend={challengeFriend}
        sharing={sharing}
      />
    </div>
  );
}
