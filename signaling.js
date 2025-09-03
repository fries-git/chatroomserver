// server.js
const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8080 });

let clients = [];

server.on("connection", ws => {
  clients.push(ws);

  ws.on("message", msg => {
    // broadcast message to everyone else
    for (let client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    }
  });

  ws.on("close", () => {
    clients = clients.filter(c => c !== ws);
  });
});

console.log("Chatroom server running on ws://localhost:8080");
