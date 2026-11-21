import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCharacterRig, updateCharacterAnimation } from '../engine/ProceduralModels';
import { CharacterDef, WeaponDef } from '../types/game';

interface Lobby3DPreviewProps {
  character: CharacterDef;
  weapon: WeaponDef;
}

function isSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function Lobby3DPreview({ character, weapon }: Lobby3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ character, weapon, yaw: 0.35, dragging: false, lastX: 0 });
  stateRef.current.character = character;
  stateRef.current.weapon = weapon;

  const rigContainerRef = useRef<{
    scene: THREE.Scene;
    rigGroup: THREE.Group;
    rig: ReturnType<typeof buildCharacterRig> | null;
    softGl: boolean;
  } | null>(null);

  // Rebuild 3D rig whenever selected character or weapon changes
  useEffect(() => {
    const ctx = rigContainerRef.current;
    if (!ctx) return;
    if (ctx.rig) {
      ctx.rigGroup.remove(ctx.rig.root);
    }
    const nextRig = buildCharacterRig(character, weapon, !ctx.softGl);
    ctx.rig = nextRig;
    ctx.rigGroup.add(nextRig.root);
  }, [character, weapon]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const softGl = isSoftwareWebGL();
    const width = Math.max(300, el.clientWidth || 600);
    const height = Math.max(240, el.clientHeight || 420);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c111b');
    scene.fog = new THREE.FogExp2('#0c111b', 0.045);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(0.15, 1.45, 3.6);
    camera.lookAt(0, 1.05, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !softGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(softGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !softGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Three-Point Studio Hangar Lighting
    const hemi = new THREE.HemisphereLight('#93c5fd', '#1e293b', 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff1d6', 2.0);
    keyLight.position.set(3.2, 4.8, 3.5);
    keyLight.castShadow = !softGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 1.35);
    rimLight.position.set(-3.5, 3.0, -3.0);
    scene.add(rimLight);

    // Tactical Hangar Pedestal
    const pedGroup = new THREE.Group();
    const pedGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.2, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: '#18202c',
      roughness: 0.45,
      metalness: 0.65,
    });
    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.position.y = -0.1;
    pedMesh.receiveShadow = !softGl;

    const ringGeo = new THREE.RingGeometry(1.06, 1.13, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.015;

    const floorGeo = new THREE.CircleGeometry(14, 32);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0f1623',
      roughness: 0.72,
      metalness: 0.25,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.2;
    floorMesh.receiveShadow = !softGl;

    pedGroup.add(pedMesh, ringMesh, floorMesh);
    scene.add(pedGroup);

    const rigGroup = new THREE.Group();
    scene.add(rigGroup);
    const initialRig = buildCharacterRig(
      stateRef.current.character,
      stateRef.current.weapon,
      !softGl,
    );
    rigGroup.add(initialRig.root);

    rigContainerRef.current = {
      scene,
      rigGroup,
      rig: initialRig,
      softGl,
    };

    const handlePointerDown = (e: PointerEvent) => {
      stateRef.current.dragging = true;
      stateRef.current.lastX = e.clientX;
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (!stateRef.current.dragging) return;
      const dx = e.clientX - stateRef.current.lastX;
      stateRef.current.lastX = e.clientX;
      stateRef.current.yaw += dx * 0.01;
    };
    const handlePointerUp = () => {
      stateRef.current.dragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!el) return;
      const w = Math.max(300, el.clientWidth);
      const h = Math.max(240, el.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let lastT = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      if (!stateRef.current.dragging) {
        stateRef.current.yaw += dt * 0.22;
      }

      rigGroup.rotation.y = stateRef.current.yaw;
      if (rigContainerRef.current?.rig) {
        updateCharacterAnimation(rigContainerRef.current.rig, dt, {
          speed: 0,
          isSprinting: false,
          isCrouching: false,
          isJumping: false,
          isParachuting: false,
          isAiming: true,
          isDead: false,
          walkPhase: 0,
          recoilAlpha: 0,
          pitch: 0.05 * Math.sin(now * 0.002),
        });
      }

      renderer.render(scene, camera);

      if (softGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      dom.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      pedGeo.dispose();
      pedMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mountRef} className="w-full h-full touch-none-canvas cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-slate-400 tracking-wide">
        Drag character to rotate 360°
      </div>
    </div>
  );
}
