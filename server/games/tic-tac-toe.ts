import { Server, Socket } from "socket.io";
import {
  getUsername,
  joinQueue,
  leaveQueue,
  createRoom,
  getRoom,
  deleteRoom,
  registerGameStart,
  registerPreStart,
} from "../core";

type TttPlayer = {
  socketId: string;
  username: string;
  symbol: "X" | "O";
  character: string; // emoji chosen by player
};

type TttState = {
  players: TttPlayer[];
  board: (string | null)[];
  currentTurn: "X" | "O";
};

const GAME_TYPE = "tic-tac-toe";

// Store chosen characters per socket (set before match starts)
const playerCharacters = new Map<string, string>();

function startTttRoom(
  io: Server,
  player1: { socketId: string; username: string },
  player2: { socketId: string; username: string }
) {
  const roomId = `ttt-${Date.now()}`;
  const players: TttPlayer[] = [
    { ...player1, symbol: "X", character: playerCharacters.get(player1.socketId) || "❌" },
    { ...player2, symbol: "O", character: playerCharacters.get(player2.socketId) || "⭕" },
  ];

  createRoom<TttState>(roomId, players, {
    players,
    board: Array(9).fill(null),
    currentTurn: "X",
  });

  io.sockets.sockets.get(player1.socketId)?.join(roomId);
  io.sockets.sockets.get(player2.socketId)?.join(roomId);

  io.to(roomId).emit("ttt-match-found", {
    roomId,
    players: players.map((p) => ({
      username: p.username,
      symbol: p.symbol,
      character: p.character,
    })),
  });

  console.log(`TTT Match: ${player1.username}(${players[0].character}) vs ${player2.username}(${players[1].character}) in ${roomId}`);
}

registerGameStart(GAME_TYPE, startTttRoom);

// Handle character set from accept-invite meta
registerPreStart(GAME_TYPE, (socketId, meta) => {
  if (meta.character && typeof meta.character === "string") {
    playerCharacters.set(socketId, meta.character);
  }
});

export function registerTicTacToe(io: Server, socket: Socket) {
  // Player sets their character before finding a match
  socket.on("ttt-set-character", (character: string) => {
    playerCharacters.set(socket.id, character);
  });

  // Random matchmaking
  socket.on("ttt-find-match", () => {
    const username = getUsername(socket.id);
    if (!username) return;

    const opponent = joinQueue(GAME_TYPE, socket.id, username);

    if (opponent) {
      startTttRoom(io, opponent, { socketId: socket.id, username });
    } else {
      socket.emit("ttt-waiting");
    }
  });

  socket.on("ttt-cancel-match", () => {
    leaveQueue(GAME_TYPE, socket.id);
  });

  socket.on("ttt-move", ({ roomId, index }: { roomId: string; index: number }) => {
    const room = getRoom<TttState>(roomId);
    if (!room) return;

    const state = room.state;
    const player = state.players.find((p) => p.socketId === socket.id);
    if (!player || player.symbol !== state.currentTurn) return;
    if (state.board[index] !== null) return;

    state.board[index] = player.symbol;
    state.currentTurn = state.currentTurn === "X" ? "O" : "X";

    io.to(roomId).emit("ttt-update", {
      board: state.board,
      currentTurn: state.currentTurn,
    });
  });

  socket.on("ttt-play-again", ({ roomId }: { roomId: string }) => {
    const room = getRoom<TttState>(roomId);
    if (!room) return;

    const state = room.state;
    state.board = Array(9).fill(null);
    state.currentTurn = "X";
    state.players.forEach((p) => {
      p.symbol = p.symbol === "X" ? "O" : "X";
    });

    io.to(roomId).emit("ttt-restart", {
      players: state.players.map((p) => ({
        username: p.username,
        symbol: p.symbol,
        character: p.character,
      })),
    });
  });

  socket.on("ttt-leave", ({ roomId }: { roomId: string }) => {
    const room = getRoom<TttState>(roomId);
    if (!room) return;
    socket.to(roomId).emit("ttt-opponent-left");
    deleteRoom(roomId);
    socket.leave(roomId);
  });

  socket.on("disconnect", () => {
    leaveQueue(GAME_TYPE, socket.id);
    playerCharacters.delete(socket.id);
  });
}
