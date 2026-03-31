"use client";

import { GameLayout } from "@/components/game-layout";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/socket-context";
import { useState, useCallback, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";

type Mode = "menu" | "pick-difficulty" | "computer" | "finding" | "waiting-invite" | "online";
type IncomingInvite = { inviteId: string; from: string; gameType: string };

const PIECE_MAP: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

function getSquares(flipped: boolean) {
  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;
  const squares: Square[] = [];
  for (const r of ranks) {
    for (const f of files) {
      squares.push((f + r) as Square);
    }
  }
  return squares;
}

type Difficulty = "easy" | "medium" | "hard";

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function computerBestMove(game: Chess, difficulty: Difficulty): string | null {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;

  if (difficulty === "easy") {
    // Mostly random, 20% chance of taking a capture
    const captures = moves.filter((m) => m.captured);
    if (captures.length > 0 && Math.random() > 0.8) {
      return captures[Math.floor(Math.random() * captures.length)].san;
    }
    return moves[Math.floor(Math.random() * moves.length)].san;
  }

  if (difficulty === "medium") {
    // Score each move simply: captures by piece value, checks get a bonus
    const scored = moves.map((m) => {
      let score = Math.random() * 2; // base randomness
      if (m.captured) score += PIECE_VALUES[m.captured] || 1;
      if (m.san.includes("+")) score += 3;
      // Avoid moving king unless necessary
      if (m.piece === "k") score -= 1;
      return { move: m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Pick from top 3 with some randomness
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(Math.random() * top.length)].move.san;
  }

  // Hard: minimax 2-ply lookahead
  function evaluate(g: Chess): number {
    let score = 0;
    const board = g.board();
    for (const row of board) {
      for (const sq of row) {
        if (!sq) continue;
        const val = PIECE_VALUES[sq.type] || 0;
        score += sq.color === "b" ? val : -val;
      }
    }
    if (g.isCheckmate()) score += g.turn() === "b" ? -900 : 900;
    return score;
  }

  let bestScore = -Infinity;
  let bestMoves: string[] = [];

  for (const move of moves) {
    game.move(move.san);
    // Opponent's best response
    const oppMoves = game.moves({ verbose: true });
    let worstCase = Infinity;
    if (oppMoves.length === 0) {
      worstCase = evaluate(game);
    } else {
      for (const opp of oppMoves) {
        game.move(opp.san);
        const val = evaluate(game);
        if (val < worstCase) worstCase = val;
        game.undo();
      }
    }
    game.undo();

    if (worstCase > bestScore) {
      bestScore = worstCase;
      bestMoves = [move.san];
    } else if (worstCase === bestScore) {
      bestMoves.push(move.san);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[0].san;
}

export default function ChessPage() {
  return (
    <Suspense>
      <ChessInner />
    </Suspense>
  );
}

function ChessInner() {
  const { user } = useAuth();
  const { socket, onlineUsers, connected } = useSocket();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pendingInviteId = searchParams.get("inviteId");

  const [mode, setMode] = useState<Mode>("menu");
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(game);
  const [fen, setFen] = useState(game.fen());
  const [myColor, setMyColor] = useState<"w" | "b">("w");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [gameOverMsg, setGameOverMsg] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [computerThinking, setComputerThinking] = useState(false);
  const [capturedPieces, setCapturedPieces] = useState<{ w: string[]; b: string[] }>({ w: [], b: [] });
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  const isFlipped = myColor === "b";
  const isMyTurn = mode === "computer" ? game.turn() === "w" : game.turn() === myColor;
  const squares = getSquares(isFlipped);

  // Keep ref in sync
  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    if (pendingInviteId && mode === "menu" && socket?.connected) {
      socket.emit("accept-invite", { inviteId: pendingInviteId });
      setMode("finding");
      router.replace("/games/chess");
    }
  }, [pendingInviteId, mode, router, socket, socket?.connected]);

  // Computer AI — difficulty-based
  useEffect(() => {
    if (mode !== "computer" || game.isGameOver() || game.turn() === "w") return;
    setComputerThinking(true);
    const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 1200 : 1500;
    const timer = setTimeout(() => {
      const move = computerBestMove(game, difficulty);
      if (move) {
        const result = game.move(move);
        if (result && result.captured) {
          const cap = PIECE_MAP[`w${result.captured}`] || result.captured;
          setCapturedPieces((prev) => ({
            ...prev,
            b: [...prev.b, cap],
          }));
        }
        setFen(game.fen());
        if (result) setLastMove({ from: result.from, to: result.to });
        checkGameOver();
      }
      setComputerThinking(false);
    }, delay + Math.random() * 500);
    return () => { clearTimeout(timer); setComputerThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fen]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onMatchFound = (data: {
      roomId: string;
      players: { username: string; color: "w" | "b" }[];
      fen: string;
    }) => {
      const me = data.players.find((p) => p.username === user?.username);
      const opp = data.players.find((p) => p.username !== user?.username);
      setMyColor(me?.color || "w");
      setOpponent(opp?.username || "Someone");
      setRoomId(data.roomId);
      const g = new Chess(data.fen);
      gameRef.current = g;
      setGame(g); setFen(data.fen);
      setOpponentLeft(false); setInviteSentTo(null); setGameOverMsg(null);
      setSelectedSquare(null); setLegalMoves([]); setLastMove(null);
      setMode("online");
    };

    const onUpdate = (data: {
      from: string; to: string; promotion?: string;
      fen: string; gameOver: boolean; result: string | null;
    }) => {
      const g = new Chess(data.fen);
      gameRef.current = g;
      setGame(g);
      setFen(data.fen);
      setLastMove({ from: data.from, to: data.to });
      setSelectedSquare(null); setLegalMoves([]);
      if (data.gameOver && data.result) setGameOverMsg(formatResult(data.result));
    };

    const onGameOver = (data: { result: string; resignedBy?: string }) => {
      setGameOverMsg(formatResult(data.result, data.resignedBy));
    };

    const onRestart = (data: {
      players: { username: string; color: "w" | "b" }[];
    }) => {
      const me = data.players.find((p) => p.username === user?.username);
      setMyColor(me?.color || "w");
      const g = new Chess();
      gameRef.current = g;
      setGame(g); setFen(g.fen());
      setGameOverMsg(null); setSelectedSquare(null); setLegalMoves([]); setLastMove(null);
    };

    const onOpponentLeft = () => { setOpponentLeft(true); setGameOverMsg("Your opponent left 😢"); };
    const onGameInvite = (data: IncomingInvite) => {
      if (data.gameType === "chess") setIncomingInvites((prev) => [...prev.filter((i) => i.inviteId !== data.inviteId), data]);
    };
    const onInviteDeclined = () => { setInviteSentTo(null); setMode("menu"); };

    socket.on("chess-match-found", onMatchFound);
    socket.on("chess-update", onUpdate);
    socket.on("chess-game-over", onGameOver);
    socket.on("chess-restart", onRestart);
    socket.on("chess-opponent-left", onOpponentLeft);
    socket.on("player-left", onOpponentLeft);
    socket.on("game-invite", onGameInvite);
    socket.on("invite-declined", onInviteDeclined);

    return () => {
      socket.off("chess-match-found", onMatchFound);
      socket.off("chess-update", onUpdate);
      socket.off("chess-game-over", onGameOver);
      socket.off("chess-restart", onRestart);
      socket.off("chess-opponent-left", onOpponentLeft);
      socket.off("player-left", onOpponentLeft);
      socket.off("game-invite", onGameInvite);
      socket.off("invite-declined", onInviteDeclined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.username]);

  function formatResult(result: string, resignedBy?: string): string {
    if (result.startsWith("resign-")) {
      const winner = result === "resign-w" ? "White" : "Black";
      return `${resignedBy || "Opponent"} resigned. ${winner} wins! 🏆`;
    }
    if (result.startsWith("checkmate-")) {
      const winner = result === "checkmate-w" ? "White" : "Black";
      return `Checkmate! ${winner} wins! 🏆`;
    }
    if (result === "stalemate") return "Stalemate! Draw 🤝";
    return "Draw! 🤝";
  }

  function checkGameOver() {
    if (game.isGameOver()) {
      let result = "draw";
      if (game.isCheckmate()) result = `checkmate-${game.turn() === "w" ? "b" : "w"}`;
      else if (game.isStalemate()) result = "stalemate";
      setGameOverMsg(formatResult(result));
      return { gameOver: true, result };
    }
    return { gameOver: false, result: null };
  }

  const handleSquareClick = useCallback((sq: Square) => {
    if (gameOverMsg || opponentLeft) return;
    if (mode === "computer" && game.turn() !== "w") return;
    if (mode === "online" && !isMyTurn) return;

    const piece = game.get(sq);

    if (selectedSquare && legalMoves.includes(sq)) {
      const movingPiece = game.get(selectedSquare);
      if (movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && sq[1] === "8") || (movingPiece.color === "b" && sq[1] === "1"))) {
        setPromotionPending({ from: selectedSquare, to: sq });
        return;
      }
      makeMove(selectedSquare, sq);
      return;
    }

    const currentColor = mode === "computer" ? "w" : myColor;
    if (piece && piece.color === currentColor && game.turn() === currentColor) {
      setSelectedSquare(sq);
      const moves = game.moves({ square: sq, verbose: true });
      setLegalMoves(moves.map((m) => m.to as Square));
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }, [selectedSquare, legalMoves, game, mode, myColor, isMyTurn, gameOverMsg, opponentLeft]);

  function makeMove(from: Square, to: Square, promotion?: string) {
    const moveObj: { from: string; to: string; promotion?: string } = { from, to };
    if (promotion) moveObj.promotion = promotion;
    const result = game.move(moveObj);
    if (!result) return;

    // Track captured pieces
    if (result.captured) {
      const capturedColor = result.color === "w" ? "w" : "b"; // who captured
      const capturedPieceChar = PIECE_MAP[`${result.color === "w" ? "b" : "w"}${result.captured}`] || result.captured;
      setCapturedPieces((prev) => ({
        ...prev,
        [capturedColor]: [...prev[capturedColor], capturedPieceChar],
      }));
    }

    setFen(game.fen());
    setLastMove({ from, to });
    setSelectedSquare(null); setLegalMoves([]); setPromotionPending(null);
    const status = checkGameOver();

    if (mode === "online" && roomId) {
      socket?.emit("chess-move", { roomId, from, to, promotion, fen: game.fen(), gameOver: status.gameOver, result: status.result });
    }
  }

  function handlePromotion(piece: string) {
    if (!promotionPending) return;
    makeMove(promotionPending.from, promotionPending.to, piece);
  }

  const startComputer = (diff: Difficulty) => {
    setDifficulty(diff);
    const g = new Chess();
    setGame(g); setFen(g.fen()); setMyColor("w"); setOpponent("Computer 🤖");
    setRoomId(null); setOpponentLeft(false); setGameOverMsg(null);
    setSelectedSquare(null); setLegalMoves([]); setLastMove(null); setCapturedPieces({ w: [], b: [] }); setMode("computer");
  };
  const findRandomMatch = () => { setMode("finding"); socket?.emit("chess-find-match"); };
  const inviteFriend = (username: string) => {
    socket?.emit("send-invite", { gameType: "chess", toUsername: username });
    setInviteSentTo(username); setMode("waiting-invite");
  };
  const acceptInvite = (inviteId: string) => {
    socket?.emit("accept-invite", { inviteId });
    setIncomingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId)); setMode("finding");
  };
  const declineInvite = (inviteId: string) => {
    socket?.emit("decline-invite", { inviteId });
    setIncomingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
  };
  const cancelFind = () => { socket?.emit("chess-cancel-match"); setInviteSentTo(null); setMode("menu"); };
  const playAgain = () => {
    if (mode === "computer") startComputer(difficulty);
    else if (mode === "online" && roomId) socket?.emit("chess-play-again", { roomId });
  };
  const resign = () => { if (mode === "online" && roomId) socket?.emit("chess-resign", { roomId }); };
  const backToMenu = () => {
    if (roomId) socket?.emit("chess-leave", { roomId });
    socket?.emit("chess-cancel-match"); setMode("menu");
    const g = new Chess(); setGame(g); setFen(g.fen());
    setRoomId(null); setOpponent(null); setOpponentLeft(false); setGameOverMsg(null); setInviteSentTo(null);
  };

  const otherUsers = onlineUsers.filter((u) => u.username !== user?.username);
  const chessInvites = incomingInvites.filter((i) => i.gameType === "chess");

  // --- MENU ---
  if (mode === "menu" || mode === "waiting-invite") {
    return (
      <GameLayout title="Chess" emoji="♟️">
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {chessInvites.length > 0 && (
            <div className="w-full space-y-2">
              {chessInvites.map((inv) => (
                <div key={inv.inviteId} className="w-full bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-3 flex items-center gap-3 animate-pulse">
                  <span className="text-2xl">📩</span>
                  <div className="flex-1"><p className="text-sm font-black text-gray-700 capitalize">{inv.from} wants to play chess!</p></div>
                  <button onClick={() => acceptInvite(inv.inviteId)} className="px-3 py-1.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 active:scale-95 transition-all">Play ✓</button>
                  <button onClick={() => declineInvite(inv.inviteId)} className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-xl text-sm font-bold hover:bg-gray-300 active:scale-95 transition-all">No</button>
                </div>
              ))}
            </div>
          )}
          <div className="text-center">
            <p className="text-5xl mb-2">♟️</p>
            <h2 className="text-2xl font-black text-gray-700">How do you want to play?</h2>
          </div>
          <button onClick={() => setMode("pick-difficulty")} className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform">
            <p className="text-lg font-black">🤖 Play vs Computer</p>
            <p className="text-sm font-semibold opacity-90">Pick your difficulty!</p>
          </button>
          <button onClick={findRandomMatch} disabled={!connected || mode === "waiting-invite"} className="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100">
            <p className="text-lg font-black">🎲 Random Match</p>
            <p className="text-sm font-semibold opacity-90">Play with anyone online!</p>
          </button>
          {connected && otherUsers.length > 0 && (
            <div className="w-full bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-400 mb-3">👫 Invite a Friend</p>
              <div className="space-y-2">
                {otherUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      <span className="text-sm font-bold text-gray-600 capitalize">{u.username}</span>
                    </div>
                    {inviteSentTo === u.username ? (
                      <span className="text-xs font-bold text-orange-400 animate-pulse">Waiting... ⏳</span>
                    ) : (
                      <button onClick={() => inviteFriend(u.username)} disabled={mode === "waiting-invite"} className="px-3 py-1.5 bg-teal-500 text-white rounded-xl text-xs font-bold hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50">Invite ▶</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {mode === "waiting-invite" && (
            <div className="text-center">
              <p className="text-sm font-bold text-orange-400 animate-pulse">Waiting for {inviteSentTo} to accept... ⏳</p>
              <button onClick={cancelFind} className="mt-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all">Cancel</button>
            </div>
          )}
          {connected && otherUsers.length === 0 && <p className="text-sm font-semibold text-gray-300 text-center">No friends online yet 🙂</p>}
          {!connected && <p className="text-sm font-semibold text-gray-300 text-center">Connecting... ⏳</p>}
        </div>
      </GameLayout>
    );
  }

  // --- DIFFICULTY PICKER ---
  if (mode === "pick-difficulty") {
    return (
      <GameLayout title="Chess" emoji="♟️">
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          <div className="text-center">
            <p className="text-5xl mb-2">🤖</p>
            <h2 className="text-2xl font-black text-gray-700">Pick Difficulty</h2>
            <p className="text-sm font-semibold text-gray-400 mt-1">How smart should the computer be?</p>
          </div>

          <button
            onClick={() => startComputer("easy")}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-black">🌱 Easy</p>
            <p className="text-sm font-semibold opacity-90">Just learning? Start here!</p>
          </button>

          <button
            onClick={() => startComputer("medium")}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-400 to-amber-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-black">⚡ Medium</p>
            <p className="text-sm font-semibold opacity-90">A bit of a challenge!</p>
          </button>

          <button
            onClick={() => startComputer("hard")}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-black">🔥 Hard</p>
            <p className="text-sm font-semibold opacity-90">Think you can beat me?</p>
          </button>

          <button
            onClick={() => setMode("menu")}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all"
          >
            ← Back
          </button>
        </div>
      </GameLayout>
    );
  }

  if (mode === "finding") {
    return (
      <GameLayout title="Chess" emoji="♟️">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl animate-bounce">🔍</div>
          <p className="text-xl font-black text-gray-600">Looking for a player...</p>
          <button onClick={cancelFind} className="mt-4 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-2xl font-bold text-base active:scale-95 transition-all">Cancel</button>
        </div>
      </GameLayout>
    );
  }

  // --- GAME BOARD ---
  const turnLabel = game.turn() === "w" ? "White" : "Black";
  const inCheck = game.inCheck();

  const statusText = gameOverMsg
    ? gameOverMsg
    : opponentLeft
    ? "Opponent left 😢"
    : computerThinking
    ? "Computer is thinking... 🤔"
    : `${turnLabel}'s Turn${inCheck ? " — Check! ⚠️" : ""}`;
  const statusColor = gameOverMsg ? "text-teal-600" : inCheck ? "text-red-500" : computerThinking ? "text-purple-400" : isMyTurn ? "text-teal-600" : "text-gray-400";

  const fileLabels = isFlipped ? [...FILES].reverse() : FILES;
  const rankLabels = isFlipped ? ["1","2","3","4","5","6","7","8"] : ["8","7","6","5","4","3","2","1"];

  return (
    <GameLayout title="Chess" emoji="♟️" roomId={roomId || undefined}>
      <div className="flex flex-col items-center gap-3">
        {/* Player indicators */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${game.turn() === myColor && !gameOverMsg ? "bg-teal-100 ring-2 ring-teal-400" : "bg-gray-50"}`}>
            <span className="text-lg">{myColor === "w" ? "⬜" : "⬛"}</span>
            <span className="text-xs font-bold text-gray-500 capitalize">{user?.username}</span>
          </div>
          <span className="text-sm font-bold text-gray-300">vs</span>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${game.turn() !== myColor && !gameOverMsg ? "bg-pink-100 ring-2 ring-pink-400" : "bg-gray-50"}`}>
            <span className="text-lg">{myColor === "w" ? "⬛" : "⬜"}</span>
            <span className="text-xs font-bold text-gray-500 capitalize">{opponent}</span>
          </div>
        </div>

        {/* Captured pieces - opponent's captures (top) */}
        <div className="flex items-center gap-0.5 min-h-[24px] text-lg">
          {capturedPieces[myColor === "w" ? "b" : "w"].map((p, i) => <span key={i}>{p}</span>)}
        </div>

        <p className={`text-lg font-black ${statusColor}`}>{statusText}</p>

        {/* Promotion dialog */}
        {promotionPending && (
          <div className="flex gap-2 bg-white rounded-2xl p-3 shadow-lg border-2 border-amber-400">
            <p className="text-sm font-bold text-gray-500 mr-2 self-center">Promote to:</p>
            {["q", "r", "b", "n"].map((p) => (
              <button key={p} onClick={() => handlePromotion(p)} className="w-12 h-12 bg-amber-50 rounded-xl text-2xl flex items-center justify-center hover:bg-amber-100 active:scale-95 transition-all border border-amber-300">
                {PIECE_MAP[`${myColor}${p}`]}
              </button>
            ))}
          </div>
        )}

        {/* Board with rank/file labels */}
        <div className="flex flex-col">
          <div className="flex">
            <div className="w-4 sm:w-5" /> {/* spacer for rank labels */}
            {fileLabels.map((f) => (
              <div key={f} className="w-10 h-4 sm:w-12 sm:h-5 flex items-center justify-center text-[10px] sm:text-xs font-bold text-gray-400 uppercase">{f}</div>
            ))}
          </div>
          <div className="flex">
            <div className="flex flex-col">
              {rankLabels.map((r) => (
                <div key={r} className="w-4 sm:w-5 h-10 sm:h-12 flex items-center justify-center text-[10px] sm:text-xs font-bold text-gray-400">{r}</div>
              ))}
            </div>
            <div className="grid grid-cols-8 rounded-xl overflow-hidden shadow-lg border-2 border-amber-800/30">
              {squares.map((sq) => {
                const file = sq.charCodeAt(0) - 97;
                const rank = parseInt(sq[1]) - 1;
                const isDark = (file + rank) % 2 === 0;
                const piece = game.get(sq);
                const isSelected = selectedSquare === sq;
                const isLegal = legalMoves.includes(sq);
                const isLastMove = lastMove && (lastMove.from === sq || lastMove.to === sq);
                const isKingInCheck = inCheck && piece?.type === "k" && piece?.color === game.turn();

                return (
                  <button
                    key={sq}
                    onClick={() => handleSquareClick(sq)}
                    className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-2xl sm:text-3xl relative transition-all
                      ${isDark ? "bg-amber-700" : "bg-amber-200"}
                      ${isSelected ? "ring-2 ring-inset ring-yellow-400 !bg-yellow-300/70" : ""}
                      ${isLastMove && !isSelected ? "!bg-yellow-300/40" : ""}
                      ${isKingInCheck ? "!bg-red-400/60" : ""}
                      hover:brightness-110`}
                    aria-label={`${sq} ${piece ? PIECE_MAP[piece.color + piece.type] : "empty"}`}
                  >
                    {piece && (
                      <span
                        className={`${piece.color === "w"
                          ? "[text-shadow:_-1px_0_1px_rgba(0,0,0,0.6),_0_1px_1px_rgba(0,0,0,0.6),_1px_0_1px_rgba(0,0,0,0.6),_0_-1px_1px_rgba(0,0,0,0.6)]"
                          : "drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]"
                        }`}
                      >
                        {PIECE_MAP[piece.color + piece.type]}
                      </span>
                    )}
                    {isLegal && !piece && (
                      <span className="absolute w-3.5 h-3.5 rounded-full bg-black/25" />
                    )}
                    {isLegal && piece && (
                      <span className="absolute inset-0.5 rounded-sm ring-[3px] ring-inset ring-black/25" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Captured pieces - my captures (bottom) */}
        <div className="flex items-center gap-0.5 min-h-[24px] text-lg">
          {capturedPieces[myColor].map((p, i) => <span key={i}>{p}</span>)}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-1 flex-wrap justify-center">
          {gameOverMsg && (
            <button onClick={playAgain} disabled={opponentLeft} className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all disabled:opacity-50">Play Again! 🔄</button>
          )}
          {!gameOverMsg && mode === "online" && (
            <button onClick={resign} className="px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-500 rounded-2xl font-bold text-sm active:scale-95 transition-all">Resign 🏳️</button>
          )}
          <button onClick={backToMenu} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-2xl font-bold text-sm active:scale-95 transition-all">Back</button>
        </div>
      </div>
    </GameLayout>
  );
}
