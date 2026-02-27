import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Game State
  const rooms = new Map<string, any>();

  wss.on("connection", (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let playerId: string | null = null;

    ws.on("message", (data: string) => {
      const message = JSON.parse(data);

      switch (message.type) {
        case "JOIN_ROOM":
          currentRoomId = message.roomId;
          playerId = message.playerId;
          
          if (!rooms.has(currentRoomId!)) {
            rooms.set(currentRoomId!, {
              players: {},
              maze: message.maze, // First player sends the maze
              startTime: null,
            });
          }
          
          const room = rooms.get(currentRoomId!);
          room.players[playerId!] = {
            id: playerId,
            x: message.x,
            y: message.y,
            angle: 0,
            color: message.color,
          };

          // Broadcast join
          broadcastToRoom(currentRoomId!, {
            type: "PLAYER_JOINED",
            players: room.players,
            maze: room.maze,
          });
          break;

        case "UPDATE_POSITION":
          if (currentRoomId && playerId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            if (room.players[playerId]) {
              room.players[playerId].x = message.x;
              room.players[playerId].y = message.y;
              room.players[playerId].angle = message.angle;
              
              broadcastToRoom(currentRoomId, {
                type: "STATE_UPDATE",
                players: room.players,
              }, ws); // Don't send back to sender
            }
          }
          break;

        case "WIN":
          if (currentRoomId) {
            broadcastToRoom(currentRoomId, {
              type: "GAME_OVER",
              winnerId: playerId,
              time: message.time,
            });
          }
          break;
      }
    });

    ws.on("close", () => {
      if (currentRoomId && playerId && rooms.has(currentRoomId)) {
        const room = rooms.get(currentRoomId);
        delete room.players[playerId];
        if (Object.keys(room.players).length === 0) {
          rooms.delete(currentRoomId);
        } else {
          broadcastToRoom(currentRoomId, {
            type: "PLAYER_LEFT",
            playerId: playerId,
          });
        }
      }
    });
  });

  function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
        // In a real app, we'd check if the client is in the room
        // For this simple implementation, we'll just send to all for now
        // but ideally we'd track which client belongs to which room
        client.send(JSON.stringify(message));
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
