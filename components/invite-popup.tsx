"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket-context";
import { useRouter } from "next/navigation";

type Invite = {
  inviteId: string;
  gameType: string;
  from: string;
};

const GAME_INFO: Record<string, { name: string; emoji: string; path: string }> = {
  "tic-tac-toe": { name: "Tic Tac Toe", emoji: "❌⭕", path: "/games/tic-tac-toe" },
  chess: { name: "Chess", emoji: "♟️", path: "/games/chess" },
  ludo: { name: "Ludo", emoji: "🎲", path: "/games/ludo" },
};

export function InvitePopup() {
  const { socket } = useSocket();
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);

  useEffect(() => {
    if (!socket) return;

    const onInvite = (data: Invite) => {
      setInvites((prev) => [
        ...prev.filter((i) => i.inviteId !== data.inviteId),
        data,
      ]);
    };

    // Auto-remove invite if match starts (accepted elsewhere) or declined
    const onMatchOrCleanup = () => {
      // Clear all invites when a game starts
      setInvites([]);
    };

    socket.on("game-invite", onInvite);
    socket.on("ttt-match-found", onMatchOrCleanup);

    return () => {
      socket.off("game-invite", onInvite);
      socket.off("ttt-match-found", onMatchOrCleanup);
    };
  }, [socket]);

  const accept = (invite: Invite) => {
    setInvites((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
    const game = GAME_INFO[invite.gameType];
    if (game) {
      // Navigate to game page with pending invite — let the game page
      // show character picker first, then accept after picking
      router.push(`${game.path}?inviteId=${invite.inviteId}`);
    } else {
      socket?.emit("accept-invite", { inviteId: invite.inviteId });
    }
  };

  const decline = (inviteId: string) => {
    socket?.emit("decline-invite", { inviteId });
    setInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
  };

  if (invites.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-72 sm:w-80">
      {invites.map((inv) => {
        const game = GAME_INFO[inv.gameType] || {
          name: inv.gameType,
          emoji: "🎮",
        };
        return (
          <div
            key={inv.inviteId}
            className="bg-white border-2 border-yellow-300 rounded-2xl p-4 shadow-xl animate-bounce-once"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{game.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-black text-gray-700 capitalize">
                  {inv.from} wants to play!
                </p>
                <p className="text-xs font-semibold text-gray-400">
                  {game.name}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => accept(inv)}
                className="flex-1 py-2 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 active:scale-95 transition-all"
              >
                Let&apos;s Play! ✓
              </button>
              <button
                onClick={() => decline(inv.inviteId)}
                className="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold hover:bg-gray-200 active:scale-95 transition-all"
              >
                Not now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
