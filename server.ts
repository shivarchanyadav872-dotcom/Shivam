import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type { LeaderboardEntry, MatchRecord, MultiplayerRoom } from './src/types/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

// Authoritative server state
const rooms = new Map<string, MultiplayerRoom>();
const clientSockets = new Map<WebSocket, { playerId: string; username: string; roomId: string | null }>();
const matchmakingQueue: Array<{
  ws: WebSocket;
  playerId: string;
  username: string;
  characterId: string;
}> = [];

const leaderboard: LeaderboardEntry[] = [
  { playerId: 'seed_1', username: 'Kestrel_07', rankTier: 'Grandmaster', wins: 31, kills: 218, matches: 62, rating: 3420 },
  { playerId: 'seed_2', username: 'ValkyrieX', rankTier: 'Master I', wins: 24, kills: 184, matches: 55, rating: 3110 },
  { playerId: 'seed_3', username: 'RoninPulse', rankTier: 'Diamond I', wins: 19, kills: 149, matches: 48, rating: 2890 },
  { playerId: 'seed_4', username: 'ApexNomad', rankTier: 'Diamond II', wins: 14, kills: 112, matches: 41, rating: 2640 },
  { playerId: 'seed_5', username: 'StrikerOne', rankTier: 'Diamond II', wins: 5, kills: 64, matches: 18, rating: 2450 },
];

const globalMatches: MatchRecord[] = [];

function getPublicRooms(): MultiplayerRoom[] {
  return Array.from(rooms.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function broadcastRoomsUpdate() {
  const payload = JSON.stringify({ type: 'rooms:list', rooms: getPublicRooms() });
  for (const [ws] of clientSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastToRoom(roomId: string, msg: object, excludeWs?: WebSocket) {
  const payload = JSON.stringify(msg);
  for (const [ws, meta] of clientSockets) {
    if (meta.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function removeFromQueue(ws: WebSocket) {
  const idx = matchmakingQueue.findIndex((q) => q.ws === ws);
  if (idx !== -1) matchmakingQueue.splice(idx, 1);
}

function leaveCurrentRoom(ws: WebSocket) {
  const meta = clientSockets.get(ws);
  if (!meta || !meta.roomId) return;
  const room = rooms.get(meta.roomId);
  if (room) {
    room.players = room.players.filter((p) => p.playerId !== meta.playerId);
    if (room.players.length === 0) {
      rooms.delete(room.roomId);
    } else {
      if (room.hostId === meta.playerId) {
        room.hostId = room.players[0].playerId;
        room.players[0].isHost = true;
      }
      broadcastToRoom(room.roomId, { type: 'room:updated', room });
    }
  }
  meta.roomId = null;
  broadcastRoomsUpdate();
}

// REST Endpoints
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, playersOnline: clientSockets.size });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: getPublicRooms() });
});

app.get('/api/leaderboard', (_req, res) => {
  const sorted = [...leaderboard].sort((a, b) => b.rating - a.rating).slice(0, 25);
  res.json({ leaderboard: sorted });
});

app.get('/api/matches', (_req, res) => {
  res.json({ matches: globalMatches.slice(0, 30) });
});

app.post('/api/matches', (req, res) => {
  const { playerId, username, rankTier, match } = req.body as {
    playerId?: string;
    username?: string;
    rankTier?: string;
    match?: MatchRecord;
  };
  if (!playerId || !username || !match) {
    res.status(400).json({ error: 'Invalid match submission' });
    return;
  }

  globalMatches.unshift(match);
  if (globalMatches.length > 100) globalMatches.pop();

  let entry = leaderboard.find((e) => e.playerId === playerId || e.username === username);
  const pointsDelta = (match.victory ? 65 : Math.max(5, 25 - match.placement)) + match.kills * 12;

  if (!entry) {
    entry = {
      playerId,
      username,
      rankTier: rankTier || 'Gold I',
      wins: match.victory ? 1 : 0,
      kills: match.kills,
      matches: 1,
      rating: 2000 + pointsDelta,
    };
    leaderboard.push(entry);
  } else {
    entry.username = username;
    entry.matches += 1;
    entry.kills += match.kills;
    if (match.victory) entry.wins += 1;
    entry.rating += pointsDelta;
    entry.rankTier =
      entry.rating >= 3300
        ? 'Grandmaster'
        : entry.rating >= 3000
          ? 'Master I'
          : entry.rating >= 2600
            ? 'Diamond II'
            : 'Platinum I';
  }

  const sorted = [...leaderboard].sort((a, b) => b.rating - a.rating).slice(0, 25);
  res.json({ ok: true, leaderboard: sorted });
});

async function startServer() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const connId = `op_${Math.random().toString(36).slice(2, 9)}`;
    clientSockets.set(ws, { playerId: connId, username: 'Operative', roomId: null });
    ws.send(JSON.stringify({ type: 'rooms:list', rooms: getPublicRooms() }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const meta = clientSockets.get(ws);
        if (!meta) return;

        switch (msg.type) {
          case 'auth:identify': {
            if (typeof msg.playerId === 'string') meta.playerId = msg.playerId;
            if (typeof msg.username === 'string') meta.username = msg.username.slice(0, 18);
            break;
          }

          case 'room:create': {
            leaveCurrentRoom(ws);
            const roomId = `rm_${Date.now().toString(36)}`;
            const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
            const roomName =
              typeof msg.name === 'string' && msg.name.trim()
                ? msg.name.trim().slice(0, 28)
                : `${meta.username}'s Squad`;

            const room: MultiplayerRoom = {
              roomId,
              roomCode,
              name: roomName,
              hostId: meta.playerId,
              status: 'waiting',
              maxPlayers: 20,
              createdAt: Date.now(),
              players: [
                {
                  playerId: meta.playerId,
                  username: meta.username,
                  characterId: msg.characterId || 'vanguard',
                  ready: true,
                  isHost: true,
                },
              ],
            };
            rooms.set(roomId, room);
            meta.roomId = roomId;
            ws.send(JSON.stringify({ type: 'room:joined', room }));
            broadcastRoomsUpdate();
            break;
          }

          case 'room:join': {
            const target = Array.from(rooms.values()).find(
              (r) => r.roomId === msg.roomId || r.roomCode === String(msg.roomCode || '').toUpperCase(),
            );
            if (!target || target.status !== 'waiting' || target.players.length >= target.maxPlayers) {
              ws.send(JSON.stringify({ type: 'room:error', message: 'Room unavailable or already in match.' }));
              return;
            }
            leaveCurrentRoom(ws);
            if (!target.players.some((p) => p.playerId === meta.playerId)) {
              target.players.push({
                playerId: meta.playerId,
                username: meta.username,
                characterId: msg.characterId || 'vanguard',
                ready: true,
                isHost: false,
              });
            }
            meta.roomId = target.roomId;
            ws.send(JSON.stringify({ type: 'room:joined', room: target }));
            broadcastToRoom(target.roomId, { type: 'room:updated', room: target }, ws);
            broadcastRoomsUpdate();
            break;
          }

          case 'room:leave': {
            leaveCurrentRoom(ws);
            ws.send(JSON.stringify({ type: 'room:left' }));
            break;
          }

          case 'room:ready': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room) return;
            const p = room.players.find((pl) => pl.playerId === meta.playerId);
            if (p) p.ready = !p.ready;
            broadcastToRoom(room.roomId, { type: 'room:updated', room });
            break;
          }

          case 'room:start': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || room.hostId !== meta.playerId) return;
            room.status = 'in_match';
            broadcastToRoom(room.roomId, { type: 'match:started', room });
            broadcastRoomsUpdate();
            break;
          }

          case 'matchmaking:join': {
            removeFromQueue(ws);
            matchmakingQueue.push({
              ws,
              playerId: meta.playerId,
              username: meta.username,
              characterId: msg.characterId || 'vanguard',
            });
            ws.send(JSON.stringify({ type: 'matchmaking:queued', queueCount: matchmakingQueue.length }));

            // If 2+ players or after quick queue check, assign into a shared room
            if (matchmakingQueue.length >= 2) {
              const batch = matchmakingQueue.splice(0, 20);
              const roomId = `mm_${Date.now().toString(36)}`;
              const room: MultiplayerRoom = {
                roomId,
                roomCode: 'AUTO',
                name: 'Ranked Island Drop',
                hostId: batch[0].playerId,
                status: 'in_match',
                maxPlayers: 20,
                createdAt: Date.now(),
                players: batch.map((b, idx) => ({
                  playerId: b.playerId,
                  username: b.username,
                  characterId: b.characterId,
                  ready: true,
                  isHost: idx === 0,
                })),
              };
              rooms.set(roomId, room);
              for (const b of batch) {
                const m = clientSockets.get(b.ws);
                if (m) m.roomId = roomId;
                if (b.ws.readyState === WebSocket.OPEN) {
                  b.ws.send(JSON.stringify({ type: 'match:started', room }));
                }
              }
            }
            break;
          }

          case 'matchmaking:leave': {
            removeFromQueue(ws);
            break;
          }

          case 'game:state': {
            if (!meta.roomId) return;
            broadcastToRoom(
              meta.roomId,
              {
                type: 'game:remote_state',
                playerId: meta.playerId,
                ...msg.payload,
              },
              ws,
            );
            break;
          }
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      removeFromQueue(ws);
      leaveCurrentRoom(ws);
      clientSockets.delete(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BATTLE ROYALE MAX server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
