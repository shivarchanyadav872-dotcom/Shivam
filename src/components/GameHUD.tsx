import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Heart,
  Pause,
  RotateCw,
  Shield,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { ISLAND_MAP_IMAGE, WEAPON_MAP } from '../data/catalog';
import { ISLAND_RADIUS } from '../engine/IslandWorld';
import { GameSettings, HudSnapshot, MobileInputState } from '../types/game';
import { MatchEndSummary } from '../engine/BattleRoyaleEngine';

interface GameHUDProps {
  hud: HudSnapshot;
  inputRef: React.MutableRefObject<MobileInputState>;
  settings: GameSettings;
  matchResult: MatchEndSummary | null;
  paused: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
}

export function GameHUD({
  hud,
  inputRef,
  settings,
  matchResult,
  paused,
  onTogglePause,
  onToggleMute,
  isMuted,
  onPlayAgain,
  onReturnLobby,
}: GameHUDProps) {
  // Virtual Joystick state
  const [joyActive, setJoyActive] = useState(false);
  const [joyOffset, setJoyOffset] = useState({ x: 0, y: 0 });
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });

  // Touch camera look state
  const lookPointerId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  const handleJoystickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    joyPointerId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    joyOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setJoyActive(true);
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoystickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setJoyActive(false);
    setJoyOffset({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
    inputRef.current.sprinting = false;
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const maxR = 46;
    let dx = clientX - joyOrigin.current.x;
    let dy = clientY - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyOffset({ x: dx, y: dy });
    inputRef.current.moveX = dx / maxR;
    inputRef.current.moveY = -dy / maxR;
    inputRef.current.sprinting = dist > maxR * 0.85;
  };

  // Touchscreen Camera Look Zone
  const handleLookDown = (e: React.PointerEvent<HTMLElement>) => {
    lookPointerId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    const sens = hud.isAiming ? settings.aimSensitivity : settings.touchSensitivity;
    inputRef.current.lookDeltaX += dx * 0.0055 * sens;
    inputRef.current.lookDeltaY += dy * 0.0045 * sens;
  };

  const handleLookUp = (e: React.PointerEvent<HTMLElement>) => {
    if (lookPointerId.current === e.pointerId) {
      lookPointerId.current = null;
    }
  };

  const activeSlot = hud.slots[hud.activeSlotIndex];
  const activeWeapon = activeSlot ? WEAPON_MAP[activeSlot.weaponId] : null;

  const mapNorm = (val: number) => ((val + ISLAND_RADIUS) / (ISLAND_RADIUS * 2)) * 100;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {/* Damage / Storm Zone Screen Vignette */}
      {(hud.damageFlashTimer > 0 || hud.isOutsideZone) && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            boxShadow:
              hud.damageFlashTimer > 0
                ? 'inset 0 0 90px rgba(239, 68, 68, 0.65)'
                : 'inset 0 0 70px rgba(6, 182, 212, 0.45)',
          }}
        />
      )}

      {/* Right-side Touch Camera Drag Surface (behind action buttons) */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="absolute inset-y-0 right-0 w-3/5 pointer-events-auto touch-none-canvas"
      />

      {/* TOP LEFT: Tactical Minimap & Zone Timer */}
      <div className="absolute top-3 left-3 flex items-start gap-2.5 pointer-events-auto">
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-white/20 bg-slate-950/85 shadow-lg">
          <img
            src={ISLAND_MAP_IMAGE}
            alt="Tactical Island Radar"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-75"
          />
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
            {/* Next Zone Circle */}
            <circle
              cx={mapNorm(hud.nextZoneCenter.x)}
              cy={mapNorm(hud.nextZoneCenter.z)}
              r={(hud.nextZoneRadius / (ISLAND_RADIUS * 2)) * 100}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
              strokeDasharray="3 2"
              opacity="0.7"
            />
            {/* Current Safe Zone Circle */}
            <circle
              cx={mapNorm(hud.zoneCenter.x)}
              cy={mapNorm(hud.zoneCenter.z)}
              r={(hud.zoneRadius / (ISLAND_RADIUS * 2)) * 100}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.6"
            />
            {/* Nearby Firing Blips */}
            {hud.minimapActors
              .filter((a) => !a.isPlayer && a.isFiring)
              .map((a) => (
                <circle
                  key={a.id}
                  cx={mapNorm(a.x)}
                  cy={mapNorm(a.z)}
                  r="2.2"
                  fill="#ef4444"
                />
              ))}
            {/* Local Player Marker & View Cone */}
            <g
              transform={`translate(${mapNorm(hud.playerPos.x)}, ${mapNorm(hud.playerPos.z)}) rotate(${(-hud.playerPos.yaw * 180) / Math.PI})`}
            >
              <polygon points="0,-6 4,4 0,2 -4,4" fill="#f59e0b" stroke="#000" strokeWidth="0.8" />
            </g>
          </svg>
          <div className="absolute bottom-1 inset-x-1 flex items-center justify-between px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono-tabular text-cyan-300">
            <span>ZONE {hud.zonePhase}</span>
            <span>{hud.zoneTimerSeconds}s</span>
          </div>
        </div>

        {hud.isOutsideZone && (
          <div className="px-2.5 py-1.5 rounded-lg bg-cyan-950/90 border border-cyan-400/40 text-xs font-semibold text-cyan-200">
            Outside Safe Zone
          </div>
        )}
      </div>

      {/* TOP RIGHT: Match Counters + Kill Feed + Pause */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          {settings.showFps && (
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-white/10 text-xs font-mono-tabular text-emerald-400">
              {hud.fps} FPS
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/85 border border-white/15 text-xs sm:text-sm font-display font-bold">
            <div className="flex items-center gap-1.5 text-amber-400 font-mono-tabular">
              <span className="text-slate-400 font-sans font-medium text-xs">ALIVE</span>
              <span>{hud.aliveCount}</span>
            </div>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-1.5 text-white font-mono-tabular">
              <span className="text-slate-400 font-sans font-medium text-xs">KILLS</span>
              <span>{hud.kills}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-950/85 border border-white/15 text-slate-200 hover:bg-slate-800 active:scale-95 transition"
            aria-label="Toggle Sound"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-950/85 border border-white/15 text-slate-200 hover:bg-slate-800 active:scale-95 transition"
            aria-label="Pause Menu"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>

        {/* Kill Feed */}
        <div className="flex flex-col items-end gap-1 max-w-[260px]">
          {hud.killFeed.slice(0, 3).map((kf) => (
            <div
              key={kf.id}
              className={`px-2.5 py-1 rounded text-[11px] font-medium truncate max-w-full border ${
                kf.isPlayerInvolved
                  ? 'bg-amber-950/85 border-amber-400/40 text-amber-200'
                  : 'bg-slate-950/75 border-white/10 text-slate-300'
              }`}
            >
              <span className="font-semibold">{kf.killer}</span>
              <span className="mx-1.5 text-slate-500">[{kf.weaponName}]</span>
              <span>{kf.victim}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER: Tactical Crosshair + Hitmarker + Parachute Prompt */}
      {hud.phase === 'combat' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative flex items-center justify-center">
            <div
              className={`rounded-full border transition-all duration-100 ${
                hud.isAiming
                  ? 'w-5 h-5 border-amber-400/90'
                  : 'w-8 h-8 border-white/70'
              }`}
            />
            <div className="absolute w-1 h-1 rounded-full bg-amber-400" />
            {hud.hitMarkerTimer > 0 && (
              <svg
                viewBox="0 0 24 24"
                className={`absolute w-7 h-7 ${
                  hud.hitMarkerHeadshot ? 'text-rose-500' : 'text-amber-300'
                }`}
              >
                <path
                  d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Parachute Drop Status & Deploy CTA */}
      {hud.phase === 'parachute' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
          <div className="px-4 py-1.5 rounded-lg bg-slate-950/85 border border-amber-400/40 text-xs font-mono-tabular text-amber-300 flex items-center gap-2">
            <Wind className="w-4 h-4" />
            <span>ALTITUDE: {hud.parachuteAltitude}m</span>
            <span className="text-slate-400">·</span>
            <span>{hud.parachuteDeployed ? 'GLIDING' : 'FREEFALL'}</span>
          </div>
          {hud.canDeployParachute && (
            <button
              type="button"
              onClick={() => {
                inputRef.current.parachuteActionRequested = true;
              }}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-display font-bold text-sm shadow-lg active:scale-95 transition"
            >
              DEPLOY CHUTE
            </button>
          )}
        </div>
      )}

      {/* Nearby Loot Pickup Prompt */}
      {hud.nearbyLootLabel && hud.phase === 'combat' && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              inputRef.current.interactRequested = true;
            }}
            className="px-4 py-2 rounded-lg bg-slate-950/90 border border-amber-400/60 text-xs sm:text-sm font-semibold text-amber-300 shadow-lg hover:bg-slate-900 active:scale-95 transition"
          >
            Pick up {hud.nearbyLootLabel}
          </button>
        </div>
      )}

      {/* Reload Progress Bar */}
      {hud.isReloading && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 w-40 bg-slate-950/85 border border-white/15 rounded-lg p-1.5">
          <div className="text-[10px] text-center font-semibold text-amber-300 mb-1">
            RELOADING
          </div>
          <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* LEFT BOTTOM: Virtual Movement Joystick */}
      <div
        className={`absolute bottom-5 ${
          settings.leftHandedHud ? 'right-5' : 'left-5'
        } pointer-events-auto`}
      >
        <div
          onPointerDown={handleJoystickDown}
          onPointerMove={handleJoystickMove}
          onPointerUp={handleJoystickUp}
          onPointerCancel={handleJoystickUp}
          className="relative w-32 h-32 rounded-full bg-slate-950/50 border-2 border-white/20 flex items-center justify-center touch-none-canvas"
        >
          <div className="w-16 h-16 rounded-full border border-white/10" />
          <div
            className={`absolute w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
              hud.isSprinting
                ? 'bg-amber-500 text-slate-950'
                : joyActive
                  ? 'bg-white text-slate-950'
                  : 'bg-white/80 text-slate-900'
            }`}
            style={{
              transform: `translate(${joyOffset.x}px, ${joyOffset.y}px)`,
            }}
          >
            {hud.isSprinting && <Zap className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* BOTTOM CENTER: Health, Armor, Medkit & Weapon Slots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto w-full max-w-[440px] px-3">
        {/* Weapon Slots */}
        <div className="flex items-center gap-1.5 w-full justify-center">
          {[0, 1, 2].map((idx) => {
            const slot = hud.slots[idx];
            const wDef = slot ? WEAPON_MAP[slot.weaponId] : null;
            const isActive = hud.activeSlotIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (slot) inputRef.current.switchSlotIndex = idx;
                }}
                disabled={!slot}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg border text-left transition flex-1 max-w-[138px] ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-400 text-white'
                    : slot
                      ? 'bg-slate-950/80 border-white/15 text-slate-300 hover:bg-slate-900'
                      : 'bg-slate-950/45 border-white/5 text-slate-600'
                }`}
              >
                <div className="text-[11px] font-display font-bold truncate">
                  {wDef ? wDef.name : `Slot ${idx + 1}`}
                </div>
                <div className="text-[11px] font-mono-tabular text-amber-300">
                  {slot ? `${slot.ammoInMag} / ${slot.ammoReserve}` : 'Empty'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Health, Armor & Medkit Bar */}
        <div className="flex items-center gap-2 w-full bg-slate-950/85 border border-white/15 rounded-xl px-3 py-1.5">
          <button
            type="button"
            onClick={() => {
              inputRef.current.medkitRequested = true;
            }}
            disabled={hud.medkits <= 0 || hud.health >= hud.maxHealth}
            className="min-h-[36px] px-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-mono-tabular font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition shrink-0"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>{hud.medkits}</span>
          </button>

          <div className="flex-1 flex flex-col gap-1">
            {/* Armor Bar */}
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-100"
                  style={{ width: `${(hud.armor / hud.maxArmor) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-mono-tabular text-cyan-300 w-7 text-right">
                {hud.armor}
              </span>
            </div>
            {/* Health Bar */}
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <div className="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-100"
                  style={{ width: `${(hud.health / hud.maxHealth) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-mono-tabular text-white w-7 text-right">
                {hud.health}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT BOTTOM: Mobile Combat Action Cluster (Fire, Aim, Jump, Crouch, Reload) */}
      <div
        className={`absolute bottom-5 ${
          settings.leftHandedHud ? 'left-5' : 'right-5'
        } flex items-end gap-3 pointer-events-auto`}
      >
        {/* Secondary Actions Arc */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              inputRef.current.aiming = !inputRef.current.aiming;
            }}
            className={`min-h-[48px] min-w-[48px] rounded-full border flex items-center justify-center active:scale-95 transition ${
              hud.isAiming
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : 'bg-slate-950/75 border-white/20 text-white'
            }`}
            aria-label="Aim Down Sights"
          >
            <Crosshair className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              inputRef.current.reloadRequested = true;
            }}
            className="min-h-[48px] min-w-[48px] rounded-full bg-slate-950/75 border border-white/20 text-white flex items-center justify-center active:scale-95 transition"
            aria-label="Reload Weapon"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              inputRef.current.crouching = !inputRef.current.crouching;
            }}
            className={`min-h-[48px] min-w-[48px] rounded-full border text-[11px] font-display font-bold flex items-center justify-center active:scale-95 transition ${
              hud.isCrouching
                ? 'bg-cyan-500 border-cyan-300 text-slate-950'
                : 'bg-slate-950/75 border-white/20 text-white'
            }`}
          >
            CROUCH
          </button>

          <button
            type="button"
            onPointerDown={() => {
              inputRef.current.jumpRequested = true;
            }}
            className="min-h-[48px] min-w-[48px] rounded-full bg-slate-950/75 border border-white/20 text-white text-[11px] font-display font-bold flex items-center justify-center active:scale-95 transition"
          >
            JUMP
          </button>
        </div>

        {/* Primary Shoot Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            inputRef.current.firing = true;
            lookPointerId.current = e.pointerId;
            lookLast.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (lookPointerId.current === e.pointerId) {
              handleLookMove(e);
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            inputRef.current.firing = false;
            if (lookPointerId.current === e.pointerId) {
              lookPointerId.current = null;
            }
          }}
          onPointerCancel={() => {
            inputRef.current.firing = false;
            lookPointerId.current = null;
          }}
          className="w-20 h-20 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 border-4 border-amber-200/60 text-slate-950 font-display font-bold text-sm shadow-xl flex flex-col items-center justify-center touch-none-canvas transition"
        >
          <span>FIRE</span>
          {activeWeapon && (
            <span className="text-[10px] font-mono-tabular opacity-80">
              {activeSlot?.ammoInMag ?? 0}
            </span>
          )}
        </button>
      </div>

      {/* PAUSE OVERLAY */}
      {paused && !matchResult && (
        <div className="absolute inset-0 bg-slate-950/85 flex items-center justify-center p-4 pointer-events-auto">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/15 p-6 flex flex-col gap-4">
            <h2 className="text-xl font-display font-bold text-white">Match Paused</h2>
            <p className="text-xs text-slate-400">
              Desktop: WASD move · Mouse look/shoot · Right-click ADS · C crouch · R reload · 1-3 weapons
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-display font-bold text-sm hover:bg-amber-400 transition"
              >
                Resume Match
              </button>
              <button
                type="button"
                onClick={onReturnLobby}
                className="w-full py-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm hover:bg-slate-700 transition"
              >
                Leave to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / ELIMINATION SUMMARY MODAL */}
      {matchResult && (
        <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center p-4 pointer-events-auto">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-6 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div
                  className={`text-xs font-semibold tracking-wider uppercase ${
                    matchResult.victory ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {matchResult.victory ? 'Last Player Standing' : 'Match Eliminated'}
                </div>
                <h2 className="text-3xl font-display font-bold text-white mt-0.5">
                  {matchResult.victory ? 'BOOYAH! VICTORY' : `RANK #${matchResult.placement} / ${matchResult.totalPlayers}`}
                </h2>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Eliminations</div>
                <div className="text-2xl font-mono-tabular font-bold text-amber-400">
                  {matchResult.kills}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 py-3 border-y border-white/10 text-center">
              <div>
                <div className="text-[11px] text-slate-400">Damage</div>
                <div className="text-lg font-mono-tabular font-bold text-white">
                  {matchResult.damage}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Survived</div>
                <div className="text-lg font-mono-tabular font-bold text-white">
                  {Math.floor(matchResult.survivalSeconds / 60)}:
                  {String(matchResult.survivalSeconds % 60).padStart(2, '0')}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Loadout</div>
                <div className="text-sm font-semibold text-amber-300 truncate">
                  {matchResult.weaponUsed}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-display font-bold text-sm hover:bg-amber-400 transition"
              >
                Drop Again
              </button>
              <button
                type="button"
                onClick={onReturnLobby}
                className="flex-1 py-3 rounded-xl bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm hover:bg-slate-700 transition"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
