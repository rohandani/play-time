"use client";

import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/socket-context";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { ChatPanel } from "./chat-panel";
import { VideoPanel } from "./video-panel";

type Message = { from: string; text: string; time: string };

type Props = {
  title: string;
  emoji: string;
  children: ReactNode;
  roomId?: string;
};

export function GameLayout({ title, emoji, children, roomId }: Props) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();
  const [showChat, setShowChat] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { from: "system", text: "Chat started! Say hi 👋", time: "now" },
  ]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) router.push("/");
  }, [user, router]);

  // Always listen for chat messages at this level, even if panel is closed
  useEffect(() => {
    if (!socket || !roomId) return;

    const handler = (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      // Auto-open chat and mark unread if panel is closed
      setShowChat((isOpen) => {
        if (!isOpen) {
          setUnread((n) => n + 1);
          return true; // auto-open
        }
        return true;
      });
    };

    socket.on("chat-message", handler);
    return () => {
      socket.off("chat-message", handler);
    };
  }, [socket, roomId]);

  // Clear unread when chat is opened
  const toggleChat = useCallback(() => {
    setShowChat((prev) => {
      if (!prev) setUnread(0);
      return !prev;
    });
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (socket && roomId) {
        socket.emit("chat-message", { roomId, message: text });
      } else if (user) {
        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setMessages((prev) => [...prev, { from: user.username, text, time }]);
      }
    },
    [socket, roomId, user]
  );

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-sky-50 via-white to-purple-50">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 sm:px-6 sm:py-3 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <button
          onClick={() => router.push("/games")}
          className="text-sm font-bold text-teal-500 hover:text-teal-700 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-lg sm:text-xl font-black text-gray-700">
          {emoji} {title}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleChat}
            className={`relative p-2 rounded-xl text-lg transition-colors ${
              showChat
                ? "bg-teal-100 text-teal-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
            aria-label="Toggle chat"
          >
            💬
            {unread > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowVideo(!showVideo)}
            className={`p-2 rounded-xl text-lg transition-colors ${
              showVideo
                ? "bg-teal-100 text-teal-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
            aria-label="Toggle video"
          >
            📹
          </button>
          <span className="text-2xl ml-1">{user.avatar}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Game area */}
        <main className="flex-1 flex items-center justify-center p-4 overflow-auto">
          {children}
        </main>

        {/* Side panel */}
        {(showChat || showVideo) && (
          <aside className="w-72 sm:w-80 border-l border-gray-100 bg-white flex flex-col shrink-0 max-h-[calc(100vh-57px)]">
            {showVideo && <VideoPanel />}
            {showChat && (
              <ChatPanel
                username={user.username}
                messages={messages}
                onSend={sendMessage}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
