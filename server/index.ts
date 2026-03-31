import { createServer } from "http";
import { Server } from "socket.io";
import { registerCore } from "./core";
import { registerTicTacToe } from "./games/tic-tac-toe";
import { registerChess } from "./games/chess";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  // Core: online users, chat, disconnect cleanup
  registerCore(io, socket);

  // Games
  registerTicTacToe(io, socket);
  registerChess(io, socket);
  // registerLudo(io, socket);     — add later
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`🎮 Game server running on http://localhost:${PORT}`);
});
