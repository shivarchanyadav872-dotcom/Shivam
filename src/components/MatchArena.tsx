import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';
import {
  BattleRoyaleEngine,
  MatchEndSummary,
} from '../engine/BattleRoyaleEngine';
import { multiplayerClient } from '../services/multiplayerClient';
import {
  GameMode,
  GameSettings,
  HudSnapshot,
  MultiplayerRoom,
  PlayerProfile,
} from '../types/game';
import { GameHUD } from './GameHUD';

interface MatchArenaProps {
  matchKey: number;
  mode: GameMode;
  profile: PlayerProfile;
  settings: GameSettings;
  room: MultiplayerRoom | null;
  onMatchComplete: (summary: MatchEndSummary) => void;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'parachute',
  aliveCount: 20,
  totalCount: 20,
  kills: 0,
  damageDealt: 0,
  health: 100,
  maxHealth: 100,
  armor: 0,
  maxArmor: 100,
  medkits: 2,
  stamina: 100,
  isCrouching: false,
  isSprinting: false,
  isAiming: false,
  isReloading: false,
  reloadProgress: 0,
  parachuteAltitude: 105,
  parachuteDeployed: false,
  canDeployParachute: true,
  zonePhase: 1,
  zoneTimerSeconds: 42,
  zoneRadius: 175,
  nextZoneRadius: 115,
  zoneCenter: { x: 0, z: 0 },
  nextZoneCenter: { x: 12, z: -10 },
  isOutsideZone: false,
  activeSlotIndex: 2,
  slots: [null, null, { weaponId: 'viper45', ammoInMag: 15, ammoReserve: 60 }],
  nearbyLootLabel: null,
  nearbyLootType: null,
  playerPos: { x: 0, z: 0, yaw: 0 },
  minimapActors: [],
  killFeed: [],
  hitMarkerTimer: 0,
  hitMarkerHeadshot: false,
  damageFlashTimer: 0,
  survivalSeconds: 0,
  placement: 20,
  fps: 60,
  eliminatedBy: null,
};

export function MatchArena({
  matchKey,
  mode,
  profile,
  settings,
  room,
  onMatchComplete,
  onPlayAgain,
  onReturnLobby,
}: MatchArenaProps) {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BattleRoyaleEngine | null>(null);
  const engineInputRef = useRef({
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
    switchSlotIndex: null as number | null,
  });
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchResult, setMatchResult] = useState<MatchEndSummary | null>(null);
  const [paused, setPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const onMatchCompleteRef = useRef(onMatchComplete);
  onMatchCompleteRef.current = onMatchComplete;

  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el) return;

    setMatchResult(null);
    setPaused(false);
    soundEngine.unlock();
    soundEngine.startMusic('combat');

    const remotePlayers = room
      ? room.players.filter((p) => p.playerId !== profile.playerId)
      : [];

    const engine = new BattleRoyaleEngine({
      container: el,
      settings,
      mode,
      playerUsername: profile.username,
      playerCharacterId: profile.selectedCharacterId,
      remotePlayers,
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onMatchEnd: (summary) => {
        setMatchResult(summary);
        onMatchCompleteRef.current(summary);
      },
      onSendNetworkState:
        mode === 'multiplayer_room'
          ? (payload) => multiplayerClient.sendGameState(payload)
          : undefined,
    });

    engineInputRef.current = {
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
    engine.input = engineInputRef.current;
    engineRef.current = engine;

    if (mode === 'multiplayer_room') {
      multiplayerClient.setHandlers({
        onRemoteState: (payload) => {
          engine.applyRemotePlayerUpdate(payload);
        },
      });
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [matchKey]);

  useEffect(() => {
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  const handleTogglePause = () => {
    setPaused((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.updateSettings(
        next ? 0 : settings.sfxVolume,
        next ? 0 : settings.musicVolume,
        next ? false : settings.musicEnabled,
      );
      return next;
    });
  };

  return (
    <div className="relative w-full h-full bg-[#0b0f17] overflow-hidden">
      {/* Isolated WebGL Container */}
      <div ref={canvasMountRef} className="w-full h-full touch-none-canvas" />

      {/* Mobile & Desktop HUD Overlay */}
      <GameHUD
        hud={hud}
        inputRef={engineInputRef}
        settings={settings}
        matchResult={matchResult}
        paused={paused}
        onTogglePause={handleTogglePause}
        onToggleMute={handleToggleMute}
        isMuted={isMuted}
        onPlayAgain={onPlayAgain}
        onReturnLobby={onReturnLobby}
      />
    </div>
  );
}
