"use client";

import { useState, useRef, useEffect } from "react";

type Message = { from: string; text: string; time: string };

export function ChatPanel({
  username,
  messages,
  onSend,
}: {
  username: string;
  messages: Message[];
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 border-b border-gray-100 font-bold text-sm text-gray-500">
        💬 Chat
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm ${
              msg.from === "system"
                ? "text-center text-gray-300 text-xs font-semibold"
                : msg.from === username
                ? "text-right"
                : "text-left"
            }`}
          >
            {msg.from !== "system" && (
              <p className="text-xs text-gray-400 font-semibold capitalize">
                {msg.from}
              </p>
            )}
            {msg.from !== "system" ? (
              <span
                className={`inline-block px-3 py-1.5 rounded-2xl text-sm font-semibold ${
                  msg.from === username
                    ? "bg-teal-500 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {msg.text}
              </span>
            ) : (
              <span>{msg.text}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="p-2 border-t border-gray-100 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
          aria-label="Chat message"
        />
        <button
          type="submit"
          className="px-3 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
