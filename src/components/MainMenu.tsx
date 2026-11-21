import { useState } from 'react';
import {
  Crosshair,
  Play,
  Settings,
  Smartphone,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { CHARACTER_MAP, CHARACTERS, WEAPON_MAP, WEAPONS } from '../data/catalog';
import {
  GameMode,
  GameSettings,
  LeaderboardEntry,
  MatchRecord,
  MultiplayerRoom,
  PlayerProfile,
} from '../types/game';
import { Lobby3DPreview } from './Lobby3DPreview';
import { LobbyModals, LobbyTab } from './LobbyModals';

interface MainMenuProps {
  profile: PlayerProfile;
  onUpdateProfile: (next: Partial<PlayerProfile>) => void;
  settings: GameSettings;
  onUpdateSettings: (next: Partial<GameSettings>) => void;
  matchHistory: MatchRecord[];
  leaderboard: LeaderboardEntry[];
  rooms: MultiplayerRoom[];
  currentRoom: MultiplayerRoom | null;
  isMatchmaking: boolean;
  roomError: string | null;
  onStartMatch: (mode: GameMode) => void;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (idOrCode: string, byCode: boolean) => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onStartRoomMatch: () => void;
  onToggleMatchmaking: () => void;
}

export function MainMenu({
  profile,
  onUpdateProfile,
  settings,
  onUpdateSettings,
  matchHistory,
  leaderboard,
  rooms,
  currentRoom,
  isMatchmaking,
  roomError,
  onStartMatch,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onStartRoomMatch,
  onToggleMatchmaking,
}: MainMenuProps) {
  const [activeTab, setActiveTab] = useState<LobbyTab>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode>('solo_bots');

  const selectedChar = CHARACTER_MAP[profile.selectedCharacterId] || CHARACTERS[0];
  const selectedWeapon = WEAPON_MAP[profile.favoriteWeaponId] || WEAPONS[0];

  const handlePlay = () => {
    if (selectedMode === 'multiplayer_room') {
      setActiveTab('multiplayer');
    } else {
      onStartMatch('solo_bots');
    }
  };

  return (
    <div className="relative w-full h-full bg-[#0b0f17] overflow-hidden flex flex-col">
      {/* 1. Full-Viewport 3D Character & Weapon Hangar */}
      <div className="absolute inset-0 z-0">
        <Lobby3DPreview character={selectedChar} weapon={selectedWeapon} />
      </div>

      {/* Subtle Edge Scrims for Legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0b0f17]/90 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0f17]/95 via-[#0b0f17]/50 to-transparent z-10" />

      {/* 2. Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="relative z-20 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-7 py-3.5 border-b border-white/10 bg-[#0b0f17]/75">
        {/* Zone 1: Brand Wordmark */}
        <div className="font-display font-bold text-base sm:text-lg tracking-wider text-white whitespace-nowrap shrink-0">
          BATTLE ROYALE <span className="text-amber-400">MAX</span>
        </div>

        {/* Zone 2: Concise Nav Links */}
        <nav className="flex items-center gap-1 sm:gap-5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('characters')}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-400 transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>Characters</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('armory')}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-400 transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Weapons</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('multiplayer')}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-400 transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Multiplayer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-400 transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-400 transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Zone 3: Single Primary Utility Action (APK Export Guide) */}
        <button
          type="button"
          onClick={() => setActiveTab('android')}
          className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800/90 border border-white/10 text-xs font-medium text-slate-200 hover:bg-slate-700 transition whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
          <span>Android APK</span>
        </button>
      </header>

      {/* 3. Peripheral Lobby Overlays (Center 3D Viewport Stays Open) */}
      <div className="relative z-20 flex-1 flex items-end justify-between p-4 sm:p-7 pointer-events-none">
        {/* Bottom-Left: Operative & Career Summary */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="pointer-events-auto text-left rounded-xl bg-slate-950/80 border border-white/10 px-4 py-3 hover:border-amber-400/50 transition max-w-xs"
        >
          <div className="text-xs text-amber-400 font-semibold">
            {selectedChar.codename} · {selectedWeapon.name}
          </div>
          <div className="text-base sm:text-lg font-display font-bold text-white mt-0.5">
            {profile.username}
          </div>
          <div className="text-xs text-slate-400 font-mono-tabular mt-1">
            Lvl {profile.level} · {profile.rankTier} · {profile.totalWins} Wins ·{' '}
            {profile.totalKills} Kills
          </div>
        </button>

        {/* Bottom-Right: Mode Switch + Primary Play CTA */}
        <div className="pointer-events-auto flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/85 border border-white/10">
            <button
              type="button"
              onClick={() => setSelectedMode('solo_bots')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                selectedMode === 'solo_bots'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Solo Island · 20 Bots
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode('multiplayer_room')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                selectedMode === 'multiplayer_room'
                  ? 'bg-slate-800 text-cyan-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Online Room
            </button>
          </div>

          <button
            type="button"
            onClick={handlePlay}
            className="min-h-[52px] px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-display font-bold text-base sm:text-lg tracking-wide shadow-xl shadow-amber-500/20 flex items-center gap-2.5 transition whitespace-nowrap"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{selectedMode === 'solo_bots' ? 'PLAY MATCH' : 'OPEN LOBBY'}</span>
          </button>
        </div>
      </div>

      {/* 4. Sub-Screen Modals */}
      <LobbyModals
        activeTab={activeTab}
        onClose={() => setActiveTab(null)}
        profile={profile}
        onUpdateProfile={onUpdateProfile}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        matchHistory={matchHistory}
        leaderboard={leaderboard}
        rooms={rooms}
        currentRoom={currentRoom}
        isMatchmaking={isMatchmaking}
        roomError={roomError}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onLeaveRoom={onLeaveRoom}
        onToggleReady={onToggleReady}
        onStartRoomMatch={onStartRoomMatch}
        onToggleMatchmaking={onToggleMatchmaking}
      />
    </div>
  );
}
