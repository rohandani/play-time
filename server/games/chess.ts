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

type ChessState = {
    players: { socketId: string; username: string; color: "w" | "b" }[];
    fen: string;
    currentTurn: "w" | "b";
    gameOver: boolean;
    result: string | null; // "checkmate-w", "checkmate-b", "stalemate", "draw", etc.
};

const GAME_TYPE = "chess";
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function startChessRoom(
    io: Server,
    player1: { socketId: string; username: string },
    player2: { socketId: string; username: string }
) {
    const roomId = `chess-${Date.now()}`;
    // Randomly assign colors
    const rand = Math.random() < 0.5;
    const players: ChessState["players"] = [
        { ...player1, color: rand ? "w" : "b" },
        { ...player2, color: rand ? "b" : "w" },
    ];

    createRoom<ChessState>(roomId, players, {
        players,
        fen: INITIAL_FEN,
        currentTurn: "w",
        gameOver: false,
        result: null,
    });

    io.sockets.sockets.get(player1.socketId)?.join(roomId);
    io.sockets.sockets.get(player2.socketId)?.join(roomId);

    io.to(roomId).emit("chess-match-found", {
        roomId,
        players: players.map((p) => ({ username: p.username, color: p.color })),
        fen: INITIAL_FEN,
    });

    console.log(`Chess Match: ${player1.username} vs ${player2.username} in ${roomId}`);
}

registerGameStart(GAME_TYPE, startChessRoom);

export function registerChess(io: Server, socket: Socket) {
    // Random matchmaking
    socket.on("chess-find-match", () => {
        const username = getUsername(socket.id);
        if (!username) return;

        const opponent = joinQueue(GAME_TYPE, socket.id, username);
        if (opponent) {
            startChessRoom(io, opponent, { socketId: socket.id, username });
        } else {
            socket.emit("chess-waiting");
        }
    });

    socket.on("chess-cancel-match", () => {
        leaveQueue(GAME_TYPE, socket.id);
    });

    // Move — client sends the move, server validates via FEN reconstruction
    // We trust the client's chess.js validation but also store the FEN
    socket.on("chess-move", ({ roomId, from, to, promotion, fen, gameOver, result }:
        { roomId: string; from: string; to: string; promotion?: string; fen: string; gameOver: boolean; result: string | null }) => {
        const room = getRoom<ChessState>(roomId);
        if (!room) return;

        const state = room.state;
        const player = state.players.find((p) => p.socketId === socket.id);
        if (!player || player.color !== state.currentTurn) return;

        state.fen = fen;
        state.currentTurn = state.currentTurn === "w" ? "b" : "w";
        state.gameOver = gameOver;
        state.result = result;

        io.to(roomId).emit("chess-update", {
            from,
            to,
            promotion,
            fen: state.fen,
            currentTurn: state.currentTurn,
            gameOver: state.gameOver,
            result: state.result,
        });
    });

    // Resign
    socket.on("chess-resign", ({ roomId }: { roomId: string }) => {
        const room = getRoom<ChessState>(roomId);
        if (!room) return;

        const player = room.state.players.find((p) => p.socketId === socket.id);
        if (!player) return;

        const winner = player.color === "w" ? "b" : "w";
        room.state.gameOver = true;
        room.state.result = `resign-${winner}`;

        io.to(roomId).emit("chess-game-over", {
            result: `resign-${winner}`,
            resignedBy: player.username,
        });
    });

    // Play again
    socket.on("chess-play-again", ({ roomId }: { roomId: string }) => {
        const room = getRoom<ChessState>(roomId);
        if (!room) return;

        const state = room.state;
        state.fen = INITIAL_FEN;
        state.currentTurn = "w";
        state.gameOver = false;
        state.result = null;
        // Swap colors
        state.players.forEach((p) => {
            p.color = p.color === "w" ? "b" : "w";
        });

        io.to(roomId).emit("chess-restart", {
            players: state.players.map((p) => ({ username: p.username, color: p.color })),
            fen: INITIAL_FEN,
        });
    });

    // Leave
    socket.on("chess-leave", ({ roomId }: { roomId: string }) => {
        const room = getRoom<ChessState>(roomId);
        if (!room) return;
        socket.to(roomId).emit("chess-opponent-left");
        deleteRoom(roomId);
        socket.leave(roomId);
    });

    socket.on("disconnect", () => {
        leaveQueue(GAME_TYPE, socket.id);
    });
}
