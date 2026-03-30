"use client";

import { GameLayout } from "@/components/game-layout";
import { useState, useCallback } from "react";

const COLORS = [
  { name: "Red", bg: "bg-red-500", light: "bg-red-200", text: "text-red-600", emoji: "🔴" },
  { name: "Blue", bg: "bg-blue-500", light: "bg-blue-200", text: "text-blue-600", emoji: "🔵" },
  { name: "Green", bg: "bg-green-500", light: "bg-green-200", text: "text-green-600", emoji: "🟢" },
  { name: "Yellow", bg: "bg-yellow-400", light: "bg-yellow-200", text: "text-yellow-600", emoji: "🟡" },
];

type Token = { pos: number; home: boolean; finished: boolean };
type Player = { tokens: Token[] };

function createPlayers(): Player[] {
  return COLORS.map(() => ({
    tokens: Array.from({ length: 4 }, () => ({ pos: -1, home: true, finished: false })),
  }));
}

export default function LudoPage() {
  const [players, setPlayers] = useState<Player[]>(createPlayers);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [dice, setDice] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);

  const rollDice = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    setSelectedToken(null);
    setTimeout(() => {
      const value = Math.floor(Math.random() * 6) + 1;
      setDice(value);
      setRolling(false);
    }, 600);
  }, [rolling]);

  const moveToken = useCallback(
    (tokenIdx: number) => {
      if (dice === null) return;
      const next = [...players.map((p) => ({ tokens: p.tokens.map((t) => ({ ...t })) }))];
      const token = next[currentPlayer].tokens[tokenIdx];

      if (token.finished) return;

      if (token.home) {
        if (dice === 6) {
          token.home = false;
          token.pos = 0;
        } else {
          return; // Need 6 to leave home
        }
      } else {
        const newPos = token.pos + dice;
        if (newPos >= 56) {
          token.finished = true;
        } else {
          token.pos = newPos;
        }
      }

      setPlayers(next);
      setDice(null);
      // Next player (unless rolled 6)
      if (dice !== 6) {
        setCurrentPlayer((currentPlayer + 1) % 4);
      }
    },
    [dice, players, currentPlayer]
  );

  const reset = () => {
    setPlayers(createPlayers());
    setCurrentPlayer(0);
    setDice(null);
    setSelectedToken(null);
  };

  const color = COLORS[currentPlayer];

  return (
    <GameLayout title="Ludo" emoji="🎲">
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        {/* Current player */}
        <p className={`text-xl font-black ${color.text}`}>
          {color.emoji} {color.name}&apos;s Turn
        </p>

        {/* Dice */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={rollDice}
            disabled={rolling || dice !== null}
            className="w-20 h-20 bg-white rounded-2xl shadow-lg border-2 border-gray-200 flex items-center justify-center text-4xl font-black hover:shadow-xl active:scale-95 transition-all disabled:opacity-60"
            aria-label="Roll dice"
          >
            {rolling ? "🎲" : dice ? `${dice}` : "🎲"}
          </button>
          {dice !== null && (
            <p className="text-sm font-bold text-gray-400">
              You rolled a {dice}! Tap a token to move.
            </p>
          )}
          {!dice && !rolling && (
            <p className="text-sm font-bold text-gray-400">Tap the dice to roll!</p>
          )}
        </div>

        {/* Player tokens */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {COLORS.map((c, pi) => (
            <div
              key={c.name}
              className={`rounded-2xl p-3 ${c.light} ${
                pi === currentPlayer ? "ring-2 ring-offset-2 ring-gray-400" : ""
              }`}
            >
              <p className={`text-sm font-black ${c.text} mb-2`}>
                {c.emoji} {c.name}
              </p>
              <div className="flex gap-2">
                {players[pi].tokens.map((token, ti) => (
                  <button
                    key={ti}
                    onClick={() => pi === currentPlayer && dice !== null && moveToken(ti)}
                    disabled={pi !== currentPlayer || dice === null}
                    className={`w-10 h-10 rounded-full ${c.bg} text-white text-xs font-bold flex items-center justify-center shadow-md transition-all ${
                      pi === currentPlayer && dice !== null
                        ? "hover:scale-110 active:scale-95 cursor-pointer"
                        : "opacity-70 cursor-default"
                    } ${token.finished ? "opacity-40" : ""}`}
                    aria-label={`${c.name} token ${ti + 1}`}
                  >
                    {token.finished
                      ? "🏆"
                      : token.home
                      ? "🏠"
                      : token.pos}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={reset}
          className="mt-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-base shadow-md active:scale-95 transition-all"
        >
          New Game 🔄
        </button>
      </div>
    </GameLayout>
  );
}
