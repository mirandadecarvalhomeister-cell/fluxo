import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { ALL_CATEGORY, CATEGORIES, buildRound, categoryById, poolFor, type QuizQuestion } from '../quiz/bank';
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
  rankings as loadRankings,
  readBest,
  roundStatus,
  runSeconds,
  saveMedal,
  type QuizStatus,
} from '../quiz/quizData';
import { colors, gradients, radius, spacing } from '../lib/theme';
import { AvatarView, Card, EmptyState, GhostButton, PrimaryButton } from '../components/Ui';
import StackHeader from '../components/StackHeader';
import { shareLink } from '../lib/share';
import { uid } from '../lib/format';
import type { QuizChallenge, QuizRankingRow, QuizResult } from '../types';

const LETTERS = ['A', 'B', 'C', 'D'];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RankRow({ row, mine }: { row: QuizRankingRow; mine: boolean }) {
  const medal = row.position === 1 ? '🥇' : row.position === 2 ? '🥈' : row.position === 3 ? '🥉' : `${row.position}`;
  return (
    <View style={[styles.rankRow, row.position <= 3 && styles.rankTop, mine && styles.rankMine]}>
      <Text style={styles.rankPos}>{medal}</Text>
      <AvatarView user={{ name: row.name, handle: row.handle, avatar: row.avatar } as any} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rankName} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.rankMeta} numberOfLines={1}>
          {row.handle ? `@${row.handle.replace(/^@/, '')}` : 'Jogador do Fluxo'}
          {row.bestCombo ? ` · combo ${row.bestCombo}x` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rankScore}>{row.score}</Text>
        <Text style={styles.rankMeta}>pts</Text>
      </View>
    </View>
  );
}

export default function QuizScreen({ challengeId, inviteId }: { challengeId?: string; inviteId?: string }) {
  const { profile, users, following, actions, online } = useApp();
  const [screen, setScreen] = useState<'home' | 'playing' | 'boom' | 'results' | 'limit'>('home');
  const [mode, setMode] = useState<'classic' | 'insane'>('classic');
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0].id);
  const [size, setSize] = useState(10);
  const [round, setRound] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(CLASSIC_FUSE_SECONDS);
  const [totalTime, setTotalTime] = useState(CLASSIC_FUSE_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, timeouts: 0, answered: 0 });
  const [status, setStatus] = useState<QuizStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [ranks, setRanks] = useState<{ global: QuizRankingRow[]; friends: QuizRankingRow[]; online: boolean }>({ global: [], friends: [], online: false });
  const [rankTab, setRankTab] = useState<'global' | 'friends'>('global');
  const [medals, setMedals] = useState<{ category: string }[]>([]);
  const [newMedal, setNewMedal] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<QuizChallenge | null>(null);
  const [challengeOutcome, setChallengeOutcome] = useState<'won' | 'lost' | null>(null);
  const [finalResult, setFinalResult] = useState<QuizResult | null>(null);
  const [reason, setReason] = useState<'finished' | 'timeout'>('finished');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenFriends, setChosenFriends] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);

  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const startedAtRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestComboRef = useRef(0);
  const statsRef = useRef({ correct: 0, wrong: 0, timeouts: 0, answered: 0 });
  const roundRef = useRef<QuizQuestion[]>([]);
  const runIdRef = useRef('');
  const runOnlineRef = useRef(false);
  const categoryRef = useRef(categoryId);
  const modeRef = useRef<'classic' | 'insane'>(mode);
  const targetRef = useRef<number | null>(null);
  const challengeRef = useRef<QuizChallenge | null>(null);
  const inviteRef = useRef(false);

  const category = useMemo(() => categoryById(categoryId), [categoryId]);
  const available = useMemo(() => poolFor(categoryId).length, [categoryId]);
  const roundSize = Math.min(size, available);
  const question = round[index];
  const total = round.length;
  const modeInfo = modeById(mode);
  const limit = mode === 'insane' ? totalTime || runSeconds(mode, roundSize) : CLASSIC_FUSE_SECONDS;
  const timeRatio = Math.max(0, Math.min(1, timeLeft / Math.max(1, limit)));
  const remaining = status?.remaining ?? FREE_ROUNDS;

  const clearPending = useCallback(() => {
    if (advanceRef.current) {
      clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
  }, []);
  useEffect(() => () => clearPending(), [clearPending]);

  const refreshStatus = useCallback(async () => {
    const next = await roundStatus();
    setStatus(next);
    return next;
  }, []);
  const refreshRankings = useCallback(async () => {
    const next = await loadRankings({ follows: following, me: profile, limit: 50 });
    setRanks(next);
  }, [following, profile]);
  const refreshMedals = useCallback(async () => {
    setMedals(await loadMedals(online && Boolean(profile?.id)));
  }, [online, profile?.id]);

  useEffect(() => {
    refreshStatus();
    refreshRankings();
    refreshMedals();
    readBest().then(setBest);
  }, [refreshStatus, refreshRankings, refreshMedals]);

  useEffect(() => {
    if (inviteRef.current || !inviteId || !profile?.id || inviteId === profile.id) return;
    inviteRef.current = true;
    claimInvite(inviteId).then((ok) => {
      if (!ok) return;
      actions.toast(`Convite aceito! Você ganhou +${BONUS_ROUNDS} rodadas.`);
      refreshStatus();
    });
  }, [inviteId, profile?.id, actions, refreshStatus]);

  useEffect(() => {
    if (!challengeId) return;
    fetchChallenge(challengeId, online).then((loaded) => {
      if (!loaded) {
        actions.toast('Não encontramos esse desafio.');
        return;
      }
      setChallenge(loaded);
      setMode(loaded.mode);
      setCategoryId(loaded.category || categoryId);
      setSize(loaded.size || 10);
    });
  }, [challengeId, online]);

  const finishRound = useCallback(
    (why: 'finished' | 'timeout') => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearPending();
      const s = statsRef.current;
      const result: QuizResult = {
        score: scoreRef.current,
        correct: s.correct,
        wrong: s.wrong,
        timeouts: s.timeouts,
        answered: s.correct + s.wrong,
        total: roundRef.current.length,
        bestCombo: bestComboRef.current,
        categoryId: categoryRef.current,
        categoryName: categoryById(categoryRef.current).name,
        mode: modeRef.current,
        durationMs: Math.max(0, Date.now() - startedAtRef.current),
        userId: profile?.id || 'me',
        name: profile?.name || 'Você',
        handle: profile?.handle || '',
        avatar: profile?.avatar || null,
      };
      setFinalResult(result);
      setReason(why);
      setScreen(why === 'timeout' && modeRef.current === 'classic' ? 'boom' : 'results');
      finishRun(runIdRef.current, result, runOnlineRef.current).then((b) => setBest((cur) => Math.max(cur, b)));
      refreshStatus();

      const perfect = result.total > 0 && result.correct === result.total && categoryRef.current !== ALL_CATEGORY.id;
      if (perfect) {
        const medal = medalName(categoryRef.current);
        setNewMedal(medal);
        result.medal = medal;
        saveMedal(categoryRef.current, runOnlineRef.current).then(() => refreshMedals());
      } else {
        setNewMedal(null);
      }
      if (challengeRef.current) {
        setChallengeOutcome(result.score >= (targetRef.current || 0) ? 'won' : 'lost');
      } else {
        setChallengeOutcome(null);
      }
      refreshRankings();
    },
    [clearPending, profile, refreshStatus, refreshRankings, refreshMedals]
  );

  const start = useCallback(
    async (override?: { challenge?: QuizChallenge | null; mode?: 'classic' | 'insane'; categoryId?: string; size?: number }) => {
      if (starting) return;
      const nextCategory = override?.categoryId || categoryId;
      const nextSize = Number(override?.size) || size;
      const nextMode = override?.mode || mode;
      const nextChallenge = override?.challenge ?? challenge;
      clearPending();
      setStarting(true);
      try {
        const current = await refreshStatus();
        if ((current?.remaining ?? 0) <= 0) {
          setScreen('limit');
          return;
        }
        const questions = buildRound(nextCategory, nextSize) as QuizQuestion[];
        if (!questions.length) {
          actions.toast('Não há perguntas suficientes nesta categoria.');
          return;
        }
        const run = { id: uid('quiz-'), category: nextCategory, mode: nextMode, total: questions.length };
        const begun = await beginRun(run);
        if (!begun.ok) {
          if (/limit/i.test(begun.error || '')) setScreen('limit');
          else actions.toast('Não foi possível iniciar a rodada. Tente de novo.');
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
        challengeRef.current = nextChallenge || null;
        targetRef.current = nextChallenge?.targetScore ?? null;
        setRound(questions);
        setIndex(0);
        setPicked(null);
        setScore(0);
        setStreak(0);
        setBestCombo(0);
        setStats({ correct: 0, wrong: 0, timeouts: 0, answered: 0 });
        setNewMedal(null);
        setChallengeOutcome(null);
        const per = nextMode === 'classic' ? CLASSIC_FUSE_SECONDS : runSeconds(nextMode, questions.length);
        setTotalTime(per);
        setTimeLeft(per);
        setMode(nextMode);
        setCategoryId(nextCategory);
        setSize(nextSize);
        setFinalResult(null);
        setReason('finished');
        setScreen('playing');
      } finally {
        setStarting(false);
      }
    },
    [categoryId, size, mode, challenge, starting, clearPending, refreshStatus, actions]
  );

  useEffect(() => {
    if (screen !== 'playing') return;
    if (mode === 'classic' && picked !== null) return;
    const timer = setInterval(() => {
      setTimeLeft((current) => Math.max(0, +(current - 0.1).toFixed(1)));
    }, 100);
    return () => clearInterval(timer);
  }, [screen, mode, picked, index]);

  useEffect(() => {
    if (screen !== 'playing' || timeLeft > 0) return;
    if (mode === 'classic') {
      statsRef.current = { ...statsRef.current, timeouts: statsRef.current.timeouts + 1 };
      setStats(statsRef.current);
    }
    finishRound('timeout');
  }, [timeLeft, screen, mode, finishRound]);

  const advance = useCallback(() => {
    if (index + 1 >= roundRef.current.length) {
      finishRound('finished');
      return;
    }
    setIndex((cur) => cur + 1);
    setPicked(null);
    if (modeRef.current === 'classic') setTimeLeft(CLASSIC_FUSE_SECONDS);
  }, [index, finishRound]);

  const answer = (optionIndex: number) => {
    if (screen !== 'playing' || picked !== null || !question) return;
    const correct = optionIndex === question.answer;
    setPicked(optionIndex);
    if (correct) {
      const nextStreak = streakRef.current + 1;
      const { points } = pointsFor({
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
    } else {
      streakRef.current = 0;
      statsRef.current = {
        ...statsRef.current,
        wrong: statsRef.current.wrong + 1,
        answered: statsRef.current.answered + 1,
      };
      setStreak(0);
      setStats(statsRef.current);
    }
    clearPending();
    advanceRef.current = setTimeout(advance, correct ? 820 : 1350);
  };

  const friends = useMemo(
    () =>
      (following || [])
        .map((id) => {
          const person = users[id];
          return person ? { id, name: person.name, handle: person.handle, avatar: person.avatar } : null;
        })
        .filter(Boolean) as { id: string; name: string; handle: string; avatar: string | null }[],
    [following, users]
  );

  const buildChallenge = (): QuizChallenge | null => {
    if (!finalResult || !profile) return null;
    return {
      id: uid('qch-'),
      challengerId: profile.id,
      challengerName: profile.name || 'Um amigo',
      category: finalResult.categoryId || 'todas',
      categoryName: finalResult.categoryName || 'Todas as categorias',
      mode: finalResult.mode,
      size: finalResult.total,
      targetScore: finalResult.score,
      medal: newMedal,
      createdAt: Date.now(),
    };
  };

  const sendChallenge = async () => {
    const built = buildChallenge();
    if (!built || !chosenFriends.length) return;
    setSharing(true);
    try {
      for (const friendId of chosenFriends) {
        await actions.shareQuizChallenge(built, friendId);
      }
      await shareLink({
        title: 'Quiz BOOM!',
        text: `${profile?.name || 'Um amigo'} te desafiou no Quiz BOOM! Faça ${built.targetScore} pontos ou mais:`,
        url: challengeLink(built.id),
      });
      setPickerOpen(false);
      setChosenFriends([]);
      actions.toast('Desafio enviado!');
    } finally {
      setSharing(false);
    }
  };

  const isMine = (row: QuizRankingRow) =>
    Boolean(profile?.id && row.userId === profile.id) ||
    (Boolean(profile?.handle) && String(row.handle).replace(/^@/, '') === String(profile?.handle).replace(/^@/, ''));
  const rows = ranks[rankTab] || [];
  const mine = rows.find(isMine);
  const others = rows.filter((r) => !isMine(r));
  const answeredCount = stats.correct + stats.wrong;
  const accuracy = answeredCount ? Math.round((stats.correct / answeredCount) * 100) : 0;
  const progressPct = total > 0 ? Math.min(100, ((index + (picked !== null ? 1 : 0)) / total) * 100) : 0;
  const ratioPct = Math.max(0, Math.min(100, timeRatio * 100));
  const combo = comboFor(Math.max(1, streak));

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.screen}>
        <StackHeader title="Quiz BOOM!" right={<Text style={styles.bestBadge}>🏆 {best}</Text>} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40 }}>
          {challenge ? (
            <Card style={{ gap: 8, borderColor: colors.primary }}>
              <Text style={styles.cardTitle}>⚔️ {challenge.challengerName} te desafiou!</Text>
              <Text style={styles.muted}>
                {categoryById(challenge.category).name} · {MODES[challenge.mode]?.name || 'Clássico'} · meta {challenge.targetScore} pontos
              </Text>
              <PrimaryButton title="Aceitar desafio" icon="flash" onPress={() => start({ challenge })} loading={starting} />
            </Card>
          ) : null}

          <View style={styles.modeRow}>
            {Object.values(MODES).map((item) => (
              <Pressable key={item.id} onPress={() => setMode(item.id as any)} style={[styles.modeBtn, mode === item.id && styles.modeBtnOn]}>
                <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                <Text style={styles.modeName}>{item.name}</Text>
                <Text style={styles.modeHint}>{item.tagline}</Text>
              </Pressable>
            ))}
          </View>

          <Card style={{ gap: 8 }}>
            <Text style={styles.cardTitle}>🎮 {remaining} de {FREE_ROUNDS + (status?.bonus || 0)} rodadas</Text>
            <Text style={styles.muted}>
              {remaining > 0
                ? `${FREE_ROUNDS} grátis por semana${status?.bonus ? ` + ${status.bonus} de convites` : ''}.`
                : 'Convide um amigo para o Fluxo e desbloqueie mais 3 rodadas!'}
            </Text>
            <GhostButton
              title={`Convidar e ganhar +${BONUS_ROUNDS}`}
              icon="people-outline"
              onPress={() =>
                shareLink({
                  title: 'Quiz BOOM!',
                  text: `Entre no Fluxo e me desafie no Quiz BOOM! Você ganha +${BONUS_ROUNDS} rodadas:`,
                  url: inviteLink(profile?.id || ''),
                })
              }
            />
          </Card>

          <View style={styles.catGrid}>
            <Pressable onPress={() => setCategoryId(ALL_CATEGORY.id)} style={[styles.catBtn, { borderColor: ALL_CATEGORY.color }, categoryId === ALL_CATEGORY.id && { backgroundColor: ALL_CATEGORY.color + '33' }]}>
              <Text style={{ fontSize: 18 }}>{ALL_CATEGORY.emoji}</Text>
              <Text style={styles.catName}>{ALL_CATEGORY.name}</Text>
              <Text style={styles.catMeta}>{poolFor(ALL_CATEGORY.id).length} perguntas</Text>
            </Pressable>
            {CATEGORIES.map((item) => (
              <Pressable key={item.id} onPress={() => setCategoryId(item.id)} style={[styles.catBtn, { borderColor: item.color }, categoryId === item.id && { backgroundColor: item.color + '33' }]}>
                <Text style={{ fontSize: 18 }}>{item.emoji}</Text>
                <Text style={styles.catName}>{item.name}</Text>
                <Text style={styles.catMeta}>{item.questions.length} perguntas</Text>
              </Pressable>
            ))}
          </View>

          <Card style={{ gap: 10 }}>
            <Text style={styles.cardTitle}>Perguntas na rodada</Text>
            <View style={styles.sizeRow}>
              {ROUND_SIZES.map((value) => (
                <Pressable key={value} onPress={() => setSize(value)} style={[styles.sizeBtn, size === value && styles.sizeBtnOn]}>
                  <Text style={[styles.sizeText, size === value && { color: '#fff' }]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.muted}>
              {available < size
                ? `${category.name} tem ${available} perguntas — a rodada usa todas.`
                : `${roundSize} perguntas de ${category.name}. ${mode === 'insane' ? `Tempo total: ${runSeconds(mode, roundSize)}s.` : 'Pavio de 15s por pergunta.'}`}
            </Text>
            <PrimaryButton title={starting ? 'Acendendo…' : 'Acender o pavio'} icon="flame" onPress={() => start()} loading={starting} />
          </Card>

          {medals.length ? (
            <Card style={{ gap: 8 }}>
              <Text style={styles.cardTitle}>🏅 Suas medalhas</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {medals.map((item) => {
                  const cat = categoryById(item.category);
                  return (
                    <View key={item.category} style={[styles.medalPill, { borderColor: cat.color }]}>
                      <Text style={styles.medalText}>{cat.emoji} {medalName(item.category)}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          <Card style={{ gap: 10 }}>
            <View style={styles.rankHead}>
              <Text style={styles.cardTitle}>🏆 Ranking semanal</Text>
              <View style={styles.seg}>
                <Pressable onPress={() => setRankTab('global')} style={[styles.segBtn, rankTab === 'global' && styles.segBtnOn]}><Text style={styles.segText}>Global</Text></Pressable>
                <Pressable onPress={() => setRankTab('friends')} style={[styles.segBtn, rankTab === 'friends' && styles.segBtnOn]}><Text style={styles.segText}>Amigos</Text></Pressable>
              </View>
            </View>
            {mine ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.muted}>Sua posição</Text>
                <RankRow row={mine} mine />
              </View>
            ) : (
              <Text style={styles.muted}>Jogue uma rodada para entrar no ranking {rankTab === 'friends' ? 'entre amigos' : 'global'} desta semana.</Text>
            )}
            {others.slice(0, 10).map((row) => (
              <RankRow key={`${row.userId}-${row.position}`} row={row} mine={false} />
            ))}
            {!others.length && !mine ? (
              <EmptyState icon="trophy-outline" title="Sem ranking ainda" text={rankTab === 'friends' ? 'Siga amigos que jogam para ver o ranking entre vocês.' : 'Seja o primeiro a pontuar esta semana!'} />
            ) : null}
            <Text style={styles.footnote}>{ranks.online ? 'Ranking atualizado pelo servidor do Fluxo.' : 'Ranking local: rode a migração do Quiz no Supabase para sincronizar entre dispositivos.'}</Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'limit') {
    return (
      <SafeAreaView style={styles.screen}>
        <StackHeader title="Quiz BOOM!" />
        <View style={styles.center}>
          <Text style={{ fontSize: 54 }}>⏳</Text>
          <Text style={styles.bigTitle}>Rodadas esgotadas</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>Convide um amigo para o Fluxo e desbloqueie mais 3 rodadas!</Text>
          <View style={{ gap: 10, width: '100%' }}>
            <PrimaryButton
              title="Convidar amigo"
              icon="people"
              onPress={() => shareLink({ title: 'Quiz BOOM!', text: `Entre no Fluxo e me desafie no Quiz BOOM! Você ganha +${BONUS_ROUNDS} rodadas:`, url: inviteLink(profile?.id || '') })}
            />
            <GhostButton title="Voltar" onPress={() => { refreshStatus(); setScreen('home'); }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'boom') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: '#2a0b0b' }]}>
        <View style={styles.center}>
          <Text style={{ fontSize: 72 }}>💥</Text>
          <Text style={styles.bigTitle}>BOOM!</Text>
          <Text style={styles.muted}>Você parou na pergunta {index + 1} de {total}.</Text>
          <View style={styles.statRow}>
            <Stat label="Pontos" value={score} />
            <Stat label="Acertos" value={stats.correct} />
            <Stat label="Precisão" value={`${accuracy}%`} />
            <Stat label="Recorde" value={best} />
          </View>
          <View style={{ gap: 10, width: '100%' }}>
            <PrimaryButton title="Jogar de novo" icon="play" onPress={() => start()} loading={starting} />
            {finalResult ? <GhostButton title="Compartilhar no Fluxo" icon="share-outline" onPress={() => actions.shareQuizResult(finalResult)} /> : null}
            <GhostButton title="Trocar categoria" onPress={() => setScreen('home')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'results' && finalResult) {
    const perfect = finalResult.total > 0 && finalResult.correct === finalResult.total;
    return (
      <SafeAreaView style={styles.screen}>
        <StackHeader title="Resultado" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40, alignItems: 'center' }}>
          <Text style={{ fontSize: 56 }}>{reason === 'timeout' ? '⏰' : perfect ? '🏆' : '💣'}</Text>
          <Text style={styles.bigTitle}>{perfect ? 'Rodada perfeita!' : reason === 'timeout' ? 'O tempo acabou!' : 'Você desarmou a bomba!'}</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            {finalResult.correct} de {finalResult.total} certas em {finalResult.categoryName} · Modo {MODES[finalResult.mode]?.name || 'Clássico'}.
          </Text>
          <View style={styles.heroScore}>
            <Text style={styles.heroScoreValue}>{finalResult.score}</Text>
            <Text style={styles.muted}>pontos</Text>
          </View>
          <View style={styles.statRow}>
            <Stat label="Acertos" value={finalResult.correct} />
            <Stat label="Erros" value={finalResult.wrong} />
            <Stat label="Precisão" value={`${accuracy}%`} />
            <Stat label="Melhor combo" value={`${finalResult.bestCombo}x`} />
          </View>

          {challenge ? (
            <Card style={{ width: '100%', gap: 4, borderColor: challengeOutcome === 'won' ? colors.success : colors.danger }}>
              <Text style={styles.cardTitle}>{challengeOutcome === 'won' ? '⚔️ Você venceu o desafio!' : '⚔️ Desafio não superado'}</Text>
              <Text style={styles.muted}>Meta de {challenge.challengerName}: {challenge.targetScore} pontos. Você fez {finalResult.score}.</Text>
            </Card>
          ) : null}

          {newMedal ? (
            <Card style={{ width: '100%', gap: 8, borderColor: '#ffc93c' }}>
              <Text style={styles.cardTitle}>🏅 Nova medalha: {newMedal}</Text>
              <Text style={styles.muted}>Você acertou 100% das perguntas desta categoria.</Text>
              <Text style={[styles.muted, { fontWeight: '700' }]}>Compartilhe sua conquista</Text>
              <PrimaryButton title="Compartilhar no Fluxo" icon="share-social" onPress={() => actions.shareQuizResult({ ...finalResult, medal: newMedal })} />
              <GhostButton title="Compartilhar com amigos" icon="people-outline" onPress={() => shareLink({ title: 'Quiz BOOM!', text: `🏅 Conquistei a medalha "${newMedal}" no Quiz BOOM! com ${finalResult.score} pontos.`, url: challengeLink(finalResult.categoryId) })} />
            </Card>
          ) : (
            <Text style={[styles.muted, { textAlign: 'center' }]}>🏅 Acerte 100% em <Text style={{ color: colors.text, fontWeight: '700' }}>{medalName(finalResult.categoryId)}</Text> para ganhar a medalha.</Text>
          )}

          <View style={{ width: '100%', gap: 10 }}>
            <PrimaryButton title="Compartilhar pontuação no Fluxo" icon="share-social" onPress={() => actions.shareQuizResult(finalResult)} />
            <GhostButton title="Desafiar um amigo" icon="flash-outline" onPress={() => { setChosenFriends([]); setPickerOpen(true); }} />
            <GhostButton title="Compartilhar fora do Fluxo" icon="link-outline" onPress={() => shareLink({ title: 'Quiz BOOM!', text: `Fiz ${finalResult.score} pontos no Quiz BOOM! (${finalResult.categoryName}, modo ${MODES[finalResult.mode]?.name || 'Clássico'}). Consegue me superar?`, url: inviteLink(profile?.id || '') })} />
            <PrimaryButton title="Jogar de novo" icon="play" onPress={() => start()} loading={starting} />
            <GhostButton title="Trocar categoria" onPress={() => setScreen('home')} />
          </View>

          {pickerOpen ? (
            <Card style={{ width: '100%', gap: 10 }}>
              <Text style={styles.cardTitle}>Desafiar um amigo</Text>
              <Text style={styles.muted}>O desafio vai por mensagem no Fluxo com link para jogar fora também.</Text>
              {friends.length ? friends.map((friend) => {
                const on = chosenFriends.includes(friend.id);
                return (
                  <Pressable key={friend.id} onPress={() => setChosenFriends((cur) => cur.includes(friend.id) ? cur.filter((x) => x !== friend.id) : [...cur, friend.id])} style={[styles.friendPick, on && styles.friendPickOn]}>
                    <AvatarView user={friend as any} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankName}>{friend.name}</Text>
                      {friend.handle ? <Text style={styles.rankMeta}>@{friend.handle}</Text> : null}
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.primary : colors.faint} />
                  </Pressable>
                );
              }) : <Text style={styles.muted}>Você ainda não segue ninguém. Compartilhe fora do Fluxo.</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={() => setPickerOpen(false)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton title={sharing ? 'Enviando…' : 'Enviar'} onPress={sendChallenge} loading={sharing} disabled={!chosenFriends.length} /></View>
              </View>
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Playing
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.playTop}>
        <Pressable accessibilityLabel="Sair" onPress={actions.pop} hitSlop={8}><Ionicons name="close" size={26} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.playProgressText}>Pergunta {index + 1} de {total} · {modeInfo.name}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPct}%` }]} /></View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.playScore}>{score}</Text>
          <Text style={styles.rankMeta}>pontos</Text>
        </View>
      </View>

      <View style={styles.timerWrap}>
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${ratioPct}%`, backgroundColor: timeRatio > 0.55 ? colors.success : timeRatio > 0.3 ? '#ffc93c' : timeRatio > 0.15 ? '#ff8a3c' : colors.danger }]} />
        </View>
        <Text style={styles.timerText}><Ionicons name="time-outline" size={13} color={colors.muted} /> {Math.max(0, timeLeft).toFixed(1)}s</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <View style={styles.metaRow}>
          <View style={[styles.catTag, { borderColor: question?.color || colors.border }]}><Text style={styles.catTagText}>{question?.emoji} {question?.category}</Text></View>
          {streak > 0 ? <View style={[styles.catTag, { borderColor: combo.color }]}><Text style={styles.catTagText}>🔥 {combo.name} · x{Math.min(streak, 7)}</Text></View> : null}
        </View>
        <Text style={styles.question}>{question?.question}</Text>

        <View style={{ gap: 10 }}>
          {question?.options.map((option, optionIndex) => {
            const revealed = picked !== null;
            const isAnswer = optionIndex === question.answer;
            const isPicked = optionIndex === picked;
            let border = colors.border;
            let bg = colors.surface;
            if (revealed && isAnswer) { border = colors.success; bg = 'rgba(34,197,94,0.12)'; }
            else if (revealed && isPicked && !isAnswer) { border = colors.danger; bg = 'rgba(239,68,68,0.12)'; }
            else if (revealed) { bg = colors.surfaceAlt; }
            return (
              <Pressable key={`${index}-${optionIndex}`} onPress={() => answer(optionIndex)} disabled={revealed} style={[styles.option, { borderColor: border, backgroundColor: bg }]}>
                <View style={styles.optionLetter}><Text style={styles.optionLetterText}>{LETTERS[optionIndex]}</Text></View>
                <Text style={styles.optionText}>{option}</Text>
                {revealed && isAnswer ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
                {revealed && isPicked && !isAnswer ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.muted, { textAlign: 'center' }]}>
          {picked === null
            ? mode === 'insane'
              ? 'Um único tempo para toda a partida. Responda o mais rápido que puder!'
              : 'Toque na alternativa certa antes que o pavio chegue ao fim.'
            : picked === question?.answer
              ? `Isso! ${combo.name} x${Math.min(streak, 7)} — o combo continua.`
              : 'Resposta errada: o combo voltou para x1.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  bestBadge: { color: '#ffc93c', fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 14 },
  bigTitle: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, gap: 4 },
  modeBtnOn: { borderColor: colors.primary, backgroundColor: 'rgba(139,92,246,0.12)' },
  modeName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  modeHint: { color: colors.muted, fontSize: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { width: '48%', flexGrow: 1, minWidth: 150, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, padding: 10, gap: 2 },
  catName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  catMeta: { color: colors.muted, fontSize: 11 },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeBtn: { minWidth: 46, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  sizeBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sizeText: { color: colors.text, fontWeight: '700' },
  medalPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceAlt },
  medalText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  rankHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  rankTop: { borderColor: '#ffc93c55' },
  rankMine: { borderColor: colors.primary },
  rankPos: { width: 28, textAlign: 'center', color: colors.text, fontWeight: '800' },
  rankName: { color: colors.text, fontWeight: '700' },
  rankMeta: { color: colors.muted, fontSize: 12 },
  rankScore: { color: colors.text, fontWeight: '800' },
  footnote: { color: colors.faint, fontSize: 12 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  stat: { minWidth: 74, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.text, fontWeight: '900', fontSize: 18 },
  statLabel: { color: colors.muted, fontSize: 12 },
  heroScore: { alignItems: 'center' },
  heroScoreValue: { color: colors.text, fontSize: 42, fontWeight: '900' },
  friendPick: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  friendPickOn: { borderColor: colors.primary, backgroundColor: 'rgba(139,92,246,0.1)' },
  playTop: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingTop: 8 },
  playProgressText: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  playScore: { color: colors.text, fontWeight: '900', fontSize: 18 },
  timerWrap: { paddingHorizontal: spacing.lg, paddingTop: 10, gap: 4 },
  timerTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 5 },
  timerText: { color: colors.muted, fontSize: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surfaceAlt },
  catTagText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  question: { color: colors.text, fontSize: 22, fontWeight: '800', lineHeight: 30 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  optionLetter: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optionLetterText: { color: colors.text, fontWeight: '800' },
  optionText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: '600' },
});
