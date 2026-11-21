import { LeaderboardEntry, MatchRecord, MultiplayerRoom } from '../types/game';

type RoomEventHandler = {
  onRoomsList?: (rooms: MultiplayerRoom[]) => void;
  onRoomJoined?: (room: MultiplayerRoom) => void;
  onRoomUpdated?: (room: MultiplayerRoom) => void;
  onRoomLeft?: () => void;
  onMatchStarted?: (room: MultiplayerRoom) => void;
  onRemoteState?: (payload: {
    playerId: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    armor: number;
    alive: boolean;
  }) => void;
  onError?: (msg: string) => void;
};

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private handlers: RoomEventHandler = {};
  private reconnectTimer: number | null = null;
  private playerId = '';
  private username = 'Operative';

  public setHandlers(handlers: RoomEventHandler) {
    this.handlers = handlers;
  }

  public connect(playerId: string, username: string) {
    this.playerId = playerId;
    this.username = username;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.identify(playerId, username);
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.identify(this.playerId, this.username);
      };
      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          switch (data.type) {
            case 'rooms:list':
              this.handlers.onRoomsList?.(data.rooms);
              break;
            case 'room:joined':
              this.handlers.onRoomJoined?.(data.room);
              break;
            case 'room:updated':
              this.handlers.onRoomUpdated?.(data.room);
              break;
            case 'room:left':
              this.handlers.onRoomLeft?.();
              break;
            case 'match:started':
              this.handlers.onMatchStarted?.(data.room);
              break;
            case 'game:remote_state':
              this.handlers.onRemoteState?.(data);
              break;
            case 'room:error':
              this.handlers.onError?.(data.message);
              break;
          }
        } catch {
          // ignore
        }
      };
      this.ws.onclose = () => {
        if (this.reconnectTimer === null) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.playerId, this.username);
          }, 3000);
        }
      };
    } catch {
      // Offline / capacitor standalone fallback
    }
  }

  private send(obj: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  public identify(playerId: string, username: string) {
    this.playerId = playerId;
    this.username = username;
    this.send({ type: 'auth:identify', playerId, username });
  }

  public createRoom(name: string, characterId: string) {
    this.send({ type: 'room:create', name, characterId });
  }

  public joinRoom(roomIdOrCode: string, characterId: string, byCode = false) {
    this.send(
      byCode
        ? { type: 'room:join', roomCode: roomIdOrCode, characterId }
        : { type: 'room:join', roomId: roomIdOrCode, characterId },
    );
  }

  public leaveRoom() {
    this.send({ type: 'room:leave' });
  }

  public toggleReady() {
    this.send({ type: 'room:ready' });
  }

  public startRoomMatch() {
    this.send({ type: 'room:start' });
  }

  public joinMatchmaking(characterId: string) {
    this.send({ type: 'matchmaking:join', characterId });
  }

  public leaveMatchmaking() {
    this.send({ type: 'matchmaking:leave' });
  }

  public sendGameState(payload: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    armor: number;
    alive: boolean;
  }) {
    this.send({ type: 'game:state', payload });
  }
}

export const multiplayerClient = new MultiplayerClient();

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return [];
    const json = await res.json();
    return json.leaderboard || [];
  } catch {
    return [];
  }
}

export async function fetchRooms(): Promise<MultiplayerRoom[]> {
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return [];
    const json = await res.json();
    return json.rooms || [];
  } catch {
    return [];
  }
}

export async function submitMatchResult(payload: {
  playerId: string;
  username: string;
  rankTier: string;
  match: MatchRecord;
}): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.leaderboard || [];
  } catch {
    return [];
  }
}
