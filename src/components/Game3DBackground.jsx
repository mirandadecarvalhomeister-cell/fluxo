import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Camada 3D decorativa, sem interferir na lógica nem nos cliques dos jogos.
export default function Game3DBackground({ variant = 'quiz', intensity = 0 }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 800, host.clientHeight || 600);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(variant === 'quiz' ? 0x120822 : 0x05040b, 0.045);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    sceneRef.current = scene;

    const primary = variant === 'quiz' ? 0x9a5cff : 0x22e6ff;
    const secondary = variant === 'quiz' ? 0x22e6ff : 0x9a5cff;

    // Estrelas / partículas ao fundo.
    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 26;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: secondary,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Grade neon no "chão".
    const grid = new THREE.GridHelper(34, 34, primary, secondary);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.rotation.x = Math.PI / 2.35;
    grid.position.y = -3.4;
    grid.position.z = -5;
    scene.add(grid);

    // Peça central: bomba no Quiz, diamante no Nível Zero.
    const coreGeo =
      variant === 'quiz'
        ? new THREE.IcosahedronGeometry(1.7, 1)
        : new THREE.OctahedronGeometry(1.9, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0b0718,
      emissive: primary,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.22,
      flatShading: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(2.7, 0.5, -2);
    scene.add(core);

    const wireMat = new THREE.LineBasicMaterial({ color: secondary, transparent: true, opacity: 0.75 });
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeo, 8), wireMat);
    core.add(wire);

    const innerMat = new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.55 });
    const inner = new THREE.Mesh(
      variant === 'quiz' ? new THREE.SphereGeometry(0.5, 16, 16) : new THREE.OctahedronGeometry(0.62, 0),
      innerMat
    );
    core.add(inner);

    const light = new THREE.PointLight(primary, 4, 18);
    light.position.set(2.7, 0.5, 0);
    scene.add(light);
    const light2 = new THREE.PointLight(secondary, 2.5, 16);
    light2.position.set(-3, -2, 3);
    scene.add(light2);

    // Anéis orbitais.
    const ringMat = new THREE.MeshBasicMaterial({ color: primary, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.012, 8, 96), ringMat);
    ring1.rotation.x = Math.PI / 2.6;
    core.add(ring1);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.01, 8, 96),
      new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring2.rotation.y = Math.PI / 2.8;
    core.add(ring2);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let alive = true;
    const clock = new THREE.Clock();

    function resize() {
      if (!host.isConnected) return;
      const width = host.clientWidth || 800;
      const height = host.clientHeight || 600;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);
    resize();

    function render() {
      if (!alive) return;
      const t = clock.getElapsedTime();
      const heat = intensityRef.current || 0;
      core.rotation.y = t * (variant === 'quiz' ? 0.35 + heat * 0.9 : 0.28);
      core.rotation.x = Math.sin(t * 0.4) * 0.22;
      const pulse = 1 + Math.sin(t * (2.2 + heat * 5)) * (0.035 + heat * 0.07);
      core.scale.setScalar(pulse);
      inner.rotation.y = -t * 0.8;
      ring1.rotation.z = t * 0.25;
      ring2.rotation.x = -t * 0.18;
      stars.rotation.y = t * 0.012;
      light.intensity = 3.4 + Math.sin(t * 2) * 0.6 + heat * 3;
      renderer.render(scene, camera);
      if (!reduce) frame = requestAnimationFrame(render);
    }
    render();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose?.());
        else object.material?.dispose?.();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [variant]);

  return <div className="game-3d-bg" ref={hostRef} aria-hidden="true" />;
}
