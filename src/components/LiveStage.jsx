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

function RemoteAudio({ track }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    track.attach(element);
    return () => track.detach(element);
  }, [track]);

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
  const localVideoRef = useRef(null);
  const roomRef = useRef(null);
  const author = userOf(data, channel.owner);

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
    <div className="stage lk-stage">
      {mainLocal ? (
        <video
          ref={localVideoRef}
          className={localScreen ? 'lk-video' : 'lk-video lk-local'}
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
        <RemoteAudio key={item.sid} track={item.track} />
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
