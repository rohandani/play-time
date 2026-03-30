"use client";

import { GameLayout } from "@/components/game-layout";
import { useState, useCallback } from "react";

type Piece = string | null;

const INITIAL_BOARD: Piece[] = [
  "♜","♞","♝","♛","♚","♝","♞","♜",
  "♟","♟","♟","♟","♟","♟","♟","♟",
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  "♙","♙","♙","♙","♙","♙","♙","♙",
  "♖","♘","♗","♕","♔","♗","♘","♖",
];

const BLACK_PIECES = "♜♞♝♛♚♟";
const WHITE_PIECES = "♖♘♗♕♔♙";

function isWhite(p: string) { return WHITE_PIECES.includes(p); }
function isBlack(p: string) { return BLACK_PIECES.includes(p); }

export default function ChessPage() {
  const [board, setBoard] = useState<Piece[]>([...INITIAL_BOARD]);
  const [selected, setSelected] = useState<number | null>(null);
  const [whiteTurn, setWhiteTurn] = useState(true);
  const [captured, setCaptured] = useState<{ white: string[]; black: string[] }>({
    white: [], black: [],
  });

  const handleClick = useCallback(
    (i: number) => {
      const piece = board[i];

      if (selected === null) {
        // Select a piece of current player
        if (piece && ((whiteTurn && isWhite(piece)) || (!whiteTurn && isBlack(piece)))) {
          setSelected(i);
        }
        return;
      }

      // Clicking same square deselects
      if (selected === i) {
        setSelected(null);
        return;
      }

      const movingPiece = board[selected]!;
      // Can't capture own piece
      if (piece && ((whiteTurn && isWhite(piece)) || (!whiteTurn && isBlack(piece)))) {
        // Select this piece instead
        setSelected(i);
        return;
      }

      // Simple move (no full rule validation for kids - just move freely)
      const next = [...board];
      if (piece) {
        // Captured
        setCaptured((prev) => ({
          ...prev,
          [whiteTurn ? "white" : "black"]: [
            ...prev[whiteTurn ? "white" : "black"],
            piece,
          ],
        }));
      }
      next[i] = movingPiece;
      next[selected] = null;
      setBoard(next);
      setSelected(null);
      setWhiteTurn(!whiteTurn);
    },
    [board, selected, whiteTurn]
  );

  const reset = () => {
    setBoard([...INITIAL_BOARD]);
    setSelected(null);
    setWhiteTurn(true);
    setCaptured({ white: [], black: [] });
  };

  return (
    <GameLayout title="Chess" emoji="♟️">
      <div className="flex flex-col items-center gap-3">
        <p className="text-lg font-black text-gray-600">
          {whiteTurn ? "⬜ White" : "⬛ Black"}&apos;s Turn
        </p>

        {/* Captured pieces */}
        <div className="flex gap-4 text-sm">
          <span className="text-gray-400 font-semibold">
            ⬜ took: {captured.white.join("") || "—"}
          </span>
          <span className="text-gray-400 font-semibold">
            ⬛ took: {captured.black.join("") || "—"}
          </span>
        </div>

        {/* Board */}
        <div className="grid grid-cols-8 border-2 border-gray-300 rounded-xl overflow-hidden shadow-lg">
          {board.map((piece, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isDark = (row + col) % 2 === 1;
            const isSelected = selected === i;

            return (
              <button
                key={i}
                onClick={() => handleClick(i)}
                className={`w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center text-xl sm:text-3xl transition-all ${
                  isDark ? "bg-teal-600" : "bg-teal-100"
                } ${isSelected ? "ring-2 ring-yellow-400 ring-inset bg-yellow-200/60" : ""} hover:brightness-110`}
                aria-label={`${String.fromCharCode(65 + col)}${8 - row} ${piece || "empty"}`}
              >
                {piece}
              </button>
            );
          })}
        </div>

        <button
          onClick={reset}
          className="mt-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-2xl font-bold text-base shadow-md active:scale-95 transition-all"
        >
          New Game 🔄
        </button>
      </div>
    </GameLayout>
  );
}
