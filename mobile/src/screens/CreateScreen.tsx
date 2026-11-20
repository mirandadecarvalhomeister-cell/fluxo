import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { MAX_VIDEO_SECONDS } from '../lib/media';
import { MAX_OPTIONS, MIN_OPTIONS } from '../lib/interactive';
import { createLiveChannel } from '../lib/api';

type Fmt = 'classic' | 'poll' | 'imageVote' | 'challenge';
type Step = 'capture' | 'gallery' | 'customize';
type Panel = 'live' | 'poll' | 'clips' | 'vote' | null;
type Asset = { uri: string; kind: 'photo' | 'video'; duration?: number; mimeType?: string; fileName?: string | null };

type Theme = { id: string; label: string; colors: [string, string]; text: string; accent: string };
const THEMES: Theme[] = [
  { id: 'neon', label: 'Neon', colors: ['#0f0c29', '#6a1fb5'], text: '#fff', accent: '#c084fc' },
  { id: 'sunset', label: 'Pôr do sol', colors: ['#ff7a45', '#ff2e63'], text: '#fff', accent: '#ffe08a' },
  { id: 'ocean', label: 'Oceano', colors: ['#0a2342', '#2ca6a4'], text: '#fff', accent: '#7dd3fc' },
  { id: 'candy', label: 'Docinho', colors: ['#ffd1ff', '#fad0c4'], text: '#3b1055', accent: '#db2777' },
  { id: 'mint', label: 'Menta', colors: ['#0f3443', '#34e89e'], text: '#fff', accent: '#a7f3d0' },
  { id: 'mono', label: 'Mono', colors: ['#111318', '#2b2f3a'], text: '#fff', accent: '#a1a1aa' },
];

const DRAFT_KEY = 'fluxo:post-draft';
const emptyOptions = () => [{ id: 'opt-1', label: '' }, { id: 'opt-2', label: '' }];

const CAPTURE_TYPES: { id: Fmt | 'clips' | 'live'; label: string; icon: any }[] = [
  { id: 'classic', label: 'Publicação', icon: 'image-outline' },
  { id: 'poll', label: 'Enquete', icon: 'stats-chart-outline' },
  { id: 'imageVote', label: 'Votação', icon: 'images-outline' },
  { id: 'challenge', label: 'Desafio', icon: 'flash-outline' },
  { id: 'clips', label: 'Clips', icon: 'videocam-outline' },
  { id: 'live', label: 'Ao vivo', icon: 'radio-outline' },
];

export default function CreateScreen() {
  const { actions, publishing, profile } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const recordingRef = useRef<Promise<any> | null>(null);

  const [recording, setRecording] = useState(false);
  const [step, setStep] = useState<Step>('capture');
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [panel, setPanel] = useState<Panel>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveTitle, setLiveTitle] = useState('Ao vivo agora');
  const [startingLive, setStartingLive] = useState(false);

  const [text, setText] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [format, setFormat] = useState<Fmt>('classic');
  const [options, setOptions] = useState<{ id: string; label: string; mediaIndex?: number }[]>(emptyOptions());
  const [invited, setInvited] = useState<string[]>([]);
  const [themeId, setThemeId] = useState('neon');
  const [clipStyle, setClipStyle] = useState('Dramático');
  const [draftRestored, setDraftRestored] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const hasVideo = assets.some((a) => a.kind === 'video');
  const showOptions = format === 'poll' || format === 'imageVote';

  // Rascunho local.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw || !active) return;
        const draft = JSON.parse(raw);
        if (typeof draft.text === 'string') setText(draft.text);
        if (draft.format) setFormat(draft.format as Fmt);
        if (Array.isArray(draft.options) && draft.options.length >= 2) setOptions(draft.options);
        if (Array.isArray(draft.invited)) setInvited(draft.invited);
        if (Array.isArray(draft.assets)) setAssets(draft.assets);
        if (draft.themeId) setThemeId(draft.themeId);
        setDraftRestored(true);
      } catch {}
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftRestored) return;
    if (!text.trim() && !assets.length && format === 'classic') return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ text, format, options, invited, assets, themeId, savedAt: Date.now() }));
    }, 700);
    return () => clearTimeout(timer);
  }, [draftRestored, text, format, options, invited, assets, themeId]);

  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    setText('');
    setAssets([]);
    setOptions(emptyOptions());
    setInvited([]);
    setFormat('classic');
    setThemeId('neon');
    setPanel(null);
    setLiveMode(false);
    setCoverIndex(0);
    setStep('capture');
  }, []);

  const discardDraft = () => {
    Alert.alert('Descartar rascunho', 'Apagar o rascunho salvo neste aparelho?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { void reset(); actions.toast('Rascunho descartado.'); } },
    ]);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      setAssets((cur) => [...cur, { uri: photo.uri, kind: 'photo', mimeType: 'image/jpeg', fileName: null }]);
      setStep('gallery');
    } catch {
      actions.toast('Não foi possível capturar a foto.');
    }
  };

  const startVideo = async () => {
    if (!cameraRef.current?.recordAsync || recordingRef.current) return;
    try {
      recordingRef.current = cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS });
      setRecording(true);
    } catch {
      actions.toast('Gravação indisponível neste aparelho.');
    }
  };

  const stopVideo = async () => {
    if (!recordingRef.current) return;
    try {
      cameraRef.current?.stopRecording();
      const video = await recordingRef.current;
      if (video?.uri) {
        setAssets((cur) => [...cur, { uri: video.uri, kind: 'video', duration: video.duration, mimeType: 'video/mp4', fileName: null }]);
        setStep('gallery');
      }
    } catch {
      actions.toast('Não foi possível gravar o vídeo.');
    } finally {
      recordingRef.current = null;
      setRecording(false);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { actions.toast('Permissão de galeria negada.'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.9,
        videoMaxDuration: MAX_VIDEO_SECONDS,
      });
      if (result.canceled || !result.assets?.length) return;
      const mapped: Asset[] = result.assets.map((a) => ({
        uri: a.uri,
        kind: a.type === 'video' ? 'video' : 'photo',
        duration: a.duration ? Math.round(a.duration) : undefined,
        mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileName: a.fileName || null,
      }));
      setAssets((cur) => [...cur, ...mapped].slice(0, 10));
      setStep('gallery');
    } catch {
      actions.toast('Não foi possível abrir as fotos.');
    }
  };

  const startLive = async () => {
    if (!profile?.id || startingLive) return;
    setStartingLive(true);
    try {
      const channel = await createLiveChannel({ ownerId: profile.id, ownerName: profile.name || 'Você', title: liveTitle || 'Ao vivo agora' });
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      actions.push({ name: 'live', channelId: channel.id, host: true });
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível iniciar a live.');
      setStartingLive(false);
    }
  };

  const publish = async () => {
    if (!text.trim() && !assets.length) {
      actions.toast('Adicione um texto, foto ou vídeo.');
      return;
    }
    if (showOptions) {
      const valid = options.filter((o) => o.label.trim());
      if (valid.length < MIN_OPTIONS) { actions.toast(`Adicione pelo menos ${MIN_OPTIONS} alternativas.`); return; }
      if (format === 'imageVote' && assets.filter((a) => a.kind === 'photo').length < MIN_OPTIONS) {
        actions.toast('Adicione pelo menos duas fotos para a votação.');
        return;
      }
    }
    if (format === 'poll' && !text.trim()) { actions.toast('Escreva a pergunta da enquete.'); return; }

    const payloadOptions = showOptions
      ? options.filter((o) => o.label.trim()).map((o, i) => ({
          ...o,
          label: o.label.trim(),
          mediaIndex: format === 'imageVote' ? (o.mediaIndex ?? i) : undefined,
        }))
      : undefined;

    const err = await actions.publish({
      text,
      assets,
      format,
      options: payloadOptions,
      invited: format === 'challenge' ? invited : undefined,
    });
    if (err) actions.toast(err);
    else {
      await reset();
      actions.go('home');
      actions.toast('Publicação criada!');
    }
  };

  const setOption = (id: string, label: string) => setOptions((cur) => cur.map((o) => (o.id === id ? { ...o, label } : o)));
  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((cur) => [...cur, { id: `opt-${Date.now()}`, label: '' }]);
  };
  const removeOption = (id: string) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((cur) => cur.filter((o) => o.id !== id));
  };

  const selectCaptureType = (id: Fmt | 'clips' | 'live') => {
    if (id === 'live') {
      setLiveMode(true);
      setFormat('classic');
    } else {
      setLiveMode(false);
      setFormat(id === 'clips' ? 'classic' : id);
    }
    if (id === 'imageVote') {
      setOptions(assets.slice(0, 6).map((_, i) => ({ id: `opt-${i}`, label: '', mediaIndex: i })));
    }
  };

  const captureType = liveMode ? 'live' : format;

  const openPanel = (next: Exclude<Panel, null>) => {
    setPanel(next);
    if (next === 'live') setLiveMode(true);
    if (next === 'poll') setFormat('poll');
    if (next === 'vote') {
      setFormat('imageVote');
      setOptions(assets.slice(0, 6).map((a, i) => ({ id: `opt-${i}`, label: '', mediaIndex: i })));
    }
    if (next === 'clips') setFormat('classic');
  };

  // ── ETAPA 1: CÂMERA ───────────────────────────────────────────────
  if (step === 'capture') {
    return (
      <View style={styles.captureRoot}>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing}>
            <View style={styles.captureTop}>
              <Pressable onPress={() => (liveMode ? setStep('customize') : actions.go('home'))} style={styles.roundBtn} hitSlop={8}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              {!liveMode ? (
                <Pressable onPress={() => setStep('gallery')} style={styles.topNextBtn} hitSlop={8}>
                  <Text style={styles.topNextText}>Avançar</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </Pressable>
              ) : <View style={{ width: 44 }} />}
              <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} style={styles.roundBtn} hitSlop={8}>
                <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.captureTypes}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.captureTypesRow}>
                {CAPTURE_TYPES.map((type) => {
                  const active = captureType === type.id || (type.id === 'clips' && hasVideo && format === 'classic' && !liveMode);
                  return (
                    <Pressable
                      key={type.id}
                      onPress={() => selectCaptureType(type.id)}
                      style={[styles.typeChip, active && styles.typeChipOn]}
                    >
                      <Ionicons name={type.icon} size={16} color={active ? '#fff' : 'rgba(255,255,255,0.85)'} />
                      <Text style={[styles.typeChipText, active && { color: '#fff' }]}>{type.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.captureBottom}>
              <Text style={styles.captureHint}>
                {recording ? '● Gravando… solte para parar' : liveMode ? 'Prepare a câmera para sua live' : 'Toque para fotografar · segure para gravar'}
              </Text>
              <View style={styles.captureRow}>
                <Pressable onPress={() => void pickFromGallery()} style={styles.thumbBtn} hitSlop={6}>
                  <Ionicons name="images-outline" size={26} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => void takePicture()}
                  onLongPress={() => void startVideo()}
                  onPressOut={() => { if (recordingRef.current) void stopVideo(); }}
                  style={[styles.shutter, recording && { borderColor: colors.pink }]}
                  hitSlop={8}
                >
                  <View style={[styles.shutterInner, recording && { backgroundColor: colors.pink, borderRadius: 10, width: 28, height: 28 }]} />
                </Pressable>
                <Pressable onPress={() => void pickFromGallery()} style={styles.thumbBtn} hitSlop={6}>
                  <Ionicons name="add" size={26} color="#fff" />
                </Pressable>
              </View>
              {liveMode ? (
                <Pressable onPress={() => void startLive()} disabled={startingLive} style={styles.startLiveBtn}>
                  {startingLive ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="radio" size={18} color="#fff" />
                      <Text style={styles.startLiveText}>Iniciar live</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
          </CameraView>
        ) : (
          <View style={styles.perm}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.permText}>Solicitando acesso à câmera…</Text>
            <Pressable onPress={() => void requestPermission()} style={styles.nextBtn}><Text style={styles.nextText}>Permitir câmera</Text></Pressable>
            <Pressable onPress={() => void pickFromGallery()} style={[styles.nextBtn, { marginTop: 8, backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.nextText, { color: colors.text }]}>Escolher da galeria</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ── ETAPA 2: GALERIA / SELEÇÃO ────────────────────────────────────
  if (step === 'gallery') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.stepHeader}>
          <Pressable onPress={() => setStep('capture')} hitSlop={8}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
          <Text style={styles.stepTitle}>Selecionadas ({assets.length})</Text>
          <Pressable onPress={() => void pickFromGallery()} hitSlop={8}><Ionicons name="add" size={26} color={colors.primary} /></Pressable>
        </View>
        <Text style={styles.stepSub}>Toque em + para adicionar outra foto ou vídeo.</Text>
        <FlatList
          data={assets}
          keyExtractor={(item, i) => `${item.uri}-${i}`}
          numColumns={3}
          contentContainerStyle={{ padding: spacing.lg, gap: 6 }}
          renderItem={({ item, index }) => (
            <View style={styles.gridItem}>
              {item.kind === 'photo' ? (
                <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.videoThumb]}>
                  <Ionicons name="videocam" size={26} color="#fff" />
                </View>
              )}
              <Pressable
                onPress={() => setAssets((cur) => cur.filter((_, i) => i !== index))}
                style={styles.removeBtn}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
              {index === 0 ? <View style={styles.coverTag}><Text style={styles.coverTagText}>Capa</Text></View> : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyGallery}>
              <Ionicons name="images-outline" size={50} color={colors.muted} />
              <Text style={styles.emptyText}>Nenhuma mídia selecionada</Text>
              <Pressable onPress={() => void pickFromGallery()} style={styles.nextBtn}>
                <Text style={styles.nextText}>Escolher fotos</Text>
              </Pressable>
            </View>
          }
        />
        <View style={styles.stepFooter}>
          <Pressable onPress={() => void pickFromGallery()} style={[styles.footerBtn, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="add" size={20} color={colors.text} />
            <Text style={[styles.footerBtnText, { color: colors.text }]}>Mais</Text>
          </Pressable>
          <Pressable onPress={() => setStep('customize')} style={[styles.footerBtn, { flex: 2, backgroundColor: colors.primary }]}>
            <Text style={styles.footerBtnText}>Avançar</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── ETAPA 3: PERSONALIZAÇÃO ───────────────────────────────────────
  const cover = assets[coverIndex] || assets[0] || null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setStep('gallery')} hitSlop={8}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={styles.stepTitle}>Personalizar</Text>
        <Pressable onPress={discardDraft} hitSlop={8}><Ionicons name="trash-outline" size={22} color={colors.muted} /></Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 20 }}>
          <View style={styles.preview}>
            {cover ? (
              cover.kind === 'photo' ? (
                <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.videoThumb]}><Ionicons name="videocam" size={40} color="#fff" /></View>
              )
            ) : null}
            <LinearGradient colors={theme.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} />
            {text ? <Text style={[styles.previewText, { color: theme.text }]} numberOfLines={5}>{text}</Text> : <Text style={[styles.previewPlaceholder, { color: theme.text }]}>Seu texto aparece aqui</Text>}
            <Text style={[styles.previewBrand, { color: theme.accent }]}>FLUXO</Text>
          </View>

          {assets.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {assets.map((a, i) => (
                <Pressable key={`${a.uri}-${i}`} onPress={() => setCoverIndex(i)} style={[styles.coverChoice, i === coverIndex && styles.coverChoiceOn]}>
                  {a.kind === 'photo' ? <Image source={{ uri: a.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="videocam" size={18} color="#fff" style={{ margin: 8 }} />}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escreva algo criativo…"
            placeholderTextColor={colors.faint}
            multiline
            style={[styles.input, { borderColor: theme.accent }]}
          />

          <View>
            <Text style={styles.label}>Estilo do texto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {THEMES.map((t) => (
                <Pressable key={t.id} onPress={() => setThemeId(t.id)} style={[styles.themeChip, themeId === t.id && styles.themeChipOn]}>
                  <LinearGradient colors={t.colors} style={styles.themeSwatch} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} />
                  <Text style={[styles.themeLabel, themeId === t.id && { color: colors.text }]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {format === 'poll' || format === 'imageVote' ? (
            <View style={styles.section}>
              <Text style={styles.label}>{format === 'poll' ? 'Alternativas' : 'Opções de votação'}</Text>
              {options.map((o, i) => (
                <View key={o.id} style={styles.optionRow}>
                  <TextInput value={o.label} onChangeText={(v) => setOption(o.id, v)} placeholder={`Opção ${i + 1}`} placeholderTextColor={colors.faint} style={styles.optionInput} />
                  {options.length > MIN_OPTIONS ? (
                    <Pressable onPress={() => removeOption(o.id)} hitSlop={8}><Ionicons name="close-circle-outline" size={22} color={colors.pink} /></Pressable>
                  ) : null}
                </View>
              ))}
              {options.length < MAX_OPTIONS ? (
                <Pressable onPress={addOption} style={styles.addOption}><Ionicons name="add" size={18} color={colors.primary} /><Text style={styles.addOptionText}>Adicionar opção</Text></Pressable>
              ) : null}
            </View>
          ) : null}

          {format === 'challenge' ? (
            <View style={styles.section}>
              <Text style={styles.label}>Convidar amigos</Text>
              <Text style={styles.hint}>Desafios podem ser compartilhados com amigos após publicar.</Text>
            </View>
          ) : null}

          <Pressable onPress={() => void publish()} disabled={publishing} style={styles.publishBtn}>
            {publishing ? <ActivityIndicator color="#fff" /> : <><Ionicons name="cloud-upload-outline" size={20} color="#fff" /><Text style={styles.publishText}>Publicar</Text></>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rodapé substitui as abas do app dentro desta tela */}
      <View style={styles.formatBar}>
        <FormatButton icon="radio" label="Ao vivo" active={panel === 'live'} onPress={() => openPanel('live')} tint={colors.pink} />
        <FormatButton icon="stats-chart" label="Enquete" active={panel === 'poll'} onPress={() => openPanel('poll')} />
        <FormatButton icon="videocam" label="Clips" active={panel === 'clips'} onPress={() => openPanel('clips')} />
        <FormatButton icon="images" label="Votação" active={panel === 'vote'} onPress={() => openPanel('vote')} />
      </View>

      <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <TouchableWithoutFeedback onPress={() => setPanel(null)}>
          <View style={styles.sheetBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                {panel === 'live' ? (
                  <>
                    <Text style={styles.sheetTitle}>🔴 Ao vivo</Text>
                    <Text style={styles.sheetDesc}>Abra a câmera, escolha o enquadramento e só inicie a transmissão quando quiser.</Text>
                    <TextInput value={liveTitle} onChangeText={setLiveTitle} placeholder="Título da live" placeholderTextColor={colors.faint} style={styles.input} />
                    <Pressable onPress={() => { setPanel(null); setLiveMode(true); setStep('capture'); }} style={styles.sheetBtn}>
                      <Ionicons name="camera-outline" size={20} color="#fff" /><Text style={styles.sheetBtnText}>Abrir câmera</Text>
                    </Pressable>
                  </>
                ) : panel === 'poll' ? (
                  <>
                    <Text style={styles.sheetTitle}>📊 Enquete</Text>
                    <Text style={styles.sheetDesc}>Faça uma pergunta e crie até {MAX_OPTIONS} alternativas. Cada opção pode ter uma cor diferente.</Text>
                    <TextInput value={text} onChangeText={setText} placeholder="Sua pergunta" placeholderTextColor={colors.faint} style={styles.input} />
                    {options.map((o, i) => (
                      <View key={o.id} style={styles.optionRow}>
                        <View style={[styles.optionDot, { backgroundColor: THEMES[i % THEMES.length].accent }]} />
                        <TextInput value={o.label} onChangeText={(v) => setOption(o.id, v)} placeholder={`Alternativa ${i + 1}`} placeholderTextColor={colors.faint} style={styles.optionInput} />
                      </View>
                    ))}
                    <Pressable onPress={addOption} style={styles.addOption}><Ionicons name="add" size={18} color={colors.primary} /><Text style={styles.addOptionText}>Adicionar alternativa</Text></Pressable>
                  </>
                ) : panel === 'clips' ? (
                  <>
                    <Text style={styles.sheetTitle}>🎬 Clips</Text>
                    <Text style={styles.sheetDesc}>Vídeos curtos com capa e estilo próprio. {hasVideo ? 'Vídeo detectado na seleção.' : 'Selecione um vídeo na galeria.'}</Text>
                    <Text style={styles.label}>Estilo do clipe</Text>
                    <View style={styles.chipRow}>
                      {['Dramático', 'Rápido', 'Chill'].map((s) => (
                        <Pressable key={s} onPress={() => setClipStyle(s)} style={[styles.smallChip, clipStyle === s && styles.smallChipOn]}>
                          <Text style={[styles.smallChipText, clipStyle === s && { color: '#fff' }]}>{s}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable onPress={() => { setPanel(null); setStep('gallery'); }} style={styles.sheetBtn}>
                      <Ionicons name="videocam-outline" size={20} color="#fff" /><Text style={styles.sheetBtnText}>Escolher vídeo</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.sheetTitle}>🖼️ Votação</Text>
                    <Text style={styles.sheetDesc}>Compare imagens e descubra a favorita. Cada foto vira uma opção com sua própria legenda.</Text>
                    {options.map((o, i) => (
                      <View key={o.id} style={styles.optionRow}>
                        <Text style={styles.voteIndex}>{i + 1}</Text>
                        <TextInput value={o.label} onChangeText={(v) => setOption(o.id, v)} placeholder={`Legenda da foto ${i + 1}`} placeholderTextColor={colors.faint} style={styles.optionInput} />
                      </View>
                    ))}
                    <Pressable onPress={() => { setPanel(null); setStep('gallery'); }} style={styles.sheetBtn}>
                      <Ionicons name="images-outline" size={20} color="#fff" /><Text style={styles.sheetBtnText}>Escolher fotos</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

function FormatButton({ icon, label, active, onPress, tint }: { icon: any; label: string; active: boolean; onPress: () => void; tint?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.formatBtn, active && styles.formatBtnActive]}>
      <View style={[styles.formatIcon, active && { backgroundColor: tint || colors.primary }]}>
        <Ionicons name={icon} size={19} color={active ? '#fff' : (tint || colors.muted)} />
      </View>
      <Text style={[styles.formatLabel, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  captureRoot: { flex: 1, backgroundColor: '#000' },
  captureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingTop: 48 },
  topNextBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.primary },
  topNextText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  captureTypes: { position: 'absolute', top: 108, left: 0, right: 0 },
  captureTypesRow: { paddingHorizontal: spacing.lg, gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  captureBottom: { position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center', gap: 16 },
  captureHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, width: '100%' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  thumbBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.primary },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  startLiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: radius.pill, backgroundColor: colors.pink },
  startLiveText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  perm: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  permText: { color: colors.text, textAlign: 'center' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10 },
  stepTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  stepSub: { color: colors.muted, fontSize: 12, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  gridItem: { width: '32%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  videoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#11131d' },
  removeBtn: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  coverTag: { position: 'absolute', bottom: 5, left: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.primary },
  coverTagText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  emptyGallery: { alignItems: 'center', gap: 12, paddingTop: 70 },
  emptyText: { color: colors.muted },
  stepFooter: { flexDirection: 'row', gap: 8, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  footerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: radius.lg },
  footerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  preview: { height: 300, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', padding: 18 },
  previewText: { fontSize: 22, fontWeight: '900', lineHeight: 27, zIndex: 2 },
  previewPlaceholder: { fontSize: 18, fontWeight: '700', opacity: 0.8, zIndex: 2 },
  previewBrand: { position: 'absolute', top: 14, right: 16, fontSize: 12, fontWeight: '900', letterSpacing: 2, zIndex: 2 },
  coverChoice: { width: 56, height: 56, borderRadius: radius.md, overflow: 'hidden', marginRight: 8, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surfaceAlt },
  coverChoiceOn: { borderColor: colors.primary },
  input: { minHeight: 96, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, padding: 14, fontSize: 15, textAlignVertical: 'top' },
  label: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 12 },
  themeChip: { alignItems: 'center', marginRight: 10, padding: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  themeChipOn: { borderColor: colors.primary },
  themeSwatch: { width: 44, height: 44, borderRadius: 10 },
  themeLabel: { color: colors.muted, fontSize: 10, marginTop: 4 },
  section: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionInput: { flex: 1, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12 },
  optionDot: { width: 14, height: 14, borderRadius: 7 },
  addOption: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  addOptionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: radius.lg, backgroundColor: colors.primary },
  publishText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  formatBar: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  formatBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  formatIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  formatBtnActive: {},
  formatLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, gap: 12, maxHeight: '82%' },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sheetDesc: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.primary },
  sheetBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  chipRow: { flexDirection: 'row', gap: 8 },
  smallChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  smallChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallChipText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  voteIndex: { color: colors.cyan, fontWeight: '900' },
});
