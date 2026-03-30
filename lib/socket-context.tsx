"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./auth-context";

type OnlineUser = { id: string; username: string };

type SocketContextType = {
  socket: Socket | null;
  onlineUsers: OnlineUser[];
  connected: boolean;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  onlineUsers: [],
  connected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;

    const s = io("http://localhost:3001", {
      transports: ["websocket"],
    });

    s.on("connect", () => {
      setConnected(true);
      s.emit("go-online", user.username);
    });

    s.on("disconnect", () => {
      setConnected(false);
    });

    s.on("online-users", (users: OnlineUser[]) => {
      setOnlineUsers(users);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
