import { useEffect, useRef, useState } from 'react';
import {
  Room as LiveKitRoom,
  RoomEvent,
  Track,
} from 'livekit-client';
import { fetchLiveToken, isLiveKitEnabled } from '../lib/livekit';
import { fmt } from '../lib/utils';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

function RemoteVideo({ track, className = 'lk-video' }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    track.attach(element);
    return () => track.detach(element);
  }, [track]);

  return <video ref={ref} className={className} autoPlay playsInline />;
}

function RemoteAudio({ track, muted, volume }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    track.attach(element);
    return () => track.detach(element);
  }, [track]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = !!muted;
    element.volume = Math.max(0, Math.min(1, volume));
  }, [muted, volume]);

  return <audio ref={ref} autoPlay />;
}

export default function LiveStage({ channel, owner, clock, hearts }) {
  const { data } = useApp();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [remoteTracks, setRemoteTracks] = useState([]);
  const [localCamera, setLocalCamera] = useState(null);
  const [localScreen, setLocalScreen] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [facing, setFacing] = useState('user');
  const [fullscreen, setFullscreen] = useState(false);
  const localVideoRef = useRef(null);
  const roomRef = useRef(null);
  const stageRef = useRef(null);
  const author = userOf(data, channel.owner);

  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!isLiveKitEnabled) {
      setStatus('error');
      setError('LiveKit não configurado. Defina VITE_LIVEKIT_URL.');
      return undefined;
    }

    let cancelled = false;
    const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setStatus('connecting');
    setError('');
    setNotice('');
    setRemoteTracks([]);
    setLocalCamera(null);
    setLocalScreen(null);
    setMicOn(false);
    setCamOn(false);
    setSharing(false);
    setBusy('');
    setAudioBlocked(false);

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
        setRemoteTracks((current) => [
          ...current.filter((item) => item.sid !== track.sid),
          { sid: track.sid, track },
        ]);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (cancelled) return;
      setRemoteTracks((current) => current.filter((item) => item.sid !== track.sid));
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!cancelled) setAudioBlocked(!room.canPlaybackAudio);
    });

    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) setStatus('idle');
    });

    async function connect() {
      try {
        const role = owner ? 'host' : 'viewer';
        const { token, url } = await fetchLiveToken(channel.id, role);
        await room.connect(url, token);
        if (cancelled) {
          room.disconnect();
          return;
        }

        if (owner) {
          try {
            const publication = await room.localParticipant.setCameraEnabled(true);
            const cameraTrack =
              publication?.track ||
              room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ||
              null;
            if (!cancelled) {
              setLocalCamera(cameraTrack);
              setCamOn(Boolean(cameraTrack));
              if (!cameraTrack) {
                setNotice('Câmera não encontrada. Você pode seguir apenas com áudio.');
              }
            }
          } catch (cameraError) {
            if (!cancelled) {
              setCamOn(false);
              setNotice('Câmera indisponível. Você pode seguir apenas com áudio.');
            }
          }

          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            if (!cancelled) setMicOn(true);
          } catch (microphoneError) {
            if (!cancelled) {
              setMicOn(false);
              setNotice('Microfone indisponível. A câmera continua ao vivo.');
            }
          }
        }

        if (!cancelled) setStatus('connected');
      } catch (connectionError) {
        if (cancelled) return;
        setError(
          connectionError?.message || 'Não foi possível conectar a transmissão.'
        );
        setStatus('error');
      }
    }

    connect();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [channel.id, owner, attempt]);

  const mainLocal = localScreen || localCamera;

  useEffect(() => {
    const element = localVideoRef.current;
    if (!mainLocal || !element) return undefined;
    mainLocal.attach(element);
    return () => mainLocal.detach(element);
  }, [mainLocal]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('mic');
    setNotice('');
    try {
      if (micOn) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicOn(false);
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      }
    } catch (micError) {
      setNotice('Microfone indisponível. Verifique a permissão do navegador.');
    } finally {
      setBusy('');
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('camera');
    setNotice('');
    try {
      if (camOn) {
        await room.localParticipant.setCameraEnabled(false);
        setLocalCamera(null);
        setCamOn(false);
      } else {
        const publication = await room.localParticipant.setCameraEnabled(true);
        const cameraTrack =
          publication?.track ||
          room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ||
          null;
        if (cameraTrack) {
          setLocalCamera(cameraTrack);
          setCamOn(true);
        } else {
          setNotice('Câmera não encontrada neste dispositivo.');
        }
      }
    } catch (cameraError) {
      setNotice('Câmera indisponível. Verifique a permissão do navegador.');
    } finally {
      setBusy('');
    }
  }

  async function flipCamera() {
    const room = roomRef.current;
    if (!room || busy || !camOn) return;
    setBusy('flip');
    setNotice('');
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      const cameras = (devices || []).filter(
        (device) => device.kind === 'videoinput' && device.deviceId
      );
      const currentTrack =
        room.localParticipant.getTrackPublication(Track.Source.Camera)?.track
          ?.mediaStreamTrack || null;
      const currentId = currentTrack?.getSettings?.().deviceId || null;
      const currentLabel = String(currentTrack?.label || '').toLowerCase();
      const currentRear = /(back|rear|traseira|environment|trás|tras|wide)/.test(
        currentLabel
      );
      const options = cameras.filter((device) => device.deviceId !== currentId);
      if (!options.length) {
        setNotice('Este dispositivo não tem outra câmera disponível.');
        return;
      }
      const target =
        options.find((device) => {
          const label = String(device.label || '').toLowerCase();
          const rear = /(back|rear|traseira|environment|trás|tras|wide)/.test(label);
          return currentRear ? !rear : rear;
        }) || options[0];

      await room.switchActiveDevice('videoinput', target.deviceId, true);
      const cameraTrack =
        room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ||
        null;
      const actualId =
        cameraTrack?.mediaStreamTrack?.getSettings?.().deviceId || null;
      if (!cameraTrack || (actualId && actualId === currentId)) {
        setNotice('Não foi possível trocar para a outra câmera neste dispositivo.');
        return;
      }
      setLocalCamera(cameraTrack);
      setCamOn(true);
      setFacing(
        /(back|rear|traseira|environment|trás|tras|wide)/.test(
          String(cameraTrack.mediaStreamTrack?.label || '').toLowerCase()
        )
          ? 'environment'
          : 'user'
      );
    } catch (cameraError) {
      setNotice('Não foi possível trocar a câmera.');
    } finally {
      setBusy('');
    }
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen?.();
      } else if (stage.requestFullscreen) {
        await stage.requestFullscreen();
      } else {
        setNotice('Tela cheia não é suportada neste navegador.');
      }
    } catch {
      setNotice('Não foi possível entrar em tela cheia.');
    }
  }

  async function toggleShare() {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('share');
    setNotice('');
    try {
      if (sharing) {
        await room.localParticipant.setScreenShareEnabled(false);
        setLocalScreen(null);
        setSharing(false);
      } else {
        const publication = await room.localParticipant.setScreenShareEnabled(true);
        const screenTrack =
          publication?.track ||
          room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ||
          null;
        if (screenTrack) {
          setLocalScreen(screenTrack);
          setSharing(true);
        } else {
          setNotice('Compartilhamento de tela não suportado neste navegador.');
        }
      }
    } catch (shareError) {
      setNotice('Não foi possível compartilhar a tela.');
    } finally {
      setBusy('');
    }
  }

  const videoTracks = remoteTracks.filter(
    (item) => item.track.kind === Track.Kind.Video
  );
  const remoteAudios = remoteTracks.filter(
    (item) => item.track.kind === Track.Kind.Audio
  );
  const screenShare = videoTracks.find(
    (item) => item.track.source === Track.Source.ScreenShare
  );
  const cameraTracks = videoTracks.filter(
    (item) => item.track.source !== Track.Source.ScreenShare
  );
  const mainRemote = screenShare || cameraTracks[0] || null;
  const pipRemote = screenShare ? cameraTracks[0] || null : null;
  const hasVideo = Boolean(mainLocal || mainRemote);
  const controlsReady = status === 'connected';

  return (
    <div className="stage lk-stage" ref={stageRef}>
      {mainLocal ? (
        <video
          ref={localVideoRef}
          className={
            localScreen
              ? 'lk-video'
              : `lk-video lk-local${facing === 'environment' ? ' lk-rear' : ''}`
          }
          autoPlay
          playsInline
          muted
        />
      ) : null}
      {mainRemote ? <RemoteVideo key={mainRemote.sid} track={mainRemote.track} /> : null}
      {pipRemote ? (
        <RemoteVideo
          key={`pip-${pipRemote.sid}`}
          track={pipRemote.track}
          className="lk-video lk-pip"
        />
      ) : null}
      {remoteAudios.map((item) => (
        <RemoteAudio
          key={item.sid}
          track={item.track}
          muted={muted}
          volume={volume}
        />
      ))}

      <span className="glowb" />
      <div className="tl">
        <span className="livepill">AO VIVO</span>
        <span className="vpill">{owner ? clock : ''}</span>
      </div>
      <div className="tr">
        <span className="vpill">
          <Icon name="eye" /> {fmt(channel.viewers)}
        </span>
      </div>

      <div className="lk-tools">
        {controlsReady ? (
          <>
            <button
              type="button"
              className={muted ? 'off' : ''}
              onClick={() => setMuted((value) => !value)}
              aria-pressed={muted}
              title={muted ? 'Ativar som' : 'Silenciar'}
            >
              <Icon name={muted ? 'volumeoff' : 'volume'} />
            </button>
            <input
              className="lk-vol"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(event) => {
                setVolume(Number(event.target.value));
                setMuted(false);
                if (audioBlocked) roomRef.current?.startAudio().catch(() => {});
              }}
              aria-label="Volume da transmissão"
            />
          </>
        ) : null}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          <Icon name={fullscreen ? 'compress' : 'expand'} />
        </button>
      </div>

      {!hasVideo ? (
        <div className="center">
          <span className="ring">
            <Avatar user={author} size={92} />
          </span>
        </div>
      ) : null}

      <div className="cap">
        <div>
          <b>{channel.title || channel.name}</b>
          <div className="sm">{author.name}</div>
        </div>
        <div className="row">
          <div className="eq" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      {hearts}

      {owner ? (
        <div className="lk-controls" role="group" aria-label="Controles da transmissão">
          <button
            type="button"
            className={micOn ? 'on' : 'off'}
            onClick={toggleMic}
            disabled={!controlsReady || busy === 'mic'}
            aria-pressed={micOn}
            title={micOn ? 'Desativar microfone' : 'Ativar microfone'}
          >
            <Icon name="mic" />
          </button>
          <button
            type="button"
            className={camOn ? 'on' : 'off'}
            onClick={toggleCamera}
            disabled={!controlsReady || busy === 'camera'}
            aria-pressed={camOn}
            title={camOn ? 'Desligar câmera' : 'Ligar câmera'}
          >
            <Icon name="video" />
          </button>
          <button
            type="button"
            onClick={flipCamera}
            disabled={!controlsReady || busy === 'flip' || !camOn}
            title="Trocar câmera"
            aria-label="Trocar câmera"
          >
            <Icon name="camera" />
          </button>
          <button
            type="button"
            className={sharing ? 'on' : ''}
            onClick={toggleShare}
            disabled={!controlsReady || busy === 'share'}
            aria-pressed={sharing}
            title={sharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
          >
            <Icon name="screen" />
          </button>
        </div>
      ) : null}

      {status === 'connecting' ? (
        <div className="lk-status">
          <span className="lk-dot" /> Conectando câmera...
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="lk-status error">
          <span>{error}</span>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      {notice ? <div className="lk-notice">{notice}</div> : null}

      {audioBlocked ? (
        <button
          className="btn tonal lk-audio"
          type="button"
          onClick={async () => {
            try {
              await roomRef.current?.startAudio();
              setAudioBlocked(false);
            } catch (audioError) {
              setNotice('Toque em Ativar áudio para ouvir a live.');
            }
          }}
        >
          <Icon name="volume" /> Ativar áudio
        </button>
      ) : null}
    </div>
  );
}
