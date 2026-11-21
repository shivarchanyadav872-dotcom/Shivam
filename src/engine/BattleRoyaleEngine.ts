import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/SoundEngine';
import {
  BOT_CALLSIGNS,
  CHARACTER_MAP,
  CHARACTERS,
  ISLAND_POIS,
  WEAPON_MAP,
  WEAPONS,
} from '../data/catalog';
import {
  GameMode,
  GameSettings,
  HudSnapshot,
  KillFeedEntry,
  MatchPhase,
  MatchRecord,
  MinimapActor,
  MobileInputState,
  WeaponSlotState,
} from '../types/game';
import {
  buildIslandEnvironment,
  groundHeightAt,
  ISLAND_RADIUS,
  ObstacleCollider,
} from './IslandWorld';
import {
  ArticulatedCharacterRig,
  buildCharacterRig,
  buildLootBoxMesh,
  buildProceduralWeaponMesh,
  updateCharacterAnimation,
} from './ProceduralModels';

interface LootEntity {
  id: string;
  category: 'weapon' | 'armor' | 'medkit' | 'ammo';
  weaponId?: string;
  label: string;
  pos: THREE.Vector3;
  mesh: THREE.Group;
  collected: boolean;
}

interface BulletTracer {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface Combatant {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemoteHuman: boolean;
  characterId: string;
  rig: ArticulatedCharacterRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  alive: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  isGrounded: boolean;
  parachuteDeployed: boolean;
  inParachutePhase: boolean;
  walkPhase: number;
  footstepTimer: number;
  recoilAlpha: number;
  muzzleFlashTimer: number;
  activeSlotIndex: number;
  slots: [WeaponSlotState | null, WeaponSlotState | null, WeaponSlotState | null];
  lastFireTime: number;
  isReloading: boolean;
  reloadStartTime: number;
  // AI fields
  aiTargetId: string | null;
  aiMoveTarget: THREE.Vector3;
  aiThinkTimer: number;
  aiStrafeDir: number;
  aiAccuracy: number;
}

export interface MatchEndSummary {
  victory: boolean;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivalSeconds: number;
  weaponUsed: string;
  characterUsed: string;
}

// Module-scope reusable math objects for zero-GC game loop
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function detectSoftwareWebGL(): boolean {
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

export class BattleRoyaleEngine {
  private container: HTMLElement;
  private settings: GameSettings;
  private mode: GameMode;
  private playerUsername: string;
  private playerCharacterId: string;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onMatchEnd: (summary: MatchEndSummary) => void;
  private onSendNetworkState?: (payload: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    armor: number;
    alive: boolean;
  }) => void;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private colliders: ObstacleCollider[] = [];
  private disposables: Array<{ dispose: () => void }> = [];
  private oceanMesh!: THREE.Mesh;
  private zoneMesh!: THREE.Mesh;

  private combatants: Combatant[] = [];
  private player!: Combatant;
  private lootEntities: LootEntity[] = [];
  private tracers: BulletTracer[] = [];
  private killFeed: KillFeedEntry[] = [];

  private phase: MatchPhase = 'parachute';
  private matchStartTime = 0;
  private survivalSeconds = 0;
  private kills = 0;
  private damageDealt = 0;
  private medkits = 2;
  private stamina = 100;
  private placement = 20;
  private eliminatedBy: string | null = null;
  private matchEnded = false;

  // Safe zone state
  private zonePhase = 1;
  private zoneTimer = 42;
  private zoneCenter = new THREE.Vector2(0, 0);
  private zoneRadius = 175;
  private nextZoneCenter = new THREE.Vector2(12, -10);
  private nextZoneRadius = 115;
  private zoneDamageTick = 0;

  // Feedback timers
  private hitMarkerTimer = 0;
  private hitMarkerHeadshot = false;
  private damageFlashTimer = 0;
  private hudEmitTimer = 0;
  private networkEmitTimer = 0;
  private fpsSamples: number[] = [];
  private currentFps = 60;

  // Loop & lifecycle
  private frameId = 0;
  private lastTime = 0;
  private disposed = false;
  private paused = false;

  // Input ref
  public input: MobileInputState = {
    moveX: 0,
    moveY: 0,
    sprinting: false,
    firing: false,
    aiming: false,
    crouching: false,
    jumpRequested: false,
    reloadRequested: false,
    interactRequested: false,
    parachuteActionRequested: false,
    medkitRequested: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
    switchSlotIndex: null,
  };

  private keysDown = new Set<string>();
  private mouseFiring = false;
  private mouseAiming = false;

  constructor(opts: {
    container: HTMLElement;
    settings: GameSettings;
    mode: GameMode;
    playerUsername: string;
    playerCharacterId: string;
    remotePlayers?: Array<{ playerId: string; username: string; characterId: string }>;
    onHudUpdate: (snapshot: HudSnapshot) => void;
    onMatchEnd: (summary: MatchEndSummary) => void;
    onSendNetworkState?: (payload: {
      x: number;
      y: number;
      z: number;
      yaw: number;
      health: number;
      armor: number;
      alive: boolean;
    }) => void;
  }) {
    this.container = opts.container;
    this.settings = { ...opts.settings };
    this.mode = opts.mode;
    this.playerUsername = opts.playerUsername;
    this.playerCharacterId = opts.playerCharacterId;
    this.onHudUpdate = opts.onHudUpdate;
    this.onMatchEnd = opts.onMatchEnd;
    this.onSendNetworkState = opts.onSendNetworkState;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.initThree();
    this.initEntities(opts.remotePlayers || []);
    this.bindDesktopEvents();
    this.lastTime = performance.now();
    this.matchStartTime = this.lastTime;
    this.tick();
  }

  private initThree() {
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color('#8ec5e6');
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2('#8ec5e6', 0.0042);

    this.camera = new THREE.PerspectiveCamera(64, width / height, 0.2, 460);

    const enableShadows = !this.isSoftwareGl && this.settings.graphicsQuality !== 'low';
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    const qualityRatio =
      this.settings.graphicsQuality === 'low'
        ? 1.0
        : this.settings.graphicsQuality === 'medium'
          ? Math.min(window.devicePixelRatio, 1.4)
          : Math.min(window.devicePixelRatio, 2.0);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : qualityRatio);
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Mandatory Studio RoomEnvironment for crisp metallic PBR reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm Sun Key Light + Cool Sky/Ground Hemisphere Fill
    const hemi = new THREE.HemisphereLight('#bfe4ff', '#4b5a3c', 0.72);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight('#fff2d6', 1.65);
    this.sunLight.position.set(60, 95, 45);
    this.sunLight.castShadow = enableShadows;
    this.sunLight.shadow.mapSize.set(
      this.settings.graphicsQuality === 'high' ? 2048 : 1024,
      this.settings.graphicsQuality === 'high' ? 2048 : 1024,
    );
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const env = buildIslandEnvironment(this.scene, maxAniso, enableShadows);
    this.colliders = env.colliders;
    this.disposables = env.disposables;
    this.oceanMesh = env.oceanMesh;

    // Shrinking Safe Zone Forcefield Cylinder
    const zoneGeo = new THREE.CylinderGeometry(1, 1, 90, 48, 1, true);
    const zoneMat = new THREE.MeshBasicMaterial({
      color: '#06b6d4',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    this.zoneMesh.position.set(this.zoneCenter.x, 28, this.zoneCenter.y);
    this.zoneMesh.scale.set(this.zoneRadius, 1, this.zoneRadius);
    this.scene.add(this.zoneMesh);
    this.disposables.push(zoneGeo, zoneMat);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
  }

  private initEntities(
    remotePlayers: Array<{ playerId: string; username: string; characterId: string }>,
  ) {
    const enableShadows = !this.isSoftwareGl && this.settings.graphicsQuality !== 'low';

    // 1. Spawn Player (Parachuting above island)
    const pChar = CHARACTER_MAP[this.playerCharacterId] || CHARACTERS[0];
    const startWeapon = WEAPON_MAP['viper45'];
    const pRig = buildCharacterRig(pChar, startWeapon, enableShadows);

    const dropAngle = Math.random() * Math.PI * 2;
    const dropR = 25 + Math.random() * 45;
    const px = Math.cos(dropAngle) * dropR;
    const pz = Math.sin(dropAngle) * dropR;
    const py = 105;
    pRig.root.position.set(px, py, pz);
    this.scene.add(pRig.root);

    this.player = {
      id: 'local_player',
      name: this.playerUsername,
      isPlayer: true,
      isRemoteHuman: false,
      characterId: pChar.id,
      rig: pRig,
      pos: new THREE.Vector3(px, py, pz),
      vel: new THREE.Vector3(0, -11, 0),
      yaw: Math.atan2(-px, -pz),
      pitch: -0.25,
      health: 100,
      maxHealth: 100,
      armor: pChar.armorBonus,
      maxArmor: 100,
      alive: true,
      isCrouching: false,
      isSprinting: false,
      isAiming: false,
      isGrounded: false,
      parachuteDeployed: false,
      inParachutePhase: true,
      walkPhase: 0,
      footstepTimer: 0,
      recoilAlpha: 0,
      muzzleFlashTimer: 0,
      activeSlotIndex: 2,
      slots: [
        null,
        null,
        { weaponId: 'viper45', ammoInMag: 15, ammoReserve: 60 },
      ],
      lastFireTime: 0,
      isReloading: false,
      reloadStartTime: 0,
      aiTargetId: null,
      aiMoveTarget: new THREE.Vector3(),
      aiThinkTimer: 0,
      aiStrafeDir: 1,
      aiAccuracy: 1,
    };
    this.combatants.push(this.player);

    // 2. Spawn 19 Bots / Remote Players for a 20-player Battle Royale
    const totalOpponents = 19;
    const starterPool = ['vx47', 'specter9', 'breacher12', 'longbow50', 'viper45'];

    for (let i = 0; i < totalOpponents; i++) {
      const remote = remotePlayers[i];
      const botChar =
        (remote && CHARACTER_MAP[remote.characterId]) ||
        CHARACTERS[i % CHARACTERS.length];
      const botWeaponId = starterPool[i % starterPool.length];
      const botWeapon = WEAPON_MAP[botWeaponId];
      const rig = buildCharacterRig(botChar, botWeapon, enableShadows);

      // Distribute across island POIs and ring
      const poi = ISLAND_POIS[i % ISLAND_POIS.length];
      const ang = (i / totalOpponents) * Math.PI * 2 + Math.random() * 0.5;
      const rad = 18 + Math.random() * 35;
      const bx = THREE.MathUtils.clamp(poi.x + Math.cos(ang) * rad, -135, 135);
      const bz = THREE.MathUtils.clamp(poi.z + Math.sin(ang) * rad, -135, 135);
      const by = 85 + Math.random() * 35;

      rig.root.position.set(bx, by, bz);
      this.scene.add(rig.root);

      this.combatants.push({
        id: remote ? remote.playerId : `bot_${i}`,
        name: remote ? remote.username : BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
        isPlayer: false,
        isRemoteHuman: Boolean(remote),
        characterId: botChar.id,
        rig,
        pos: new THREE.Vector3(bx, by, bz),
        vel: new THREE.Vector3(0, -10, 0),
        yaw: Math.random() * Math.PI * 2,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        armor: 25 + Math.floor(Math.random() * 35),
        maxArmor: 100,
        alive: true,
        isCrouching: false,
        isSprinting: false,
        isAiming: false,
        isGrounded: false,
        parachuteDeployed: false,
        inParachutePhase: true,
        walkPhase: Math.random() * 6,
        footstepTimer: 0,
        recoilAlpha: 0,
        muzzleFlashTimer: 0,
        activeSlotIndex: 0,
        slots: [
          {
            weaponId: botWeaponId,
            ammoInMag: botWeapon.magazineSize,
            ammoReserve: botWeapon.reserveMax,
          },
          null,
          { weaponId: 'viper45', ammoInMag: 15, ammoReserve: 45 },
        ],
        lastFireTime: 0,
        isReloading: false,
        reloadStartTime: 0,
        aiTargetId: null,
        aiMoveTarget: new THREE.Vector3(bx, 0, bz),
        aiThinkTimer: Math.random() * 1.2,
        aiStrafeDir: Math.random() > 0.5 ? 1 : -1,
        aiAccuracy: 0.38 + Math.random() * 0.25,
      });
    }

    // 3. Spawn 46 Loot Boxes around POIs and open fields
    const lootWeapons = ['vx47', 'specter9', 'breacher12', 'longbow50'];
    let lootIdx = 0;

    for (let i = 0; i < 46; i++) {
      const poi = ISLAND_POIS[i % ISLAND_POIS.length];
      const ang = (i / 46) * Math.PI * 2 + i * 1.1;
      const dist = i < 25 ? 6 + (i % 5) * 5.5 : 30 + (i % 9) * 11;
      const lx = THREE.MathUtils.clamp(
        (i < 25 ? poi.x : 0) + Math.cos(ang) * dist,
        -138,
        138,
      );
      const lz = THREE.MathUtils.clamp(
        (i < 25 ? poi.z : 0) + Math.sin(ang) * dist,
        -138,
        138,
      );
      const ly = groundHeightAt(lx, lz);
      if (ly < 0.3) continue;

      const roll = i % 10;
      let category: LootEntity['category'] = 'weapon';
      let weaponId: string | undefined;
      let label = '';

      if (roll <= 4) {
        category = 'weapon';
        weaponId = lootWeapons[i % lootWeapons.length];
        label = WEAPON_MAP[weaponId].name;
      } else if (roll <= 6) {
        category = 'armor';
        label = 'Ballistic Armor (+50)';
      } else if (roll <= 8) {
        category = 'medkit';
        label = 'Tactical Medkit';
      } else {
        category = 'ammo';
        label = 'Ammo Crate (+60)';
      }

      const mesh = buildLootBoxMesh(category);
      mesh.position.set(lx, ly, lz);
      this.scene.add(mesh);

      this.lootEntities.push({
        id: `loot_${lootIdx++}`,
        category,
        weaponId,
        label,
        pos: new THREE.Vector3(lx, ly, lz),
        mesh,
        collected: false,
      });
    }
  }

  public updateSettings(newSettings: GameSettings) {
    this.settings = { ...newSettings };
    if (this.renderer && !this.isSoftwareGl) {
      const qualityRatio =
        newSettings.graphicsQuality === 'low'
          ? 1.0
          : newSettings.graphicsQuality === 'medium'
            ? Math.min(window.devicePixelRatio, 1.4)
            : Math.min(window.devicePixelRatio, 2.0);
      this.renderer.setPixelRatio(qualityRatio);
    }
  }

  public setPaused(p: boolean) {
    this.paused = p;
  }

  public applyRemotePlayerUpdate(data: {
    playerId: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    armor: number;
    alive: boolean;
  }) {
    const target = this.combatants.find((c) => c.id === data.playerId);
    if (!target || target.isPlayer) return;
    target.pos.set(data.x, data.y, data.z);
    target.yaw = data.yaw;
    target.health = data.health;
    target.armor = data.armor;
    target.alive = data.alive;
  }

  public resize() {
    if (this.disposed || !this.renderer || !this.camera) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keysDown.add(e.code);
    if (e.code === 'Space') this.input.jumpRequested = true;
    if (e.code === 'KeyR') this.input.reloadRequested = true;
    if (e.code === 'KeyF' || e.code === 'KeyE') this.input.interactRequested = true;
    if (e.code === 'KeyC') this.input.crouching = !this.input.crouching;
    if (e.code === 'KeyH') this.input.medkitRequested = true;
    if (e.code === 'Digit1') this.input.switchSlotIndex = 0;
    if (e.code === 'Digit2') this.input.switchSlotIndex = 1;
    if (e.code === 'Digit3') this.input.switchSlotIndex = 2;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.target !== this.renderer.domElement) return;
    soundEngine.unlock();
    if (e.button === 0) this.mouseFiring = true;
    if (e.button === 2) this.mouseAiming = true;
    if (document.pointerLockElement !== this.renderer.domElement && window.innerWidth > 900) {
      this.renderer.domElement.requestPointerLock?.();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseFiring = false;
    if (e.button === 2) this.mouseAiming = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === this.renderer.domElement) {
      const sens = this.player.isAiming
        ? this.settings.aimSensitivity
        : this.settings.touchSensitivity;
      this.input.lookDeltaX += e.movementX * 0.0024 * sens;
      this.input.lookDeltaY += e.movementY * 0.0022 * sens;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private bindDesktopEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.resizeHandler);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
  }

  private resizeHandler = () => this.resize();

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    if (rawDt > 0.001) {
      this.fpsSamples.push(1 / rawDt);
      if (this.fpsSamples.length > 20) this.fpsSamples.shift();
      this.currentFps = Math.round(
        this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length,
      );
    }

    if (!this.paused && !this.matchEnded) {
      this.survivalSeconds = (now - this.matchStartTime) / 1000;
      this.updatePlayer(dt, now);
      this.updateBots(dt, now);
      this.updateSafeZone(dt);
      this.updateLootAndTracers(dt);
      this.checkMatchStatus();
    }

    this.updateCamera(dt);
    this.updateEnvironmentVisuals(now);
    this.renderer.render(this.scene, this.camera);

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.06) {
      this.hudEmitTimer = 0;
      this.emitHudSnapshot();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private getActiveWeapon(c: Combatant) {
    const slot = c.slots[c.activeSlotIndex];
    if (!slot) return null;
    return { slot, def: WEAPON_MAP[slot.weaponId] };
  }

  private equipSlot(c: Combatant, slotIndex: number) {
    if (!c.slots[slotIndex]) return;
    c.activeSlotIndex = slotIndex;
    c.isReloading = false;

    const active = this.getActiveWeapon(c);
    if (!active) return;

    // Rebuild 3D held weapon mesh cleanly
    while (c.rig.weaponMount.children.length > 0) {
      const child = c.rig.weaponMount.children[0];
      c.rig.weaponMount.remove(child);
    }
    const newMesh = buildProceduralWeaponMesh(active.def);
    c.rig.weaponMount.add(newMesh);
    c.rig.weaponMount.add(c.rig.muzzleFlash);
  }

  private updatePlayer(dt: number, now: number) {
    const p = this.player;
    if (!p.alive) return;

    // Combine touch joystick + desktop keyboard
    let moveX = this.input.moveX;
    let moveY = this.input.moveY;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveY += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveY -= 1;

    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    // Camera look rotation
    p.yaw -= this.input.lookDeltaX;
    p.pitch = THREE.MathUtils.clamp(p.pitch - this.input.lookDeltaY, -0.78, 0.72);
    this.input.lookDeltaX = 0;
    this.input.lookDeltaY = 0;

    // Switch weapon slots
    if (this.input.switchSlotIndex !== null) {
      this.equipSlot(p, this.input.switchSlotIndex);
      this.input.switchSlotIndex = null;
    }

    // Medkit usage
    if (this.input.medkitRequested) {
      this.input.medkitRequested = false;
      if (this.medkits > 0 && p.health < p.maxHealth) {
        this.medkits--;
        p.health = Math.min(p.maxHealth, p.health + 45);
        soundEngine.playLootPickup();
      }
    }

    const groundY = groundHeightAt(p.pos.x, p.pos.z);

    // Parachute phase
    if (p.inParachutePhase) {
      this.phase = 'parachute';
      const altitude = p.pos.y - groundY;

      if (
        !p.parachuteDeployed &&
        (altitude < 32 || this.input.parachuteActionRequested || this.input.jumpRequested)
      ) {
        p.parachuteDeployed = true;
        p.rig.parachuteGroup.visible = true;
        soundEngine.playParachuteOpen();
      }
      this.input.parachuteActionRequested = false;
      this.input.jumpRequested = false;

      const fallSpeed = p.parachuteDeployed ? -6.5 : -19.5;
      const glideSpeed = p.parachuteDeployed ? 15.5 : 10.5;
      p.vel.y = THREE.MathUtils.damp(p.vel.y, fallSpeed, 6, dt);

      const forwardX = -Math.sin(p.yaw);
      const forwardZ = -Math.cos(p.yaw);
      const rightX = Math.cos(p.yaw);
      const rightZ = -Math.sin(p.yaw);

      const glideDirX = forwardX * (moveY + 0.35) + rightX * moveX;
      const glideDirZ = forwardZ * (moveY + 0.35) + rightZ * moveX;

      p.pos.x += glideDirX * glideSpeed * dt;
      p.pos.z += glideDirZ * glideSpeed * dt;
      p.pos.y += p.vel.y * dt;

      if (p.pos.y <= groundY + 0.05) {
        p.pos.y = groundY;
        p.vel.y = 0;
        p.inParachutePhase = false;
        p.parachuteDeployed = false;
        p.isGrounded = true;
        p.rig.parachuteGroup.visible = false;
        this.phase = 'combat';
      }
    } else {
      this.phase = 'combat';
      p.isCrouching = this.input.crouching;
      p.isAiming = this.input.aiming || this.mouseAiming;

      const wantSprint =
        (this.input.sprinting || this.keysDown.has('ShiftLeft') || mag > 0.85) &&
        !p.isCrouching &&
        !p.isAiming &&
        moveY > 0.2 &&
        this.stamina > 4;

      p.isSprinting = wantSprint;
      if (wantSprint) {
        this.stamina = Math.max(0, this.stamina - 18 * dt);
      } else {
        this.stamina = Math.min(100, this.stamina + 14 * dt);
      }

      const charDef = CHARACTER_MAP[p.characterId] || CHARACTERS[0];
      const baseSpeed = p.isCrouching ? 3.8 : p.isAiming ? 4.4 : p.isSprinting ? 9.6 : 6.8;
      const moveSpeed = baseSpeed * charDef.speedBonus;

      const forwardX = -Math.sin(p.yaw);
      const forwardZ = -Math.cos(p.yaw);
      const rightX = Math.cos(p.yaw);
      const rightZ = -Math.sin(p.yaw);

      const moveVecX = (forwardX * moveY + rightX * moveX) * moveSpeed;
      const moveVecZ = (forwardZ * moveY + rightZ * moveX) * moveSpeed;

      this.moveWithCollision(p, moveVecX * dt, moveVecZ * dt);

      // Jump & Gravity
      if (this.input.jumpRequested && p.isGrounded) {
        p.vel.y = 7.4;
        p.isGrounded = false;
        p.isCrouching = false;
        this.input.crouching = false;
      }
      this.input.jumpRequested = false;

      p.vel.y -= 19.5 * dt;
      p.pos.y += p.vel.y * dt;

      const newGroundY = groundHeightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= newGroundY) {
        p.pos.y = newGroundY;
        p.vel.y = 0;
        p.isGrounded = true;
      }

      // Footsteps audio & stride animation
      const horizSpeed = Math.hypot(moveVecX, moveVecZ);
      if (horizSpeed > 0.5 && p.isGrounded) {
        p.walkPhase += dt * (p.isSprinting ? 14 : 9.5);
        p.footstepTimer -= dt;
        if (p.footstepTimer <= 0) {
          p.footstepTimer = p.isSprinting ? 0.3 : 0.44;
          soundEngine.playFootstep(p.isSprinting);
        }
      }

      // Reload & Fire
      this.handleWeaponMechanics(p, dt, now, this.input.firing || this.mouseFiring);

      // Loot pickup
      this.checkLootPickup(p);
    }

    // Apply transform & skeletal animation
    p.rig.root.position.copy(p.pos);
    p.rig.root.rotation.y = p.yaw + Math.PI;
    p.recoilAlpha = Math.max(0, p.recoilAlpha - dt * 6);
    if (p.muzzleFlashTimer > 0) {
      p.muzzleFlashTimer -= dt;
      p.rig.muzzleFlash.visible = p.muzzleFlashTimer > 0;
    }

    updateCharacterAnimation(p.rig, dt, {
      speed: mag * 7,
      isSprinting: p.isSprinting,
      isCrouching: p.isCrouching,
      isJumping: !p.isGrounded && !p.inParachutePhase,
      isParachuting: p.inParachutePhase && p.parachuteDeployed,
      isAiming: p.isAiming,
      isDead: !p.alive,
      walkPhase: p.walkPhase,
      recoilAlpha: p.recoilAlpha,
      pitch: p.pitch,
    });

    // Sync network multiplayer state if connected
    this.networkEmitTimer += dt;
    if (this.onSendNetworkState && this.networkEmitTimer >= 0.08) {
      this.networkEmitTimer = 0;
      this.onSendNetworkState({
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        yaw: p.yaw,
        health: p.health,
        armor: p.armor,
        alive: p.alive,
      });
    }
  }

  private moveWithCollision(c: Combatant, dx: number, dz: number) {
    const r = 0.45;
    let nextX = THREE.MathUtils.clamp(c.pos.x + dx, -ISLAND_RADIUS + 8, ISLAND_RADIUS - 8);
    let nextZ = THREE.MathUtils.clamp(c.pos.z + dz, -ISLAND_RADIUS + 8, ISLAND_RADIUS - 8);

    for (const col of this.colliders) {
      if (c.pos.y > col.maxY - 0.3) continue;
      if (
        nextX > col.minX - r &&
        nextX < col.maxX + r &&
        c.pos.z > col.minZ - r &&
        c.pos.z < col.maxZ + r
      ) {
        nextX = c.pos.x;
      }
      if (
        nextX > col.minX - r &&
        nextX < col.maxX + r &&
        nextZ > col.minZ - r &&
        nextZ < col.maxZ + r
      ) {
        nextZ = c.pos.z;
      }
    }

    c.pos.x = nextX;
    c.pos.z = nextZ;
  }

  private handleWeaponMechanics(
    c: Combatant,
    dt: number,
    now: number,
    wantsFire: boolean,
  ) {
    const active = this.getActiveWeapon(c);
    if (!active) return;

    const { slot, def } = active;

    // Manual reload request or empty mag auto-reload
    if (
      !c.isReloading &&
      slot.ammoReserve > 0 &&
      ((c.isPlayer && this.input.reloadRequested && slot.ammoInMag < def.magazineSize) ||
        (slot.ammoInMag === 0 && wantsFire))
    ) {
      c.isReloading = true;
      c.reloadStartTime = now;
      if (c.isPlayer) {
        soundEngine.playReload();
      }
    }
    if (c.isPlayer) this.input.reloadRequested = false;

    if (c.isReloading) {
      if (now - c.reloadStartTime >= def.reloadTimeMs) {
        const needed = def.magazineSize - slot.ammoInMag;
        const load = Math.min(needed, slot.ammoReserve);
        slot.ammoInMag += load;
        slot.ammoReserve -= load;
        c.isReloading = false;
      }
      return;
    }

    if (wantsFire && slot.ammoInMag > 0 && now - c.lastFireTime >= def.fireRateMs) {
      c.lastFireTime = now;
      slot.ammoInMag--;
      c.recoilAlpha = 1;
      c.muzzleFlashTimer = 0.055;
      c.rig.muzzleFlash.visible = true;

      if (c.isPlayer) {
        soundEngine.playGunshot(def.weaponClass, 1);
        c.pitch = THREE.MathUtils.clamp(c.pitch + def.recoilKick * 0.45, -0.78, 0.72);
      } else {
        const distToPlayer = c.pos.distanceTo(this.player.pos);
        const atten = Math.max(0, 1 - distToPlayer / 115);
        soundEngine.playGunshot(def.weaponClass, atten * 0.75);
      }

      this.fireProjectileRay(c, def);
    }
  }

  private fireProjectileRay(shooter: Combatant, weaponDef: (typeof WEAPONS)[number]) {
    const spread = shooter.isAiming ? weaponDef.spreadAds : weaponDef.spreadHip;

    // Determine base aim ray
    if (shooter.isPlayer) {
      _rayOrigin.copy(this.camera.position);
      this.camera.getWorldDirection(_dir);
      // Offset ray start past player back so we don't hit ourselves
      _rayOrigin.addScaledVector(_dir, 2.2);
    } else {
      _rayOrigin.set(shooter.pos.x, shooter.pos.y + 1.45, shooter.pos.z);
      _dir
        .set(-Math.sin(shooter.yaw), Math.sin(shooter.pitch) * 0.4, -Math.cos(shooter.yaw))
        .normalize();
    }

    // Collect enemy hit meshes
    const targets: THREE.Object3D[] = [];
    const meshOwnerMap = new Map<THREE.Object3D, { combatant: Combatant; headshot: boolean }>();
    for (const other of this.combatants) {
      if (!other.alive || other.id === shooter.id || other.inParachutePhase) continue;
      targets.push(other.rig.hitTargetHead, other.rig.hitTargetBody);
      meshOwnerMap.set(other.rig.hitTargetHead, { combatant: other, headshot: true });
      meshOwnerMap.set(other.rig.hitTargetBody, { combatant: other, headshot: false });
    }

    for (let p = 0; p < weaponDef.pellets; p++) {
      const spreadX = (Math.random() - 0.5) * 2 * spread * (shooter.isPlayer ? 1 : 2.1);
      const spreadY = (Math.random() - 0.5) * 2 * spread * (shooter.isPlayer ? 1 : 2.1);

      _v1.copy(_dir);
      _v1.x += spreadX;
      _v1.y += spreadY;
      _v1.z += (Math.random() - 0.5) * spread;
      _v1.normalize();

      _raycaster.set(_rayOrigin, _v1);
      _raycaster.near = 0.2;
      _raycaster.far = weaponDef.range;

      // Check obstacle occlusion distance (simple AABB ray step)
      const wallDist = this.raycastObstacles(_rayOrigin, _v1, weaponDef.range);

      const hits = _raycaster.intersectObjects(targets, false);
      let endPoint = _v2.copy(_rayOrigin).addScaledVector(_v1, wallDist);

      if (hits.length > 0 && hits[0].distance < wallDist) {
        const hit = hits[0];
        endPoint = hit.point;
        const info = meshOwnerMap.get(hit.object);
        if (info) {
          const dmg = Math.round(
            weaponDef.damage * (info.headshot ? weaponDef.headshotMultiplier : 1),
          );
          this.applyDamage(info.combatant, dmg, shooter, weaponDef.name, info.headshot);
        }
      }

      // Spawn visible muzzle-to-impact tracer
      const muzzleWorld = _v3.set(
        shooter.pos.x - Math.sin(shooter.yaw) * 0.55,
        shooter.pos.y + 1.38,
        shooter.pos.z - Math.cos(shooter.yaw) * 0.55,
      );
      this.spawnTracer(muzzleWorld, endPoint, weaponDef.muzzleColor);
    }
  }

  private raycastObstacles(origin: THREE.Vector3, dir: THREE.Vector3, maxRange: number): number {
    const step = 1.6;
    for (let d = 1.5; d < maxRange; d += step) {
      const px = origin.x + dir.x * d;
      const py = origin.y + dir.y * d;
      const pz = origin.z + dir.z * d;
      if (py < groundHeightAt(px, pz)) return d;
      for (const col of this.colliders) {
        if (
          px >= col.minX &&
          px <= col.maxX &&
          pz >= col.minZ &&
          pz <= col.maxZ &&
          py <= col.maxY
        ) {
          return d;
        }
      }
    }
    return maxRange;
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: string) {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.75,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08, maxLife: 0.08 });
  }

  private applyDamage(
    victim: Combatant,
    rawDamage: number,
    attacker: Combatant | null,
    sourceName: string,
    isHeadshot: boolean,
  ) {
    if (!victim.alive) return;

    let remaining = rawDamage;
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, Math.ceil(rawDamage * 0.55));
      victim.armor -= absorbed;
      remaining -= absorbed;
    }
    victim.health = Math.max(0, victim.health - remaining);

    if (attacker?.isPlayer) {
      this.damageDealt += rawDamage;
      this.hitMarkerTimer = 0.22;
      this.hitMarkerHeadshot = isHeadshot;
      soundEngine.playHitMarker(isHeadshot);
    }

    if (victim.isPlayer) {
      this.damageFlashTimer = 0.28;
      soundEngine.playDamageTaken();
    }

    if (victim.health <= 0) {
      victim.alive = false;
      victim.rig.muzzleFlash.visible = false;
      const aliveRemaining = this.combatants.filter((c) => c.alive).length;

      if (attacker?.isPlayer) {
        this.kills++;
      }

      if (victim.isPlayer) {
        this.placement = aliveRemaining + 1;
        this.eliminatedBy = attacker ? attacker.name : sourceName;
      }

      this.killFeed.unshift({
        id: `kf_${Date.now()}_${Math.random()}`,
        killer: attacker ? attacker.name : sourceName,
        victim: victim.name,
        weaponName: sourceName,
        isHeadshot,
        isPlayerInvolved: Boolean(attacker?.isPlayer || victim.isPlayer),
        timestamp: Date.now(),
      });
      if (this.killFeed.length > 5) this.killFeed.pop();
    }
  }

  private checkLootPickup(p: Combatant) {
    let closest: LootEntity | null = null;
    let closestDist = 3.0;

    for (const item of this.lootEntities) {
      if (item.collected) continue;
      const d = item.pos.distanceTo(p.pos);
      if (d < closestDist) {
        closestDist = d;
        closest = item;
      }
    }

    if (!closest) return;

    const shouldCollect =
      this.input.interactRequested ||
      (this.settings.autoPickup &&
        (closest.category !== 'weapon' || !p.slots[0] || !p.slots[1]));

    if (!shouldCollect) return;
    this.input.interactRequested = false;

    if (closest.category === 'weapon' && closest.weaponId) {
      const def = WEAPON_MAP[closest.weaponId];
      const newSlot: WeaponSlotState = {
        weaponId: def.id,
        ammoInMag: def.magazineSize,
        ammoReserve: Math.round(def.reserveMax * 0.65),
      };
      if (!p.slots[0]) {
        p.slots[0] = newSlot;
        this.equipSlot(p, 0);
      } else if (!p.slots[1]) {
        p.slots[1] = newSlot;
        this.equipSlot(p, 1);
      } else {
        const targetIdx = p.activeSlotIndex === 2 ? 0 : p.activeSlotIndex;
        p.slots[targetIdx] = newSlot;
        this.equipSlot(p, targetIdx);
      }
    } else if (closest.category === 'armor') {
      if (p.armor >= p.maxArmor) return;
      p.armor = Math.min(p.maxArmor, p.armor + 50);
    } else if (closest.category === 'medkit') {
      this.medkits = Math.min(5, this.medkits + 1);
    } else if (closest.category === 'ammo') {
      for (const s of p.slots) {
        if (s) {
          const def = WEAPON_MAP[s.weaponId];
          s.ammoReserve = Math.min(def.reserveMax, s.ammoReserve + 45);
        }
      }
    }

    closest.collected = true;
    closest.mesh.visible = false;
    soundEngine.playLootPickup();
  }

  private updateBots(dt: number, now: number) {
    for (const bot of this.combatants) {
      if (bot.isPlayer || bot.isRemoteHuman) continue;

      if (!bot.alive) {
        updateCharacterAnimation(bot.rig, dt, {
          speed: 0,
          isSprinting: false,
          isCrouching: false,
          isJumping: false,
          isParachuting: false,
          isAiming: false,
          isDead: true,
          walkPhase: 0,
          recoilAlpha: 0,
          pitch: 0,
        });
        continue;
      }

      const groundY = groundHeightAt(bot.pos.x, bot.pos.z);

      if (bot.inParachutePhase) {
        if (bot.pos.y - groundY < 38 && !bot.parachuteDeployed) {
          bot.parachuteDeployed = true;
          bot.rig.parachuteGroup.visible = true;
        }
        bot.pos.y -= (bot.parachuteDeployed ? 7.5 : 16) * dt;
        if (bot.pos.y <= groundY + 0.05) {
          bot.pos.y = groundY;
          bot.inParachutePhase = false;
          bot.parachuteDeployed = false;
          bot.rig.parachuteGroup.visible = false;
        }
        bot.rig.root.position.copy(bot.pos);
        updateCharacterAnimation(bot.rig, dt, {
          speed: 0,
          isSprinting: false,
          isCrouching: false,
          isJumping: false,
          isParachuting: bot.parachuteDeployed,
          isAiming: false,
          isDead: false,
          walkPhase: 0,
          recoilAlpha: 0,
          pitch: 0,
        });
        continue;
      }

      // AI Decision tick
      bot.aiThinkTimer -= dt;
      let nearestEnemy: Combatant | null = null;
      let nearestDist = 72;

      for (const other of this.combatants) {
        if (!other.alive || other.id === bot.id || other.inParachutePhase) continue;
        const d = bot.pos.distanceTo(other.pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = other;
        }
      }

      const distToZone = Math.hypot(
        bot.pos.x - this.zoneCenter.x,
        bot.pos.z - this.zoneCenter.y,
      );

      if (bot.aiThinkTimer <= 0) {
        bot.aiThinkTimer = 0.6 + Math.random() * 0.7;
        bot.aiStrafeDir = Math.random() > 0.5 ? 1 : -1;

        if (distToZone > this.zoneRadius * 0.85) {
          // Move urgently into Safe Zone
          bot.aiMoveTarget.set(
            this.zoneCenter.x + (Math.random() - 0.5) * 20,
            0,
            this.zoneCenter.y + (Math.random() - 0.5) * 20,
          );
        } else if (!nearestEnemy) {
          const ang = Math.random() * Math.PI * 2;
          const r = 14 + Math.random() * 24;
          bot.aiMoveTarget.set(
            THREE.MathUtils.clamp(bot.pos.x + Math.cos(ang) * r, -135, 135),
            0,
            THREE.MathUtils.clamp(bot.pos.z + Math.sin(ang) * r, -135, 135),
          );
        }
      }

      let moveSpeed = 5.4;
      let wantsFire = false;

      if (nearestEnemy && distToZone <= this.zoneRadius * 1.05) {
        const dx = nearestEnemy.pos.x - bot.pos.x;
        const dz = nearestEnemy.pos.z - bot.pos.z;
        const targetYaw = Math.atan2(-dx, -dz);
        bot.yaw = targetYaw;
        bot.isAiming = true;

        // Check line of sight
        _rayOrigin.set(bot.pos.x, bot.pos.y + 1.4, bot.pos.z);
        _dir.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw)).normalize();
        const wallD = this.raycastObstacles(_rayOrigin, _dir, nearestDist);

        if (wallD >= nearestDist - 1.2) {
          wantsFire = Math.random() < bot.aiAccuracy;
        }

        // Strafe or close gap
        const strafeX = Math.cos(bot.yaw) * bot.aiStrafeDir;
        const strafeZ = -Math.sin(bot.yaw) * bot.aiStrafeDir;
        const approach = nearestDist > 26 ? 0.65 : nearestDist < 12 ? -0.45 : 0;
        const vx = (strafeX * 0.7 + _dir.x * approach) * 4.4;
        const vz = (strafeZ * 0.7 + _dir.z * approach) * 4.4;
        this.moveWithCollision(bot, vx * dt, vz * dt);
        bot.walkPhase += dt * 9;
      } else {
        bot.isAiming = false;
        const dx = bot.aiMoveTarget.x - bot.pos.x;
        const dz = bot.aiMoveTarget.z - bot.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.5) {
          bot.yaw = Math.atan2(-dx, -dz);
          moveSpeed = distToZone > this.zoneRadius * 0.85 ? 7.6 : 5.4;
          this.moveWithCollision(bot, (dx / d) * moveSpeed * dt, (dz / d) * moveSpeed * dt);
          bot.walkPhase += dt * 10;
        } else {
          moveSpeed = 0;
        }
      }

      bot.pos.y = groundHeightAt(bot.pos.x, bot.pos.z);
      this.handleWeaponMechanics(bot, dt, now, wantsFire);

      bot.rig.root.position.copy(bot.pos);
      bot.rig.root.rotation.y = bot.yaw + Math.PI;
      bot.recoilAlpha = Math.max(0, bot.recoilAlpha - dt * 6);
      if (bot.muzzleFlashTimer > 0) {
        bot.muzzleFlashTimer -= dt;
        bot.rig.muzzleFlash.visible = bot.muzzleFlashTimer > 0;
      }

      updateCharacterAnimation(bot.rig, dt, {
        speed: moveSpeed,
        isSprinting: moveSpeed > 6.5,
        isCrouching: false,
        isJumping: false,
        isParachuting: false,
        isAiming: bot.isAiming,
        isDead: false,
        walkPhase: bot.walkPhase,
        recoilAlpha: bot.recoilAlpha,
        pitch: 0,
      });
    }
  }

  private updateSafeZone(dt: number) {
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0 && this.zonePhase < 5) {
      this.zonePhase++;
      this.zoneTimer = 34;
      this.nextZoneRadius = Math.max(18, this.zoneRadius * 0.56);
      this.nextZoneCenter.set(
        THREE.MathUtils.clamp(this.zoneCenter.x + (Math.random() - 0.5) * 26, -65, 65),
        THREE.MathUtils.clamp(this.zoneCenter.y + (Math.random() - 0.5) * 26, -65, 65),
      );
    }

    // Gradually shrink toward nextZone
    if (this.zoneRadius > this.nextZoneRadius) {
      const shrinkSpeed = this.zonePhase >= 3 ? 3.2 : 2.1;
      this.zoneRadius = Math.max(this.nextZoneRadius, this.zoneRadius - shrinkSpeed * dt);
      this.zoneCenter.lerp(this.nextZoneCenter, dt * 0.04);
      this.zoneMesh.position.set(this.zoneCenter.x, 28, this.zoneCenter.y);
      this.zoneMesh.scale.set(this.zoneRadius, 1, this.zoneRadius);
    }

    // Apply periodic damage outside Safe Zone
    this.zoneDamageTick += dt;
    if (this.zoneDamageTick >= 1.0) {
      this.zoneDamageTick = 0;
      const dmg = 4 + this.zonePhase * 3;
      for (const c of this.combatants) {
        if (!c.alive || c.inParachutePhase) continue;
        const d = Math.hypot(c.pos.x - this.zoneCenter.x, c.pos.z - this.zoneCenter.y);
        if (d > this.zoneRadius) {
          this.applyDamage(c, dmg, null, 'Storm Zone', false);
        }
      }
    }
  }

  private updateLootAndTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (t.line.material as THREE.LineBasicMaterial).opacity = (t.life / t.maxLife) * 0.8;
      }
    }

    // Gentle rotation of uncollected loot crates
    for (const item of this.lootEntities) {
      if (!item.collected) {
        item.mesh.rotation.y += dt * 0.9;
      }
    }

    if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.damageFlashTimer > 0) this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
  }

  private checkMatchStatus() {
    const alive = this.combatants.filter((c) => c.alive);
    if (!this.player.alive) {
      this.phase = 'eliminated';
      this.finishMatch(false);
    } else if (alive.length <= 1) {
      this.placement = 1;
      this.phase = 'victory';
      this.finishMatch(true);
    }
  }

  private finishMatch(victory: boolean) {
    if (this.matchEnded) return;
    this.matchEnded = true;

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    if (victory) soundEngine.playVictory();
    else soundEngine.playDefeat();

    const active = this.getActiveWeapon(this.player);
    this.emitHudSnapshot();

    this.onMatchEnd({
      victory,
      placement: victory ? 1 : this.placement,
      totalPlayers: this.combatants.length,
      kills: this.kills,
      damage: this.damageDealt,
      survivalSeconds: Math.round(this.survivalSeconds),
      weaponUsed: active ? active.def.name : 'VX-47 Striker',
      characterUsed: CHARACTER_MAP[this.playerCharacterId]?.codename || 'VANGUARD',
    });
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const active = this.getActiveWeapon(p);
    const targetFov = p.isAiming && active ? active.def.adsFov : p.isSprinting ? 70 : 64;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();

    const shoulderDist = p.inParachutePhase ? 6.8 : p.isAiming ? 2.15 : 4.2;
    const shoulderOffset = p.inParachutePhase ? 0 : p.isAiming ? 0.72 : 0.55;
    const eyeHeight = p.isCrouching ? 1.15 : 1.58;

    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    const cosP = Math.cos(p.pitch);
    const sinP = Math.sin(p.pitch);

    _camDesired.set(
      p.pos.x + sinY * shoulderDist * cosP + cosY * shoulderOffset,
      p.pos.y + eyeHeight - sinP * shoulderDist + (p.inParachutePhase ? 1.8 : 0.35),
      p.pos.z + cosY * shoulderDist * cosP - sinY * shoulderOffset,
    );

    const minCamY = groundHeightAt(_camDesired.x, _camDesired.z) + 0.5;
    if (_camDesired.y < minCamY) _camDesired.y = minCamY;

    this.camera.position.lerp(_camDesired, 1 - Math.exp(-16 * dt));

    _camTarget.set(
      p.pos.x - sinY * 14 * cosP + cosY * shoulderOffset * 0.4,
      p.pos.y + eyeHeight + sinP * 14,
      p.pos.z - cosY * 14 * cosP - sinY * shoulderOffset * 0.4,
    );
    this.camera.lookAt(_camTarget);

    // Keep shadow camera centered around player for sharp shadows across whole island
    this.sunLight.position.set(p.pos.x + 55, 95, p.pos.z + 40);
    this.sunLight.target.position.copy(p.pos);
    this.sunLight.target.updateMatrixWorld();
  }

  private updateEnvironmentVisuals(now: number) {
    if (this.oceanMesh) {
      this.oceanMesh.position.y = -0.35 + Math.sin(now * 0.0014) * 0.14;
    }
  }

  private emitHudSnapshot() {
    const p = this.player;
    const active = this.getActiveWeapon(p);
    const groundY = groundHeightAt(p.pos.x, p.pos.z);

    let nearbyLootLabel: string | null = null;
    let nearbyLootType: HudSnapshot['nearbyLootType'] = null;
    let bestD = 3.2;
    for (const item of this.lootEntities) {
      if (item.collected) continue;
      const d = item.pos.distanceTo(p.pos);
      if (d < bestD) {
        bestD = d;
        nearbyLootLabel = item.label;
        nearbyLootType = item.category;
      }
    }

    const minimapActors: MinimapActor[] = this.combatants
      .filter((c) => c.alive)
      .map((c) => ({
        id: c.id,
        x: c.pos.x,
        z: c.pos.z,
        isPlayer: c.isPlayer,
        isFiring: c.muzzleFlashTimer > 0,
      }));

    const reloadProgress =
      p.isReloading && active
        ? Math.min(1, (performance.now() - p.reloadStartTime) / active.def.reloadTimeMs)
        : 0;

    const distToZone = Math.hypot(p.pos.x - this.zoneCenter.x, p.pos.z - this.zoneCenter.y);

    this.onHudUpdate({
      phase: this.phase,
      aliveCount: minimapActors.length,
      totalCount: this.combatants.length,
      kills: this.kills,
      damageDealt: this.damageDealt,
      health: Math.ceil(p.health),
      maxHealth: p.maxHealth,
      armor: Math.ceil(p.armor),
      maxArmor: p.maxArmor,
      medkits: this.medkits,
      stamina: Math.round(this.stamina),
      isCrouching: p.isCrouching,
      isSprinting: p.isSprinting,
      isAiming: p.isAiming,
      isReloading: p.isReloading,
      reloadProgress,
      parachuteAltitude: Math.max(0, Math.round(p.pos.y - groundY)),
      parachuteDeployed: p.parachuteDeployed,
      canDeployParachute: p.inParachutePhase && !p.parachuteDeployed,
      zonePhase: this.zonePhase,
      zoneTimerSeconds: Math.max(0, Math.ceil(this.zoneTimer)),
      zoneRadius: this.zoneRadius,
      nextZoneRadius: this.nextZoneRadius,
      zoneCenter: { x: this.zoneCenter.x, z: this.zoneCenter.y },
      nextZoneCenter: { x: this.nextZoneCenter.x, z: this.nextZoneCenter.y },
      isOutsideZone: distToZone > this.zoneRadius,
      activeSlotIndex: p.activeSlotIndex,
      slots: [
        p.slots[0] ? { ...p.slots[0] } : null,
        p.slots[1] ? { ...p.slots[1] } : null,
        p.slots[2] ? { ...p.slots[2] } : null,
      ],
      nearbyLootLabel,
      nearbyLootType,
      playerPos: { x: p.pos.x, z: p.pos.z, yaw: p.yaw },
      minimapActors,
      killFeed: [...this.killFeed],
      hitMarkerTimer: this.hitMarkerTimer,
      hitMarkerHeadshot: this.hitMarkerHeadshot,
      damageFlashTimer: this.damageFlashTimer,
      survivalSeconds: Math.round(this.survivalSeconds),
      placement: this.placement,
      fps: this.currentFps,
      eliminatedBy: this.eliminatedBy,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
      this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    }

    if (document.pointerLockElement === this.renderer?.domElement) {
      document.exitPointerLock?.();
    }

    for (const d of this.disposables) d.dispose();
    this.renderer?.dispose();
  }
}

export function buildMatchRecord(
  summary: MatchEndSummary,
  mode: GameMode,
): MatchRecord {
  return {
    id: `m_${Date.now()}`,
    timestamp: Date.now(),
    mode,
    placement: summary.placement,
    totalPlayers: summary.totalPlayers,
    kills: summary.kills,
    damage: summary.damage,
    survivalSeconds: summary.survivalSeconds,
    weaponUsed: summary.weaponUsed,
    characterUsed: summary.characterUsed,
    victory: summary.victory,
  };
}
