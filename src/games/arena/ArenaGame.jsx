import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene } from './ArenaScene';

const ArenaGame = forwardRef(function ArenaGame(
  { getState, sendInput, onAlive, onDead, myId, paused },
  ref
) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const bridgeRef = useRef({});
  const pausedRef = useRef(paused);

  pausedRef.current = paused;
  bridgeRef.current.getState = () => (pausedRef.current ? null : getState?.());
  bridgeRef.current.sendInput = sendInput;
  bridgeRef.current.onAlive = onAlive;
  bridgeRef.current.onDead = onDead;
  bridgeRef.current.myId = () => myId || '';

  useImperativeHandle(
    ref,
    () => ({
      fire: () => bridgeRef.current.fire?.(),
      dash: () => bridgeRef.current.dash?.(),
    }),
    []
  );

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return undefined;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#0b0818',
      transparent: false,
      banner: false,
      audio: { noAudio: true },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: hostRef.current.clientWidth || 900,
        height: hostRef.current.clientHeight || 560,
      },
      render: {
        antialias: true,
        powerPreference: 'high-performance',
        roundPixels: false,
      },
      scene: [],
    });
    game.scene.add('arena', ArenaScene, false);
    game.scene.start('arena', { bridge: bridgeRef.current });
    gameRef.current = game;
    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, []);

  return <div className="arena-canvas" ref={hostRef} aria-label="Área do jogo" />;
});

export default ArenaGame;
