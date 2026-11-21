export type WeaponClass = 'assault' | 'smg' | 'shotgun' | 'sniper' | 'pistol';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type GameMode = 'solo_bots' | 'multiplayer_room';

export type MatchPhase =
  | 'lobby'
  | 'aircraft'
  | 'parachute'
  | 'combat'
  | 'victory'
  | 'eliminated';

export interface CharacterDef {
  id: string;
  name: string;
  codename: string;
  role: string;
  perkTitle: string;
  perkDescription: string;
  avatarUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  helmetColor: string;
  speedBonus: number;
  armorBonus: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  weaponClass: WeaponClass;
  classLabel: string;
  damage: number;
  headshotMultiplier: number;
  fireRateMs: number;
  magazineSize: number;
  reserveMax: number;
  reloadTimeMs: number;
  range: number;
  spreadHip: number;
  spreadAds: number;
  pellets: number;
  adsFov: number;
  recoilKick: number;
  autoFire: boolean;
  muzzleColor: string;
  bodyColor: string;
  accentColor: string;
  description: string;
}

export interface WeaponSlotState {
  weaponId: string;
  ammoInMag: number;
  ammoReserve: number;
}

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  touchSensitivity: number;
  aimSensitivity: number;
  sfxVolume: number;
  musicVolume: number;
  musicEnabled: boolean;
  autoPickup: boolean;
  showFps: boolean;
  leftHandedHud: boolean;
}

export interface PlayerProfile {
  playerId: string;
  username: string;
  level: number;
  xp: number;
  rankTier: string;
  selectedCharacterId: string;
  favoriteWeaponId: string;
  totalMatches: number;
  totalWins: number;
  totalKills: number;
  totalDamage: number;
  bestPlacement: number;
}

export interface MatchRecord {
  id: string;
  timestamp: number;
  mode: GameMode;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivalSeconds: number;
  weaponUsed: string;
  characterUsed: string;
  victory: boolean;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  rankTier: string;
  wins: number;
  kills: number;
  matches: number;
  rating: number;
}

export interface RoomPlayer {
  playerId: string;
  username: string;
  characterId: string;
  ready: boolean;
  isHost: boolean;
}

export interface MultiplayerRoom {
  roomId: string;
  roomCode: string;
  name: string;
  hostId: string;
  status: 'waiting' | 'in_match';
  maxPlayers: number;
  players: RoomPlayer[];
  createdAt: number;
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  victim: string;
  weaponName: string;
  isHeadshot: boolean;
  isPlayerInvolved: boolean;
  timestamp: number;
}

export interface MinimapActor {
  id: string;
  x: number;
  z: number;
  isPlayer: boolean;
  isFiring?: boolean;
}

export interface HudSnapshot {
  phase: MatchPhase;
  aliveCount: number;
  totalCount: number;
  kills: number;
  damageDealt: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  medkits: number;
  stamina: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  isReloading: boolean;
  reloadProgress: number;
  parachuteAltitude: number;
  parachuteDeployed: boolean;
  canDeployParachute: boolean;
  zonePhase: number;
  zoneTimerSeconds: number;
  zoneRadius: number;
  nextZoneRadius: number;
  zoneCenter: { x: number; z: number };
  nextZoneCenter: { x: number; z: number };
  isOutsideZone: boolean;
  activeSlotIndex: number;
  slots: [WeaponSlotState | null, WeaponSlotState | null, WeaponSlotState | null];
  nearbyLootLabel: string | null;
  nearbyLootType: 'weapon' | 'armor' | 'medkit' | 'ammo' | null;
  playerPos: { x: number; z: number; yaw: number };
  minimapActors: MinimapActor[];
  killFeed: KillFeedEntry[];
  hitMarkerTimer: number;
  hitMarkerHeadshot: boolean;
  damageFlashTimer: number;
  survivalSeconds: number;
  placement: number;
  fps: number;
  eliminatedBy: string | null;
}

export interface MobileInputState {
  moveX: number;
  moveY: number;
  sprinting: boolean;
  firing: boolean;
  aiming: boolean;
  crouching: boolean;
  jumpRequested: boolean;
  reloadRequested: boolean;
  interactRequested: boolean;
  parachuteActionRequested: boolean;
  medkitRequested: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
  switchSlotIndex: number | null;
}
