import { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Plus,
  Shield,
  Smartphone,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { CHARACTERS, WEAPONS } from '../data/catalog';
import {
  GameSettings,
  LeaderboardEntry,
  MatchRecord,
  MultiplayerRoom,
  PlayerProfile,
} from '../types/game';

export type LobbyTab =
  | 'characters'
  | 'armory'
  | 'multiplayer'
  | 'profile'
  | 'settings'
  | 'android'
  | null;

interface LobbyModalsProps {
  activeTab: LobbyTab;
  onClose: () => void;
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
  onCreateRoom: (name: string) => void;
  onJoinRoom: (idOrCode: string, byCode: boolean) => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onStartRoomMatch: () => void;
  onToggleMatchmaking: () => void;
}

export function LobbyModals({
  activeTab,
  onClose,
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
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onStartRoomMatch,
  onToggleMatchmaking,
}: LobbyModalsProps) {
  const [roomNameInput, setRoomNameInput] = useState(`${profile.username}'s Arena`);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [usernameDraft, setUsernameDraft] = useState(profile.username);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!activeTab) return null;

  const titleMap: Record<Exclude<LobbyTab, null>, string> = {
    characters: 'Operative Selection',
    armory: 'Weapon Armory',
    multiplayer: 'Multiplayer & Leaderboard',
    profile: 'Player Profile & Match History',
    settings: 'Game Settings',
    android: 'Android APK Export',
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-[#101622] border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h2 className="text-lg sm:text-xl font-display font-bold text-white">
            {titleMap[activeTab]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 1. CHARACTER SELECTION */}
          {activeTab === 'characters' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {CHARACTERS.map((char) => {
                const selected = profile.selectedCharacterId === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => onUpdateProfile({ selectedCharacterId: char.id })}
                    className={`text-left rounded-xl overflow-hidden border transition flex flex-col ${
                      selected
                        ? 'border-amber-400 bg-slate-900'
                        : 'border-white/10 bg-slate-900/50 hover:border-white/25'
                    }`}
                  >
                    <div className="relative h-44 w-full bg-slate-950 overflow-hidden">
                      <img
                        src={char.avatarUrl}
                        alt={char.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#101622] via-transparent to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between">
                        <div>
                          <div className="text-[11px] font-semibold text-amber-400">
                            {char.codename}
                          </div>
                          <div className="text-base font-display font-bold text-white">
                            {char.name}
                          </div>
                        </div>
                        {selected && <Check className="w-5 h-5 text-amber-400" />}
                      </div>
                    </div>

                    <div className="p-3.5 flex flex-col gap-2">
                      <div className="text-xs text-slate-400">
                        {char.role} · {char.perkTitle}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {char.perkDescription}
                      </p>
                      <div className="flex items-center gap-4 pt-1 text-[11px] font-mono-tabular text-slate-400">
                        <span>Speed {Math.round(char.speedBonus * 100)}%</span>
                        <span>Start Armor +{char.armorBonus}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 2. WEAPON ARMORY */}
          {activeTab === 'armory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {WEAPONS.map((w) => {
                const equipped = profile.favoriteWeaponId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`rounded-xl p-4 border transition flex flex-col justify-between gap-3 ${
                      equipped
                        ? 'border-amber-400 bg-slate-900'
                        : 'border-white/10 bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-amber-400 font-medium">
                          {w.classLabel}
                        </div>
                        <h3 className="text-base font-display font-bold text-white">
                          {w.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">{w.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateProfile({ favoriteWeaponId: w.id })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                          equipped
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        {equipped ? 'Equipped' : 'Equip'}
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs font-mono-tabular">
                      <div>
                        <div className="text-[10px] text-slate-500 font-sans">Damage</div>
                        <div className="text-slate-100 font-semibold">
                          {w.damage * w.pellets}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-sans">Rate</div>
                        <div className="text-slate-100 font-semibold">
                          {Math.round(60000 / w.fireRateMs)} RPM
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-sans">Range</div>
                        <div className="text-slate-100 font-semibold">{w.range}m</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-sans">Mag</div>
                        <div className="text-slate-100 font-semibold">{w.magazineSize}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. MULTIPLAYER, MATCHMAKING, ROOMS & LEADERBOARD */}
          {activeTab === 'multiplayer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Matchmaking & Room Management */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {roomError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
                    {roomError}
                  </div>
                )}

                {currentRoom ? (
                  <div className="rounded-xl bg-slate-900 border border-amber-400/40 p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-amber-400 font-medium">
                          Active Match Room · {currentRoom.players.length}/{currentRoom.maxPlayers}
                        </div>
                        <h3 className="text-lg font-display font-bold text-white">
                          {currentRoom.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(currentRoom.roomCode)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-xs font-mono-tabular text-amber-300 hover:bg-slate-700"
                      >
                        <span>CODE: {currentRoom.roomCode}</span>
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                      {currentRoom.players.map((pl) => (
                        <div
                          key={pl.playerId}
                          className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/50 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {pl.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                            <span className="font-semibold text-white">{pl.username}</span>
                            <span className="text-slate-500">· {pl.characterId}</span>
                          </div>
                          <span
                            className={
                              pl.ready ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                            }
                          >
                            {pl.ready ? 'Ready' : 'Waiting'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2.5">
                      {currentRoom.hostId === profile.playerId ? (
                        <button
                          type="button"
                          onClick={onStartRoomMatch}
                          className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-display font-bold text-sm hover:bg-amber-400 transition"
                        >
                          Launch Match (Fill Bots to 20)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onToggleReady}
                          className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-display font-bold text-sm hover:bg-cyan-400 transition"
                        >
                          Toggle Ready
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onLeaveRoom}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
                      >
                        Leave
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Quick Matchmaking */}
                    <div className="rounded-xl bg-slate-900/80 border border-white/10 p-4 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-display font-bold text-white">
                          Online Matchmaking Queue
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Pairs online players into a 20-combatant island drop automatically.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleMatchmaking}
                        className={`px-4 py-2.5 rounded-xl text-xs font-display font-bold whitespace-nowrap shrink-0 transition ${
                          isMatchmaking
                            ? 'bg-rose-500 text-white hover:bg-rose-400'
                            : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        }`}
                      >
                        {isMatchmaking ? 'Cancel Queue' : 'Find Match'}
                      </button>
                    </div>

                    {/* Create & Join Room */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-900/70 border border-white/10 p-3.5 flex flex-col gap-2.5">
                        <div className="text-xs font-semibold text-white">Create Private Room</div>
                        <input
                          type="text"
                          value={roomNameInput}
                          onChange={(e) => setRoomNameInput(e.target.value)}
                          maxLength={28}
                          placeholder="Room name"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => onCreateRoom(roomNameInput)}
                          className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 flex items-center justify-center gap-1.5 transition"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Room</span>
                        </button>
                      </div>

                      <div className="rounded-xl bg-slate-900/70 border border-white/10 p-3.5 flex flex-col gap-2.5">
                        <div className="text-xs font-semibold text-white">Join by Room Code</div>
                        <input
                          type="text"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          maxLength={6}
                          placeholder="Enter 5-char code"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-xs font-mono-tabular text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (joinCodeInput.trim()) onJoinRoom(joinCodeInput.trim(), true);
                          }}
                          className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 transition"
                        >
                          <Users className="w-4 h-4" />
                          <span>Join Room</span>
                        </button>
                      </div>
                    </div>

                    {/* Active Server Rooms List */}
                    <div className="rounded-xl bg-slate-900/50 border border-white/10 p-3.5 flex flex-col gap-2">
                      <div className="text-xs font-semibold text-slate-300">
                        Open Lobby Rooms ({rooms.length})
                      </div>
                      {rooms.length === 0 ? (
                        <div className="text-xs text-slate-500 py-3 text-center">
                          No active public rooms yet. Create one or drop directly into Solo + Bots.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {rooms.map((rm) => (
                            <div
                              key={rm.roomId}
                              className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 text-xs"
                            >
                              <div>
                                <div className="font-semibold text-white">{rm.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono-tabular">
                                  Code: {rm.roomCode} · {rm.players.length}/{rm.maxPlayers} players
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={rm.status !== 'waiting'}
                                onClick={() => onJoinRoom(rm.roomId, false)}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold disabled:opacity-40"
                              >
                                {rm.status === 'waiting' ? 'Join' : 'Live'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right: Global Leaderboard */}
              <div className="lg:col-span-5 rounded-xl bg-slate-900/70 border border-white/10 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-display font-bold text-white">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Global Leaderboard</span>
                </div>
                <div className="divide-y divide-white/10">
                  {leaderboard.slice(0, 10).map((entry, idx) => (
                    <div
                      key={entry.playerId}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 font-mono-tabular text-slate-400 font-bold">
                          #{idx + 1}
                        </span>
                        <div className="truncate">
                          <div className="font-semibold text-white truncate">
                            {entry.username}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {entry.rankTier} · {entry.wins}W / {entry.kills}K
                          </div>
                        </div>
                      </div>
                      <span className="font-mono-tabular font-bold text-amber-400 shrink-0">
                        {entry.rating}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. PLAYER PROFILE & MATCH HISTORY */}
          {activeTab === 'profile' && (
            <div className="flex flex-col gap-5">
              {/* Username & Career Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-900/70 border border-white/10 p-4 flex flex-col gap-3">
                  <div className="text-xs text-slate-400">Operative Callsign</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      maxLength={18}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (usernameDraft.trim()) {
                          onUpdateProfile({ username: usernameDraft.trim() });
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition"
                    >
                      Save
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 font-mono-tabular">
                    Level {profile.level} · {profile.rankTier} · {profile.xp} XP
                  </div>
                </div>

                <div className="rounded-xl bg-slate-900/70 border border-white/10 p-4 grid grid-cols-4 gap-2 text-center items-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Matches</div>
                    <div className="text-lg font-mono-tabular font-bold text-white">
                      {profile.totalMatches}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Wins</div>
                    <div className="text-lg font-mono-tabular font-bold text-amber-400">
                      {profile.totalWins}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Kills</div>
                    <div className="text-lg font-mono-tabular font-bold text-white">
                      {profile.totalKills}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Win Rate</div>
                    <div className="text-lg font-mono-tabular font-bold text-emerald-400">
                      {profile.totalMatches > 0
                        ? Math.round((profile.totalWins / profile.totalMatches) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              </div>

              {/* Match History Table */}
              <div className="rounded-xl bg-slate-900/60 border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Swords className="w-4 h-4 text-amber-400" />
                  <span>Recent Match History</span>
                </div>
                {matchHistory.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Complete a Battle Royale match to record your island combat logs.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 text-slate-400">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Result</th>
                          <th className="py-2.5 px-4 font-medium">Placement</th>
                          <th className="py-2.5 px-4 font-medium">Kills</th>
                          <th className="py-2.5 px-4 font-medium">Damage</th>
                          <th className="py-2.5 px-4 font-medium">Weapon</th>
                          <th className="py-2.5 px-4 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono-tabular">
                        {matchHistory.map((m) => (
                          <tr key={m.id} className="hover:bg-white/5">
                            <td
                              className={`py-2.5 px-4 font-sans font-semibold ${
                                m.victory ? 'text-amber-400' : 'text-slate-300'
                              }`}
                            >
                              {m.victory ? 'Victory' : 'Eliminated'}
                            </td>
                            <td className="py-2.5 px-4 text-white">
                              #{m.placement} / {m.totalPlayers}
                            </td>
                            <td className="py-2.5 px-4 text-white">{m.kills}</td>
                            <td className="py-2.5 px-4 text-slate-300">{m.damage}</td>
                            <td className="py-2.5 px-4 font-sans text-slate-300">
                              {m.weaponUsed}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400">
                              {Math.floor(m.survivalSeconds / 60)}:
                              {String(m.survivalSeconds % 60).padStart(2, '0')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. SETTINGS */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl bg-slate-900/70 border border-white/10 p-4 flex flex-col gap-4">
                <div className="text-sm font-display font-bold text-white">
                  Graphics & Performance
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-slate-400">Render Quality</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onUpdateSettings({ graphicsQuality: q })}
                        className={`py-2 rounded-lg font-semibold capitalize border transition ${
                          settings.graphicsQuality === q
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-950 border-white/10 text-slate-300'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-slate-300">Show Live FPS Counter</span>
                  <input
                    type="checkbox"
                    checked={settings.showFps}
                    onChange={(e) => onUpdateSettings({ showFps: e.target.checked })}
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-slate-300">Auto-Pickup Loot</span>
                  <input
                    type="checkbox"
                    checked={settings.autoPickup}
                    onChange={(e) => onUpdateSettings({ autoPickup: e.target.checked })}
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-slate-300">Left-Handed Touch Layout</span>
                  <input
                    type="checkbox"
                    checked={settings.leftHandedHud}
                    onChange={(e) => onUpdateSettings({ leftHandedHud: e.target.checked })}
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-slate-900/70 border border-white/10 p-4 flex flex-col gap-4">
                <div className="text-sm font-display font-bold text-white">
                  Controls & Audio
                </div>

                <label className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span>Camera Sensitivity</span>
                    <span className="font-mono-tabular text-amber-400">
                      {settings.touchSensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="2.2"
                    step="0.05"
                    value={settings.touchSensitivity}
                    onChange={(e) =>
                      onUpdateSettings({ touchSensitivity: Number(e.target.value) })
                    }
                    className="accent-amber-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span>Aim (ADS) Sensitivity</span>
                    <span className="font-mono-tabular text-amber-400">
                      {settings.aimSensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="1.5"
                    step="0.05"
                    value={settings.aimSensitivity}
                    onChange={(e) =>
                      onUpdateSettings({ aimSensitivity: Number(e.target.value) })
                    }
                    className="accent-amber-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span>SFX Volume</span>
                    <span className="font-mono-tabular text-amber-400">
                      {Math.round(settings.sfxVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.sfxVolume}
                    onChange={(e) =>
                      onUpdateSettings({ sfxVolume: Number(e.target.value) })
                    }
                    className="accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-slate-300">Tactical Background Music</span>
                  <input
                    type="checkbox"
                    checked={settings.musicEnabled}
                    onChange={(e) => onUpdateSettings({ musicEnabled: e.target.checked })}
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 6. ANDROID APK BUILD GUIDE */}
          {activeTab === 'android' && (
            <div className="flex flex-col gap-4 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-2 text-sm font-display font-bold text-white">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Capacitor Android APK Export Pipeline</span>
              </div>
              <p>
                This project ships with <code className="text-amber-300">capacitor.config.ts</code>{' '}
                and landscape orientation viewport locks ready for native Android WebGL packaging.
              </p>
              <pre className="p-4 rounded-xl bg-slate-950 border border-white/10 font-mono-tabular text-[11px] text-emerald-300 overflow-x-auto">
{`# 1. Build the production web bundle
npm run build

# 2. Install Capacitor & add Android platform
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android

# 3. Enforce landscape lock in android/app/src/main/AndroidManifest.xml:
#    android:screenOrientation="sensorLandscape"
#    android:hardwareAccelerated="true"

# 4. Build debug/release APK via Gradle or Android Studio
npx cap open android
# Or CLI: cd android && ./gradlew assembleRelease`}
              </pre>
              <div className="flex items-center gap-2 text-slate-400">
                <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  Hardware acceleration and landscape-first touch controls are pre-configured in{' '}
                  <code>index.html</code> and <code>GameHUD.tsx</code>.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
