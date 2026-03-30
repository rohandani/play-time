import { Server, Socket } from "socket.io";
import {
  getUsername,
  joinQueue,
  leaveQueue,
  createRoom,
  getRoom,
  deleteRoom,
  registerGameStart,
} from "../core";

type TttState = {
  players: { socketId: string; username: string; symbol: "X" | "O" }[];
  board: (string | null)[];
  currentTurn: "X" | "O";
};

const GAME_TYPE = "tic-tac-toe";

function startTttRoom(
  io: Server,
  player1: { socketId: string; username: string },
  player2: { socketId: string; username: string }
) {
  const roomId = `ttt-${Date.now()}`;
  const players: TttState["players"] = [
    { ...player1, symbol: "X" },
    { ...player2, symbol: "O" },
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
    players: players.map((p) => ({ username: p.username, symbol: p.symbol })),
  });

  console.log(`TTT Match: ${player1.username} vs ${player2.username} in ${roomId}`);
}

// Register so core invite system can start a TTT game directly
registerGameStart(GAME_TYPE, startTttRoom);

export function registerTicTacToe(io: Server, socket: Socket) {
  // Random matchmaking
  socket.on("ttt-find-match", () => {
    const username = getUsername(socket.id);
    if (!username) return;

    const opponent = joinQueue(GAME_TYPE, socket.id, username);

    if (opponent) {
      startTttRoom(io, opponent, { socketId: socket.id, username });
    } else {
      socket.emit("ttt-waiting");
      console.log(`${username} waiting for TTT match`);
    }
  });

  // Cancel matchmaking
  socket.on("ttt-cancel-match", () => {
    leaveQueue(GAME_TYPE, socket.id);
  });

  // Make a move
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
      lastMove: { index, symbol: player.symbol, username: player.username },
    });
  });

  // Play again
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
      players: state.players.map((p) => ({ username: p.username, symbol: p.symbol })),
    });
  });

  // Leave game
  socket.on("ttt-leave", ({ roomId }: { roomId: string }) => {
    const room = getRoom<TttState>(roomId);
    if (!room) return;
    socket.to(roomId).emit("ttt-opponent-left");
    deleteRoom(roomId);
    socket.leave(roomId);
  });

  socket.on("disconnect", () => {
    leaveQueue(GAME_TYPE, socket.id);
  });
}
