import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { soundEngine } from './audio/SoundEngine';
import { MainMenu } from './components/MainMenu';
import { MatchArena } from './components/MatchArena';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './data/catalog';
import { buildMatchRecord, MatchEndSummary } from './engine/BattleRoyaleEngine';
import {
  fetchLeaderboard,
  fetchRooms,
  multiplayerClient,
  submitMatchResult,
} from './services/multiplayerClient';
import {
  GameMode,
  GameSettings,
  LeaderboardEntry,
  MatchRecord,
  MultiplayerRoom,
  PlayerProfile,
} from './types/game';

const STORAGE_PROFILE = 'br_max_profile_v1';
const STORAGE_SETTINGS = 'br_max_settings_v1';
const STORAGE_HISTORY = 'br_max_history_v1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() =>
    loadJson(STORAGE_PROFILE, DEFAULT_PROFILE),
  );
  const [settings, setSettings] = useState<GameSettings>(() =>
    loadJson(STORAGE_SETTINGS, DEFAULT_SETTINGS),
  );
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [inMatch, setInMatch] = useState(false);
  const [matchKey, setMatchKey] = useState(1);
  const [activeMode, setActiveMode] = useState<GameMode>('solo_bots');

  // Multiplayer state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rooms, setRooms] = useState<MultiplayerRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<MultiplayerRoom | null>(null);
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  // Portrait orientation detector for mobile phones
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortraitMobile(window.innerWidth < 600 && window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Sync SoundEngine with user settings
  useEffect(() => {
    soundEngine.updateSettings(
      settings.sfxVolume,
      settings.musicVolume,
      settings.musicEnabled,
    );
  }, [settings]);

  // Connect WebSocket multiplayer & load initial leaderboard/rooms
  useEffect(() => {
    fetchLeaderboard().then(setLeaderboard);
    fetchRooms().then(setRooms);

    multiplayerClient.setHandlers({
      onRoomsList: (list) => setRooms(list),
      onRoomJoined: (room) => {
        setRoomError(null);
        setCurrentRoom(room);
      },
      onRoomUpdated: (room) => setCurrentRoom(room),
      onRoomLeft: () => setCurrentRoom(null),
      onMatchStarted: (room) => {
        setCurrentRoom(room);
        setIsMatchmaking(false);
        setActiveMode('multiplayer_room');
        setMatchKey((k) => k + 1);
        setInMatch(true);
      },
      onError: (msg) => setRoomError(msg),
    });

    multiplayerClient.connect(profile.playerId, profile.username);
  }, []);

  const handleUpdateProfile = (next: Partial<PlayerProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...next };
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(updated));
      if (next.username) {
        multiplayerClient.identify(updated.playerId, updated.username);
      }
      return updated;
    });
  };

  const handleUpdateSettings = (next: Partial<GameSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...next };
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(updated));
      return updated;
    });
  };

  const handleStartMatch = (mode: GameMode) => {
    soundEngine.unlock();
    setActiveMode(mode);
    setMatchKey((k) => k + 1);
    setInMatch(true);
  };

  const handleMatchComplete = async (summary: MatchEndSummary) => {
    const record = buildMatchRecord(summary, activeMode);
    setMatchHistory((prev) => {
      const next = [record, ...prev].slice(0, 25);
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(next));
      return next;
    });

    const earnedXp = (summary.victory ? 180 : 45) + summary.kills * 35;
    setProfile((prev) => {
      const nextXp = prev.xp + earnedXp;
      const nextLevel = 1 + Math.floor(nextXp / 250);
      const updated: PlayerProfile = {
        ...prev,
        xp: nextXp,
        level: nextLevel,
        totalMatches: prev.totalMatches + 1,
        totalWins: prev.totalWins + (summary.victory ? 1 : 0),
        totalKills: prev.totalKills + summary.kills,
        totalDamage: prev.totalDamage + summary.damage,
        bestPlacement: Math.min(prev.bestPlacement, summary.placement),
      };
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(updated));
      return updated;
    });

    const updatedBoard = await submitMatchResult({
      playerId: profile.playerId,
      username: profile.username,
      rankTier: profile.rankTier,
      match: record,
    });
    if (updatedBoard.length > 0) {
      setLeaderboard(updatedBoard);
    }
  };

  const handleReturnLobby = () => {
    soundEngine.startMusic('lobby');
    setInMatch(false);
    setCurrentRoom(null);
    fetchLeaderboard().then(setLeaderboard);
  };

  const handlePlayAgain = () => {
    setMatchKey((k) => k + 1);
  };

  return (
    <main className="relative w-full h-full bg-[#0b0f17] text-slate-100 overflow-hidden">
      {inMatch ? (
        <MatchArena
          matchKey={matchKey}
          mode={activeMode}
          profile={profile}
          settings={settings}
          room={currentRoom}
          onMatchComplete={handleMatchComplete}
          onPlayAgain={handlePlayAgain}
          onReturnLobby={handleReturnLobby}
        />
      ) : (
        <MainMenu
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          matchHistory={matchHistory}
          leaderboard={leaderboard}
          rooms={rooms}
          currentRoom={currentRoom}
          isMatchmaking={isMatchmaking}
          roomError={roomError}
          onStartMatch={handleStartMatch}
          onCreateRoom={(name) =>
            multiplayerClient.createRoom(name, profile.selectedCharacterId)
          }
          onJoinRoom={(idOrCode, byCode) =>
            multiplayerClient.joinRoom(idOrCode, profile.selectedCharacterId, byCode)
          }
          onLeaveRoom={() => multiplayerClient.leaveRoom()}
          onToggleReady={() => multiplayerClient.toggleReady()}
          onStartRoomMatch={() => multiplayerClient.startRoomMatch()}
          onToggleMatchmaking={() => {
            if (isMatchmaking) {
              multiplayerClient.leaveMatchmaking();
              setIsMatchmaking(false);
            } else {
              multiplayerClient.joinMatchmaking(profile.selectedCharacterId);
              setIsMatchmaking(true);
            }
          }}
        />
      )}

      {/* Subtle Landscape Recommendation Banner on Portrait Phones */}
      {isPortraitMobile && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg bg-slate-950/95 border border-amber-400/50 text-[11px] text-amber-300 flex items-center gap-1.5 shadow-lg pointer-events-none whitespace-nowrap">
          <RotateCw className="w-3.5 h-3.5" />
          <span>Rotate device to landscape for best thumb controls</span>
        </div>
      )}
    </main>
  );
}
