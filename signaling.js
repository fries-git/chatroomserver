// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

let rooms = {}; // { roomName: { password, host, messages, clients, lastBeat } }
let nextId = 1;

// cleanup stale rooms
setInterval(() => {
  const now = Date.now();
  for (const [name, room] of Object.entries(rooms)) {
    if (now - room.lastBeat > 30000) {
      console.log(`Deleting stale room: ${name}`);
      room.clients.forEach(res => res.json([{ system: true, text: "Room closed by host." }]));
      delete rooms[name];
    }
  }
}, 10000);

// --- Routes ---

// create a room
app.post("/create", (req, res) => {
  const { room, password, host } = req.body;
  if (!room || !host) return res.status(400).json({ error: "Missing fields" });
  if (rooms[room]) return res.status(400).json({ error: "Room already exists" });

  rooms[room] = { password, host, messages: [], clients: [], lastBeat: Date.now() };
  res.json({ ok: true });
});

// join room
app.post("/join", (req, res) => {
  const { room, password } = req.body;
  const r = rooms[room];
  if (!r) return res.status(404).json({ error: "No such room" });
  if (r.password && r.password !== password) return res.status(403).json({ error: "Bad password" });
  res.json({ ok: true });
});

// heartbeat (only host should call)
app.post("/beat", (req, res) => {
  const { room, host } = req.body;
  const r = rooms[room];
  if (r && r.host === host) {
    r.lastBeat = Date.now();
  }
  res.json({ ok: true });
});

// send message
app.post("/send", (req, res) => {
  const { room, user, text } = req.body;
  const r = rooms[room];
  if (!r) return res.status(404).json({ error: "No such room" });

  const msg = { id: nextId++, user, text, time: Date.now() };
  r.messages.push(msg);

  r.clients.forEach(c => c.json([msg]));
  r.clients = [];

  res.json({ ok: true });
});

// receive messages
app.get("/recv", (req, res) => {
  const { room } = req.query;
  const since = parseInt(req.query.since || "0", 10);
  const r = rooms[room];
  if (!r) return res.status(404).json([]);

  const newer = r.messages.filter(m => m.id > since);
  if (newer.length > 0) {
    return res.json(newer);
  }

  r.clients.push(res);
  setTimeout(() => {
    const i = r.clients.indexOf(res);
    if (i >= 0) r.clients.splice(i, 1);
    res.json([]);
  }, 25000);
});

// list rooms
app.get("/rooms", (req, res) => {
  const list = Object.entries(rooms).map(([name, r]) => ({
    name,
    hasPassword: !!r.password,
    host: r.host,
  }));
  res.json(list);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
