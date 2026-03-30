"use client";

import { GameLayout } from "@/components/game-layout";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/socket-context";
import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Cell = "X" | "O" | null;
type Mode = "menu" | "pick-character" | "computer" | "finding" | "waiting-invite" | "online";
type IncomingInvite = { inviteId: string; from: string; gameType: string };
type PlayIntent = "computer" | "random" | { invite: string } | { acceptInvite: string };

const CHARACTERS = [
  "🦊", "🐼", "🦄", "🦁", "🐱", "🐶", "🐸", "🐵",
  "🌟", "🔥", "💎", "🍕", "🎸", "🚀", "⚡", "🌈",
  "🦋", "🐙", "🍩", "🎯", "🏀", "🎮", "👾", "🤖",
];

const WINNING = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Cell[]): Cell {
  for (const [a, b, c] of WINNING) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function isDraw(board: Cell[]): boolean {
  return !checkWinner(board) && board.every((c) => c !== null);
}

function computerMove(board: Cell[]): number {
  for (let i = 0; i < 9; i++) {
    if (!board[i]) { const t = [...board]; t[i] = "O"; if (checkWinner(t) === "O") return i; }
  }
  for (let i = 0; i < 9; i++) {
    if (!board[i]) { const t = [...board]; t[i] = "X"; if (checkWinner(t) === "X") return i; }
  }
  if (!board[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

export default function TicTacToePage() {
  const { user } = useAuth();
  const { socket, onlineUsers, connected } = useSocket();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pendingInviteId = searchParams.get("inviteId");

  const [mode, setMode] = useState<Mode>("menu");
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true);
  const [mySymbol, setMySymbol] = useState<"X" | "O">("X");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);

  // Character state
  const [myCharacter, setMyCharacter] = useState("🦊");
  const [opponentCharacter, setOpponentCharacter] = useState("🤖");
  const [playIntent, setPlayIntent] = useState<PlayIntent>("computer");

  // If we arrived with a pending invite, go straight to character picker
  useEffect(() => {
    if (pendingInviteId && mode === "menu") {
      setPlayIntent({ acceptInvite: pendingInviteId });
      setMode("pick-character");
      // Clean the URL so refreshing doesn't re-trigger
      router.replace("/games/tic-tac-toe");
    }
  }, [pendingInviteId, mode, router]);

  const winner = checkWinner(board);
  const draw = isDraw(board);
  const isMyTurn = mode === "computer" ? isXTurn : mySymbol === (isXTurn ? "X" : "O");

  // Character display helpers
  const xChar = mySymbol === "X" ? myCharacter : opponentCharacter;
  const oChar = mySymbol === "O" ? myCharacter : opponentCharacter;

  // Computer AI
  useEffect(() => {
    if (mode !== "computer" || winner || draw || isXTurn) return;
    const timer = setTimeout(() => {
      const move = computerMove(board);
      if (move >= 0) {
        const next = [...board];
        next[move] = "O";
        setBoard(next);
        setIsXTurn(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mode, board, isXTurn, winner, draw]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onMatchFound = (data: {
      roomId: string;
      players: { username: string; symbol: "X" | "O"; character: string }[];
    }) => {
      setRoomId(data.roomId);
      const me = data.players.find((p) => p.username === user?.username);
      const opp = data.players.find((p) => p.username !== user?.username);
      setMySymbol(me?.symbol || "X");
      setMyCharacter(me?.character || "🦊");
      setOpponent(opp?.username || "Someone");
      setOpponentCharacter(opp?.character || "⭕");
      setBoard(Array(9).fill(null));
      setIsXTurn(true);
      setOpponentLeft(false);
      setInviteSentTo(null);
      setMode("online");
    };

    const onUpdate = (data: { board: Cell[]; currentTurn: "X" | "O" }) => {
      setBoard(data.board);
      setIsXTurn(data.currentTurn === "X");
    };

    const onRestart = (data: {
      players: { username: string; symbol: "X" | "O"; character: string }[];
    }) => {
      const me = data.players.find((p) => p.username === user?.username);
      const opp = data.players.find((p) => p.username !== user?.username);
      setMySymbol(me?.symbol || "X");
      setMyCharacter(me?.character || "🦊");
      setOpponentCharacter(opp?.character || "⭕");
      setBoard(Array(9).fill(null));
      setIsXTurn(true);
    };

    const onOpponentLeft = () => setOpponentLeft(true);

    const onGameInvite = (data: IncomingInvite) => {
      if (data.gameType === "tic-tac-toe") {
        setIncomingInvites((prev) => [...prev.filter((i) => i.inviteId !== data.inviteId), data]);
      }
    };

    const onInviteDeclined = () => {
      setInviteSentTo(null);
      setMode("menu");
    };

    socket.on("ttt-match-found", onMatchFound);
    socket.on("ttt-update", onUpdate);
    socket.on("ttt-restart", onRestart);
    socket.on("ttt-opponent-left", onOpponentLeft);
    socket.on("player-left", onOpponentLeft);
    socket.on("game-invite", onGameInvite);
    socket.on("invite-declined", onInviteDeclined);

    return () => {
      socket.off("ttt-match-found", onMatchFound);
      socket.off("ttt-update", onUpdate);
      socket.off("ttt-restart", onRestart);
      socket.off("ttt-opponent-left", onOpponentLeft);
      socket.off("player-left", onOpponentLeft);
      socket.off("game-invite", onGameInvite);
      socket.off("invite-declined", onInviteDeclined);
    };
  }, [socket, user?.username]);

  // --- Actions ---
  const handleClick = useCallback(
    (i: number) => {
      if (board[i] || winner || draw) return;
      if (mode === "computer") {
        if (!isXTurn) return;
        const next = [...board]; next[i] = "X"; setBoard(next); setIsXTurn(false);
      } else if (mode === "online" && roomId) {
        if (!isMyTurn) return;
        socket?.emit("ttt-move", { roomId, index: i });
      }
    },
    [board, winner, draw, mode, isXTurn, isMyTurn, roomId, socket]
  );

  // Step 1: user picks intent, then goes to character picker
  const pickAndPlay = (intent: PlayIntent) => {
    setPlayIntent(intent);
    setMode("pick-character");
  };

  // Step 2: user picks character, then starts the game/matchmaking
  const confirmCharacter = (char: string) => {
    setMyCharacter(char);

    if (playIntent === "computer") {
      const others = CHARACTERS.filter((c) => c !== char);
      setOpponentCharacter(others[Math.floor(Math.random() * others.length)]);
      setMode("computer");
      setBoard(Array(9).fill(null));
      setIsXTurn(true);
      setMySymbol("X");
      setOpponent("Computer 🤖");
      setRoomId(null);
      setOpponentLeft(false);
    } else if (playIntent === "random") {
      socket?.emit("ttt-set-character", char);
      setMode("finding");
      socket?.emit("ttt-find-match");
    } else if (typeof playIntent === "object" && "invite" in playIntent) {
      socket?.emit("ttt-set-character", char);
      socket?.emit("send-invite", { gameType: "tic-tac-toe", toUsername: playIntent.invite });
      setInviteSentTo(playIntent.invite);
      setMode("waiting-invite");
    } else if (typeof playIntent === "object" && "acceptInvite" in playIntent) {
      // Pass character in accept payload so server has it before creating the room
      socket?.emit("accept-invite", {
        inviteId: (playIntent as { acceptInvite: string }).acceptInvite,
        meta: { character: char },
      });
      setMode("finding");
    }
  };

  const acceptInvite = (inviteId: string) => {
    // Go to character picker first, then accept after picking
    setPlayIntent({ acceptInvite: inviteId });
    setMode("pick-character");
  };

  const declineInvite = (inviteId: string) => {
    socket?.emit("decline-invite", { inviteId });
    setIncomingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
  };

  const cancelFind = () => {
    socket?.emit("ttt-cancel-match");
    setInviteSentTo(null);
    setMode("menu");
  };

  const playAgain = () => {
    if (mode === "computer") { setBoard(Array(9).fill(null)); setIsXTurn(true); }
    else if (mode === "online" && roomId) { socket?.emit("ttt-play-again", { roomId }); }
  };

  const backToMenu = () => {
    if (roomId) socket?.emit("ttt-leave", { roomId });
    socket?.emit("ttt-cancel-match");
    setMode("menu"); setBoard(Array(9).fill(null)); setRoomId(null);
    setOpponent(null); setOpponentLeft(false); setInviteSentTo(null);
  };

  const otherUsers = onlineUsers.filter((u) => u.username !== user?.username);
  const tttInvites = incomingInvites.filter((i) => i.gameType === "tic-tac-toe");

  // --- CHARACTER PICKER ---
  if (mode === "pick-character") {
    return (
      <GameLayout title="Tic Tac Toe" emoji="❌⭕">
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          <div className="text-center">
            <p className="text-5xl mb-2">🎭</p>
            <h2 className="text-2xl font-black text-gray-700">Pick Your Character!</h2>
            <p className="text-sm font-semibold text-gray-400 mt-1">
              This will be your piece on the board
            </p>
          </div>

          <div className="grid grid-cols-6 gap-2 w-full">
            {CHARACTERS.map((char) => (
              <button
                key={char}
                onClick={() => confirmCharacter(char)}
                className={`w-full aspect-square rounded-2xl text-2xl sm:text-3xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${myCharacter === char
                  ? "bg-teal-100 border-2 border-teal-400 shadow-md"
                  : "bg-white border-2 border-gray-100 shadow-sm hover:border-teal-200"
                  }`}
                aria-label={`Pick ${char}`}
              >
                {char}
              </button>
            ))}
          </div>

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

  // --- MENU ---
  if (mode === "menu" || mode === "waiting-invite") {
    return (
      <GameLayout title="Tic Tac Toe" emoji="❌⭕">
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {tttInvites.length > 0 && (
            <div className="w-full space-y-2">
              {tttInvites.map((inv) => (
                <div
                  key={inv.inviteId}
                  className="w-full bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-3 flex items-center gap-3 animate-pulse"
                >
                  <span className="text-2xl">📩</span>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-700 capitalize">
                      {inv.from} wants to play!
                    </p>
                  </div>
                  <button
                    onClick={() => acceptInvite(inv.inviteId)}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 active:scale-95 transition-all"
                  >
                    Play ✓
                  </button>
                  <button
                    onClick={() => declineInvite(inv.inviteId)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-xl text-sm font-bold hover:bg-gray-300 active:scale-95 transition-all"
                  >
                    No
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="text-center">
            <p className="text-5xl mb-2">❌⭕</p>
            <h2 className="text-2xl font-black text-gray-700">How do you want to play?</h2>
          </div>

          <button
            onClick={() => pickAndPlay("computer")}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-black">🤖 Play vs Computer</p>
            <p className="text-sm font-semibold opacity-90">Practice your skills!</p>
          </button>

          <button
            onClick={() => pickAndPlay("random")}
            disabled={!connected || mode === "waiting-invite"}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100"
          >
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
                      <button
                        onClick={() => pickAndPlay({ invite: u.username })}
                        disabled={mode === "waiting-invite"}
                        className="px-3 py-1.5 bg-teal-500 text-white rounded-xl text-xs font-bold hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50"
                      >
                        Invite ▶
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "waiting-invite" && (
            <div className="text-center">
              <p className="text-sm font-bold text-orange-400 animate-pulse">
                Waiting for {inviteSentTo} to accept... ⏳
              </p>
              <button onClick={cancelFind} className="mt-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all">
                Cancel
              </button>
            </div>
          )}

          {connected && otherUsers.length === 0 && (
            <p className="text-sm font-semibold text-gray-300 text-center">No friends online yet 🙂</p>
          )}
          {!connected && (
            <p className="text-sm font-semibold text-gray-300 text-center">Connecting... ⏳</p>
          )}
        </div>
      </GameLayout>
    );
  }

  // --- FINDING RANDOM MATCH ---
  if (mode === "finding") {
    return (
      <GameLayout title="Tic Tac Toe" emoji="❌⭕">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl animate-bounce">🔍</div>
          <p className="text-xl font-black text-gray-600">Looking for a player...</p>
          <p className="text-sm font-semibold text-gray-400">You&apos;re playing as {myCharacter}</p>
          <button onClick={cancelFind} className="mt-4 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-2xl font-bold text-base active:scale-95 transition-all">
            Cancel
          </button>
        </div>
      </GameLayout>
    );
  }

  // --- GAME BOARD ---
  const getStatus = () => {
    if (opponentLeft) return { text: "Your friend left 😢", color: "text-orange-500" };
    if (winner) {
      if (mode === "computer") {
        return winner === "X"
          ? { text: `${myCharacter} You Win! 🎉`, color: "text-teal-600" }
          : { text: `${opponentCharacter} Computer Wins!`, color: "text-purple-500" };
      }
      return winner === mySymbol
        ? { text: `${myCharacter} You Win! 🎉`, color: "text-teal-600" }
        : { text: `${opponentCharacter} ${opponent} Wins!`, color: "text-pink-500" };
    }
    if (draw) return { text: "It's a Draw! 🤝", color: "text-orange-500" };
    if (mode === "computer") {
      return isXTurn
        ? { text: `Your Turn! ${myCharacter}`, color: "text-teal-600" }
        : { text: `${opponentCharacter} thinking... 🤔`, color: "text-purple-400" };
    }
    return isMyTurn
      ? { text: `Your Turn! ${myCharacter}`, color: "text-teal-600" }
      : { text: `${opponent}'s Turn... ${opponentCharacter}`, color: "text-gray-400" };
  };

  const status = getStatus();

  return (
    <GameLayout title="Tic Tac Toe" emoji="❌⭕" roomId={roomId || undefined}>
      <div className="flex flex-col items-center gap-4">
        {/* Player indicators */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${isMyTurn ? "bg-teal-100 ring-2 ring-teal-400" : "bg-gray-50"
            }`}>
            <span className="text-xl">{myCharacter}</span>
            <span className="text-xs font-bold text-gray-500 capitalize">{user?.username}</span>
          </div>
          <span className="text-sm font-bold text-gray-300">vs</span>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${!isMyTurn && !winner && !draw ? "bg-pink-100 ring-2 ring-pink-400" : "bg-gray-50"
            }`}>
            <span className="text-xl">{opponentCharacter}</span>
            <span className="text-xs font-bold text-gray-500 capitalize">{opponent}</span>
          </div>
        </div>

        <p className={`text-2xl font-black ${status.color}`}>{status.text}</p>

        {/* Board */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {board.map((cell, i) => (
            <button
              key={i}
              onClick={() => handleClick(i)}
              disabled={!!cell || !!winner || draw || opponentLeft || (mode === "online" && !isMyTurn)}
              className={`w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-md flex items-center justify-center text-3xl sm:text-4xl transition-all border-2 ${cell
                ? "border-gray-100 cursor-default"
                : isMyTurn && !winner && !draw
                  ? "border-gray-100 hover:border-teal-300 hover:bg-teal-50 active:scale-95 cursor-pointer"
                  : "border-gray-100 cursor-default"
                }`}
              aria-label={`Cell ${i + 1}, ${cell || "empty"}`}
            >
              {cell === "X" && <span>{xChar}</span>}
              {cell === "O" && <span>{oChar}</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-3 mt-2">
          {(winner || draw || opponentLeft) && (
            <button
              onClick={playAgain}
              disabled={opponentLeft}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold text-base shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              Play Again! 🔄
            </button>
          )}
          <button
            onClick={backToMenu}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-2xl font-bold text-base active:scale-95 transition-all"
          >
            Back
          </button>
        </div>
      </div>
    </GameLayout>
  );
}
