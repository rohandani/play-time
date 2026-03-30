import { Server, Socket } from "socket.io";

// --- Online Users ---
const onlineUsers = new Map<string, string>(); // socketId -> username

export function getUsername(socketId: string) {
    return onlineUsers.get(socketId);
}

export function getAllOnlineUsers() {
    return Array.from(onlineUsers.entries()).map(([id, username]) => ({ id, username }));
}

function broadcastOnlineUsers(io: Server) {
    io.emit("online-users", getAllOnlineUsers());
}

// --- Generic Room Management ---
export type Room<T> = {
    id: string;
    players: { socketId: string; username: string }[];
    state: T;
};

const rooms = new Map<string, Room<unknown>>();

export function createRoom<T>(id: string, players: { socketId: string; username: string }[], state: T): Room<T> {
    const room: Room<T> = { id, players, state };
    rooms.set(id, room as Room<unknown>);
    return room;
}

export function getRoom<T>(id: string): Room<T> | undefined {
    return rooms.get(id) as Room<T> | undefined;
}

export function deleteRoom(id: string) {
    rooms.delete(id);
}

export function getRoomsByPlayer(socketId: string): Room<unknown>[] {
    return Array.from(rooms.values()).filter((r) =>
        r.players.some((p) => p.socketId === socketId)
    );
}

// --- Matchmaking Queue (per game type) ---
const waitingQueues = new Map<string, { socketId: string; username: string }>();

export function joinQueue(gameType: string, socketId: string, username: string): { socketId: string; username: string } | null {
    const key = gameType;
    const waiting = waitingQueues.get(key);

    if (waiting && waiting.socketId !== socketId) {
        waitingQueues.delete(key);
        return waiting; // Return the matched opponent
    }

    waitingQueues.set(key, { socketId, username });
    return null; // No match yet, queued
}

export function leaveQueue(gameType: string, socketId: string) {
    const waiting = waitingQueues.get(gameType);
    if (waiting?.socketId === socketId) {
        waitingQueues.delete(gameType);
    }
}

export function leaveAllQueues(socketId: string) {
    for (const [key, waiting] of waitingQueues.entries()) {
        if (waiting.socketId === socketId) {
            waitingQueues.delete(key);
        }
    }
}

// --- Invite System ---
export type Invite = {
    id: string;
    gameType: string;
    from: { socketId: string; username: string };
    to: { socketId: string; username: string };
};

const pendingInvites = new Map<string, Invite>(); // inviteId -> Invite

export function getSocketIdByUsername(username: string): string | undefined {
    for (const [sid, uname] of onlineUsers.entries()) {
        if (uname === username) return sid;
    }
    return undefined;
}

export function createInvite(gameType: string, from: { socketId: string; username: string }, to: { socketId: string; username: string }): Invite {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invite: Invite = { id, gameType, from, to };
    pendingInvites.set(id, invite);
    return invite;
}

export function getInvite(id: string): Invite | undefined {
    return pendingInvites.get(id);
}

export function deleteInvite(id: string) {
    pendingInvites.delete(id);
}

export function deleteInvitesByPlayer(socketId: string) {
    for (const [id, inv] of pendingInvites.entries()) {
        if (inv.from.socketId === socketId || inv.to.socketId === socketId) {
            pendingInvites.delete(id);
        }
    }
}

// --- Game start callbacks (registered by each game module) ---
type GameStartFn = (
    io: Server,
    player1: { socketId: string; username: string },
    player2: { socketId: string; username: string }
) => void;

const gameStartHandlers = new Map<string, GameStartFn>();

export function registerGameStart(gameType: string, handler: GameStartFn) {
    gameStartHandlers.set(gameType, handler);
}

// --- Core Socket Handlers ---
export function registerCore(io: Server, socket: Socket) {
    // User comes online
    socket.on("go-online", (username: string) => {
        onlineUsers.set(socket.id, username);
        broadcastOnlineUsers(io);
        console.log(`${username} is online`);
    });

    // --- Invite system (generic, works for any game) ---
    socket.on("send-invite", ({ gameType, toUsername }: { gameType: string; toUsername: string }) => {
        const fromUsername = getUsername(socket.id);
        if (!fromUsername) return;

        const toSocketId = getSocketIdByUsername(toUsername);
        if (!toSocketId) {
            socket.emit("invite-error", { message: `${toUsername} is not online` });
            return;
        }

        const invite = createInvite(
            gameType,
            { socketId: socket.id, username: fromUsername },
            { socketId: toSocketId, username: toUsername }
        );

        // Send invite to the target player
        io.to(toSocketId).emit("game-invite", {
            inviteId: invite.id,
            gameType: invite.gameType,
            from: invite.from.username,
        });

        socket.emit("invite-sent", { inviteId: invite.id, to: toUsername });
        console.log(`${fromUsername} invited ${toUsername} to ${gameType}`);
    });

    socket.on("accept-invite", ({ inviteId }: { inviteId: string }) => {
        const invite = getInvite(inviteId);
        if (!invite || invite.to.socketId !== socket.id) return;

        deleteInvite(inviteId);

        // Directly call the game's start handler to create the room
        const startGame = gameStartHandlers.get(invite.gameType);
        if (startGame) {
            startGame(io, invite.from, invite.to);
        }

        console.log(`${invite.to.username} accepted ${invite.from.username}'s invite to ${invite.gameType}`);
    });

    socket.on("decline-invite", ({ inviteId }: { inviteId: string }) => {
        const invite = getInvite(inviteId);
        if (!invite) return;

        deleteInvite(inviteId);
        io.to(invite.from.socketId).emit("invite-declined", {
            inviteId,
            by: invite.to.username,
        });

        console.log(`${invite.to.username} declined invite ${inviteId}`);
    });

    // Chat in any game room
    socket.on("chat-message", ({ roomId, message }: { roomId: string; message: string }) => {
        const username = getUsername(socket.id);
        if (!username) return;
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        io.to(roomId).emit("chat-message", { from: username, text: message, time });
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
        const username = onlineUsers.get(socket.id);
        console.log(`Disconnected: ${username || socket.id}`);

        leaveAllQueues(socket.id);
        deleteInvitesByPlayer(socket.id);

        // Notify rooms this player was in
        const playerRooms = getRoomsByPlayer(socket.id);
        for (const room of playerRooms) {
            socket.to(room.id).emit("player-left", { username });
            deleteRoom(room.id);
        }

        onlineUsers.delete(socket.id);
        broadcastOnlineUsers(io);
    });
}
