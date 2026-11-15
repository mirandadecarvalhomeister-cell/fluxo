import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useApp } from '../../store/AppContext';
import { ALL_CATEGORY, CATEGORIES, buildRound, categoryById, poolFor } from './bank';

const FUSE_SECONDS = 15;
const ROUND_SIZES = [10, 20, 30, 50, 100];
const BEST_KEY = 'fluxo.quiz.best';

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const fuseColor = (ratio) => {
  if (ratio > 0.55) return 'linear-gradient(90deg, #31d158, #9ff34a)';
  if (ratio > 0.3) return 'linear-gradient(90deg, #ffc93c, #ffb020)';
  if (ratio > 0.15) return 'linear-gradient(90deg, #ff8a3c, #ff5a3c)';
  return 'linear-gradient(90deg, #ff2d87, #ff5a3c)';
};

const LETTERS = ['A', 'B', 'C', 'D'];

function Stat({ label, value, hint }) {
  return (
    <div className="quiz-stat">
      <b>{value}</b>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export default function QuizBoom() {
  const { actions } = useApp();
  const [screen, setScreen] = useState('home'); // home | playing | boom | results
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [size, setSize] = useState(10);
  const [round, setRound] = useState([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(FUSE_SECONDS);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(readBest);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, timeouts: 0 });
  const [shake, setShake] = useState(false);
  const advanceRef = useRef(null);
  const shakeRef = useRef(null);

  const category = useMemo(() => categoryById(categoryId), [categoryId]);
  const available = useMemo(() => poolFor(categoryId).length, [categoryId]);
  const roundSize = Math.min(size, available);
  const question = round[index];
  const total = round.length;
  const answered = stats.correct + stats.wrong;
  const accuracy = answered ? Math.round((stats.correct / answered) * 100) : 0;
  const timeRatio = Math.max(0, Math.min(1, timeLeft / FUSE_SECONDS));

  const clearPending = useCallback(() => {
    if (advanceRef.current) {
      window.clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
    if (shakeRef.current) {
      window.clearTimeout(shakeRef.current);
      shakeRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPending(), [clearPending]);

  const start = useCallback(
    (nextCategory = categoryId, nextSize = size) => {
      clearPending();
      const questions = buildRound(nextCategory, nextSize);
      setRound(questions);
      setIndex(0);
      setTimeLeft(FUSE_SECONDS);
      setPicked(null);
      setScore(0);
      setStreak(0);
      setStats({ correct: 0, wrong: 0, timeouts: 0 });
      setShake(false);
      setScreen('playing');
    },
    [categoryId, size, clearPending]
  );

  // Conta o pavio. Pausa enquanto a resposta está sendo revelada.
  useEffect(() => {
    if (screen !== 'playing' || picked !== null) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 0.1));
    }, 100);
    return () => window.clearInterval(timer);
  }, [screen, picked, index]);

  // Chegou a zero: o pavio queimou e a bomba estoura.
  useEffect(() => {
    if (screen !== 'playing' || picked !== null || timeLeft > 0) return;
    setStats((current) => ({ ...current, timeouts: current.timeouts + 1 }));
    setScreen('boom');
  }, [timeLeft, picked, screen]);

  // Guarda o recorde quando a rodada termina.
  useEffect(() => {
    if ((screen === 'boom' || screen === 'results') && score > best) {
      setBest(score);
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        // sem armazenamento local disponível, segue o jogo
      }
    }
  }, [screen, score, best]);

  const answer = (optionIndex) => {
    if (screen !== 'playing' || picked !== null || !question) return;
    const correct = optionIndex === question.answer;
    setPicked(optionIndex);

    if (correct) {
      const bonus = Math.round(timeLeft) * 10;
      const combo = Math.min(streak, 10);
      setScore((current) => current + 100 + bonus + combo * 10);
      setStreak((current) => current + 1);
      setStats((current) => ({ ...current, correct: current.correct + 1 }));
    } else {
      setStreak(0);
      setStats((current) => ({ ...current, wrong: current.wrong + 1 }));
      setShake(true);
      shakeRef.current = window.setTimeout(() => setShake(false), 520);
    }

    advanceRef.current = window.setTimeout(
      () => {
        advanceRef.current = null;
        if (index + 1 >= round.length) {
          setScreen('results');
          return;
        }
        setIndex((current) => current + 1);
        setTimeLeft(FUSE_SECONDS);
        setPicked(null);
      },
      correct ? 780 : 1450
    );
  };

  // ------------------------------------------------------------- Home ------
  if (screen === 'home') {
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
              <small>Responda antes da explosão</small>
            </div>
          </div>
          <span className="quiz-best">
            <Icon name="trophy" /> {best}
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
              4 alternativas por pergunta · 15 segundos de pavio · acertos
              em sequência valem mais pontos. Se o tempo acabar... BOOM!
            </p>
          </div>
          <div className="quiz-intro-bomb" aria-hidden="true">
            💣
            <span className="quiz-intro-spark">🔥</span>
          </div>
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
                : `${roundSize} perguntas de ${category.name}.`}
            </span>
          </div>
          <button
            type="button"
            className="btn hot quiz-start"
            onClick={() => start()}
          >
            <Icon name="play" /> Acender o pavio
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
        <p className="quiz-boom-sub">VOCÊ PERDEU</p>
        <p className="quiz-boom-note">
          O pavio queimou na pergunta {index + 1} de {total}. Respire e tente de
          novo!
        </p>
        <div className="quiz-stat-row">
          <Stat label="Pontos" value={score} />
          <Stat label="Acertos" value={stats.correct} />
          <Stat label="Precisão" value={`${accuracy}%`} />
          <Stat label="Recorde" value={best} />
        </div>
        <div className="quiz-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => start()}
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
            Sair
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- Results -----
  if (screen === 'results') {
    return (
      <div className="quiz quiz-results">
        <div className="quiz-results-icon" aria-hidden="true">
          🏆
        </div>
        <span className="pill acc">Rodada concluída</span>
        <h1>Você desarmou a bomba!</h1>
        <p className="muted">
          {stats.correct} de {total} perguntas certas em {category.name}.
        </p>
        <div className="quiz-score-hero">
          <b>{score}</b>
          <span>pontos</span>
        </div>
        <div className="quiz-stat-row">
          <Stat label="Acertos" value={stats.correct} />
          <Stat label="Erros" value={stats.wrong} />
          <Stat label="Precisão" value={`${accuracy}%`} />
          <Stat label="Recorde" value={best} />
        </div>
        <div className="quiz-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => start()}
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
      </div>
    );
  }

  // ----------------------------------------------------------- Playing -----
  const ratioPct = Math.max(0, Math.min(100, timeRatio * 100));

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
            Pergunta <b>{index + 1}</b> de {total}
          </span>
          <div className="quiz-progress-track">
            <span style={{ width: `${((index + (picked !== null ? 1 : 0)) / total) * 100}%` }} />
          </div>
        </div>
        <div className="quiz-score">
          <b>{score}</b>
          <span>pontos</span>
        </div>
      </header>

      <div className="quiz-fuse" aria-hidden="true">
        <div className="quiz-fuse-bar" style={{ width: `${ratioPct}%`, background: fuseColor(timeRatio) }} />
        <span className="quiz-fuse-time">
          <Icon name="clock" /> {Math.max(0, timeLeft).toFixed(1)}s
        </span>
      </div>

      <div className="quiz-stage">
        <div className={`quiz-bomb${timeRatio <= 0.3 ? ' urgent' : ''}`} aria-hidden="true">
          <span className="quiz-bomb-emoji">💣</span>
          <span className="quiz-bomb-spark">🔥</span>
        </div>

        <div className="quiz-meta">
          <span className="quiz-cat-tag" style={{ '--cat-color': question?.color }}>
            {question?.emoji} {question?.category}
          </span>
          {streak > 1 ? <span className="quiz-streak">🔥 {streak} seguidas</span> : null}
        </div>

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
          ? 'Toque na alternativa certa antes que o pavio chegue ao fim.'
          : picked === question?.answer
            ? 'Isso! Pavio reaceso para a próxima pergunta.'
            : 'Quase! A resposta certa está em verde.'}
      </p>
    </div>
  );
}
