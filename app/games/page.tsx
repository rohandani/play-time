"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const games = [
  {
    name: "Tic Tac Toe",
    emoji: "❌⭕",
    desc: "Match 3 in a row!",
    href: "/games/tic-tac-toe",
    bg: "from-pink-400 to-rose-400",
  },
  {
    name: "Chess",
    emoji: "♟️",
    desc: "Be the king!",
    href: "/games/chess",
    bg: "from-teal-400 to-emerald-500",
  },
  {
    name: "Ludo",
    emoji: "🎲",
    desc: "Roll & race!",
    href: "/games/ludo",
    bg: "from-green-400 to-emerald-400",
  },
];

export default function GamesPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.push("/");
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-sky-50 via-white to-purple-50 min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{user.avatar}</span>
          <div>
            <p className="text-xs text-gray-400 font-semibold leading-none">
              Welcome back!
            </p>
            <p className="text-lg font-black text-gray-700 capitalize leading-tight">
              {user.username}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-sm font-bold text-gray-400 hover:text-red-400 transition-colors"
        >
          Bye! 👋
        </button>
      </header>

      {/* Game Selection */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-700 mb-1 text-center">
          Pick a Game! 🎮
        </h2>
        <p className="text-gray-400 font-semibold mb-6 text-center text-sm">
          What do you want to play today?
        </p>

        <div className="w-full max-w-md space-y-4">
          {games.map((game) => (
            <button
              key={game.name}
              onClick={() => router.push(game.href)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${game.bg} text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform`}
            >
              <span className="text-4xl">{game.emoji}</span>
              <div className="text-left flex-1">
                <p className="text-lg font-black">{game.name}</p>
                <p className="text-sm font-semibold opacity-90">{game.desc}</p>
              </div>
              <span className="text-2xl">▶</span>
            </button>
          ))}
        </div>

        <p className="text-gray-300 text-xs font-semibold mt-8">
          💬 Chat & 📹 Video coming soon!
        </p>
      </main>
    </div>
  );
}
