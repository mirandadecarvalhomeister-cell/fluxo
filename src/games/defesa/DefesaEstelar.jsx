import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '../../store/AppContext';
import { Icon } from '../../components/Icon';

const BEST_KEY = 'fluxo.defesa.best.v1';
const WAVES = [
  { count: 6, speed: 1.5, hp: 1, interval: 900 },
  { count: 9, speed: 2.0, hp: 1, interval: 750 },
  { count: 12, speed: 2.5, hp: 2, interval: 620 },
];

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

function makeCommander() {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.25, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.85, roughness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x22e6ff });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.1, 6), armor);
  legs.position.y = 0.55;
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 1.1, 6), armor);
  torso.position.y = 1.55;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glow);
  chest.position.set(0, 1.6, 0.42);
  group.add(chest);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), armor);
  head.position.y = 2.35;
  group.add(head);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), glow);
    eye.position.set(side * 0.13, 2.38, 0.3);
    group.add(eye);
    const shoulder = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), gold);
    shoulder.position.set(side * 0.62, 1.95, 0);
    shoulder.rotation.z = side * 0.4;
    group.add(shoulder);
  }

  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0b1a3a, side: THREE.DoubleSide, roughness: 0.8 })
  );
  cape.position.set(0, 1.35, -0.35);
  cape.rotation.x = 0.22;
  group.add(cape);

  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.5, 4), glow);
  blade.position.set(0.85, 1.2, 0.2);
  blade.rotation.z = -0.25;
  group.add(blade);

  return group;
}

export default function DefesaEstelar() {
  const { actions } = useApp();
  const [screen, setScreen] = useState('home');
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [kills, setKills] = useState(0);
  const [hp, setHp] = useState(100);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(readBest);
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const statsRef = useRef({ score: 0, kills: 0, hp: 100, combo: 0 });

  const syncStats = useCallback(() => {
    const s = statsRef.current;
    setScore(s.score);
    setKills(s.kills);
    setHp(s.hp);
    setCombo(s.combo);
  }, []);

  const finish = useCallback((won) => {
    const final = statsRef.current.score;
    if (final > readBest()) {
      try { localStorage.setItem(BEST_KEY, String(final)); } catch { /* ignore */ }
      setBest(final);
    }
    gameRef.current = null;
    setScreen(won ? 'won' : 'results');
  }, []);

  useEffect(() => {
    if (screen !== 'playing') return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      actionsRef.current.notify?.('Seu navegador não suporta WebGL 3D.');
      setScreen('home');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 800, host.clientHeight || 600);
    renderer.setClearColor(0x03040d, 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050817, 0.028);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
    camera.position.set(0, 6.5, 12);
    camera.lookAt(0, 1.2, -4);

    scene.add(new THREE.AmbientLight(0x445588, 1.2));
    const key = new THREE.PointLight(0x22e6ff, 60, 30);
    key.position.set(3, 8, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0x9a5cff, 45, 28);
    rim.position.set(-5, 4, -8);
    scene.add(rim);

    // Plataforma octogonal com bordas neon.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.6, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a1024, metalness: 0.7, roughness: 0.4, flatShading: true })
    );
    platform.position.y = -0.15;
    scene.add(platform);
    const platformEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(platform.geometry),
      new THREE.LineBasicMaterial({ color: 0x22e6ff, transparent: true, opacity: 0.6 })
    );
    platform.add(platformEdge);

    // Estrelas.
    const starGeo = new THREE.BufferGeometry();
    const arr = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 70;
      arr[i * 3 + 1] = Math.random() * 30 - 4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 70 - 15;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.09, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    const commander = makeCommander();
    commander.position.set(0, 0, 2.5);
    scene.add(commander);

    const enemies = [];
    const shots = [];
    const bursts = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    let raf = 0;
    let spawnTimer = 0;
    let spawned = 0;
    let waveIndex = 0;
    let waveBreak = 0;
    let alive = true;
    const state = { over: false };

    statsRef.current = { score: 0, kills: 0, hp: 100, combo: 0 };
    setWave(1);
    syncStats();

    function spawnEnemy() {
      const cfg = WAVES[waveIndex];
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5, 0),
        new THREE.MeshStandardMaterial({
          color: 0x1b0b2e, emissive: waveIndex === 2 ? 0xff2d87 : 0x8b5cf6,
          emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.25, flatShading: true,
        })
      );
      mesh.position.set((Math.random() - 0.5) * 8, 1 + Math.random() * 2.5, -22 - Math.random() * 5);
      scene.add(mesh);
      enemies.push({ mesh, hp: cfg.hp, speed: cfg.speed, spin: Math.random() * 2 });
    }

    function explode(position, color = 0xff7a3c) {
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(28 * 3);
      const vel = [];
      for (let i = 0; i < 28; i += 1) {
        p[i * 3] = position.x; p[i * 3 + 1] = position.y; p[i * 3 + 2] = position.z;
        vel.push(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5));
      }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 1 }));
      scene.add(points);
      bursts.push({ points, vel, life: 1 });
    }

    function shoot(target) {
      const origin = commander.position.clone().add(new THREE.Vector3(0, 1.7, 0));
      const shot = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x22e6ff })
      );
      shot.position.copy(origin);
      scene.add(shot);
      shots.push({ mesh: shot, target, speed: 28 });
      commander.rotation.y = Math.max(-0.6, Math.min(0.6, target.mesh.position.x * 0.06));
    }

    function onPointer(event) {
      if (state.over) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(enemies.map((e) => e.mesh), false);
      let target = null;
      if (hits.length) {
        target = enemies.find((e) => e.mesh === hits[0].object) || null;
      } else {
        // Sem acerto direto, pega o inimigo mais próximo da base.
        target = enemies.reduce((bestE, e) => (!bestE || e.mesh.position.z > bestE.mesh.position.z ? e : bestE), null);
      }
      if (target) shoot(target);
    }
    renderer.domElement.addEventListener('pointerdown', onPointer);

    function resize() {
      if (!host.isConnected) return;
      const w = host.clientWidth || 800;
      const h = host.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(host);
    resize();

    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      const cfg = WAVES[waveIndex];

      if (!state.over) {
        if (waveBreak > 0) {
          waveBreak -= dt;
          if (waveBreak <= 0) {
            waveIndex += 1;
            spawned = 0;
            spawnTimer = 0;
            if (waveIndex >= WAVES.length) { finish(true); state.over = true; }
            else setWave(waveIndex + 1);
          }
        } else if (spawned < cfg.count) {
          spawnTimer -= dt;
          if (spawnTimer <= 0) { spawnEnemy(); spawned += 1; spawnTimer = cfg.interval / 1000; }
        } else if (!enemies.length && !shots.length) {
          waveBreak = 1.6;
        }
      }

      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const e = enemies[i];
        e.mesh.position.z += e.speed * dt;
        e.mesh.rotation.y += e.spin * dt;
        if (e.mesh.position.z > 1.4) {
          explode(e.mesh.position, 0xff2d87);
          scene.remove(e.mesh);
          e.mesh.geometry.dispose(); e.mesh.material.dispose();
          enemies.splice(i, 1);
          statsRef.current.hp = Math.max(0, statsRef.current.hp - 16);
          statsRef.current.combo = 0;
          syncStats();
          if (statsRef.current.hp <= 0) { finish(false); state.over = true; }
        }
      }

      for (let i = shots.length - 1; i >= 0; i -= 1) {
        const s = shots[i];
        const targetPos = s.target?.mesh?.position;
        if (!targetPos || !enemies.includes(s.target)) {
          scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); shots.splice(i, 1); continue;
        }
        const dir = targetPos.clone().sub(s.mesh.position);
        const dist = dir.length();
        if (dist < 0.45) {
          s.target.hp -= 1;
          if (s.target.hp <= 0) {
            const idx = enemies.indexOf(s.target);
            if (idx >= 0) enemies.splice(idx, 1);
            explode(targetPos);
            scene.remove(s.target.mesh);
            s.target.mesh.geometry.dispose(); s.target.mesh.material.dispose();
            statsRef.current.kills += 1;
            statsRef.current.combo += 1;
            statsRef.current.score += 100 + statsRef.current.combo * 10;
            syncStats();
          }
          scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); shots.splice(i, 1);
        } else {
          s.mesh.position.add(dir.normalize().multiplyScalar(s.speed * dt));
        }
      }

      for (let i = bursts.length - 1; i >= 0; i -= 1) {
        const b = bursts[i];
        b.life -= dt * 1.4;
        const pos = b.points.geometry.attributes.position;
        for (let j = 0; j < b.vel.length; j += 1) {
          pos.array[j * 3] += b.vel[j].x * dt;
          pos.array[j * 3 + 1] += b.vel[j].y * dt;
          pos.array[j * 3 + 2] += b.vel[j].z * dt;
        }
        pos.needsUpdate = true;
        b.points.material.opacity = Math.max(0, b.life);
        if (b.life <= 0) {
          scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose(); bursts.splice(i, 1);
        }
      }

      stars.rotation.y += dt * 0.01;
      renderer.render(scene, camera);
    }
    loop();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      gameRef.current = null;
    };
  }, [screen, finish, syncStats]);

  function share() {
    actions.publish(`🛡️ Comandante Cibernético — Defesa Estelar: ${score} pontos, ${kills} drones abatidos no Fluxo!`);
    actions.notify?.('Resultado compartilhado no feed!');
  }

  return (
    <div className="defesa-game">
      <header className="defesa-top">
        <button className="icon-btn" type="button" onClick={actions.closeDefesa} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <div className="defesa-brand">
          <span>◇</span>
          <div>
            <b>COMANDANTE CIBERNÉTICO</b>
            <small>DEFESA ESTELAR</small>
          </div>
        </div>
        {screen === 'playing' ? <span className="defesa-top-score">{score} pts</span> : null}
      </header>

      {screen === 'home' ? (
        <section className="defesa-home">
          <div className="defesa-emblem">◇</div>
          <h1>DEFESA ESTELAR</h1>
          <p>Os drones se aproximam da estação. Toque neles para destruí-los antes que cheguem ao centro.</p>
          <div className="defesa-home-actions">
            <button className="btn primary" type="button" onClick={() => setScreen('playing')}>
              <Icon name="play" /> INICIAR DEFESA
            </button>
          </div>
          <p className="defesa-best">Recorde: {best} pontos</p>
          <p className="defesa-tip">3 ondas · toque ou clique nos inimigos · cada drone que passa tira 16 de integridade</p>
        </section>
      ) : null}

      {screen === 'playing' ? (
        <>
          <div className="defesa-hud">
            <span>ONDA {wave}/{WAVES.length}</span>
            <span>ABATES {kills}</span>
            <span>COMBO x{combo}</span>
          </div>
          <div className="defesa-hp">
            <span>INTEGRIDADE</span>
            <div><i style={{ width: `${hp}%` }} /></div>
            <b>{hp}%</b>
          </div>
          <div className="defesa-stage" ref={hostRef} />
        </>
      ) : null}

      {screen === 'results' || screen === 'won' ? (
        <section className="defesa-home">
          <div className="defesa-emblem">{screen === 'won' ? '🏆' : '💥'}</div>
          <h1>{screen === 'won' ? 'ESTAÇÃO SEGURA!' : 'ESTAÇÃO COMPROMETIDA'}</h1>
          <p>
            {screen === 'won'
              ? 'Você repeliu todas as ondas.'
              : `Você resistiu até a onda ${wave}.`} {score} pontos · {kills} abates.
          </p>
          <div className="defesa-home-actions">
            <button className="btn primary" type="button" onClick={() => setScreen('playing')}>
              <Icon name="play" /> JOGAR DE NOVO
            </button>
            <button className="btn ghost" type="button" onClick={share}>
              <Icon name="share" /> COMPARTILHAR
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
