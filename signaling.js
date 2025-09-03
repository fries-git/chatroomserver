const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

let rooms = {}; 
// rooms = { roomName: { password, host, messages: [], clients: {username: {lastPing,res}}, lastActive } }

// Clean up stale rooms every 10s
setInterval(() => {
  const now = Date.now();
  for (const [room, r] of Object.entries(rooms)) {
    if (now - r.lastActive > 30000) { // 30s timeout
      delete rooms[room];
      console.log(`Deleted room: ${room}`);
    }
  }
}, 10000);

// --- API ---

// create room
app.post("/create", (req, res) => {
  const { room, password, host } = req.body;
  if (!room || !host) return res.status(400).json({ error: "Missing fields" });
  if (rooms[room]) return res.status(400).json({ error: "Room exists" });
  rooms[room] = { password, host, messages: [], clients: {}, lastActive: Date.now() };
  res.json({ ok: true });
});

// join room
app.post("/join", (req, res) => {
  const { room, password, user } = req.body;
  const r = rooms[room];
  if (!r) return res.status(404).json({ error: "No such room" });
  if (r.password && r.password !== password) return res.status(403).json({ error: "Bad password" });
  r.clients[user] = { lastPing: Date.now(), res: null };
  r.lastActive = Date.now();
  res.json({ ok: true });
});

// send message
app.post("/send", (req, res) => {
  const { room, user, text } = req.body;
  const r = rooms[room];
  if (!r) return res.status(404).json({ error: "No such room" });

  const msg = { id: Date.now(), user, text };
  r.messages.push(msg);

  for (const client of Object.values(r.clients)) {
    if (client.res) {
      client.res.json([msg]);
      client.res = null;
    }
  }
  r.lastActive = Date.now();
  res.json({ ok: true });
});

// receive messages (long polling)
app.get("/recv", (req, res) => {
  const { room, user, since = 0 } = req.query;
  const r = rooms[room];
  if (!r) return res.json([]);

  r.lastActive = Date.now();
  if (!r.clients[user]) r.clients[user] = { lastPing: Date.now(), res: null };

  const msgs = r.messages.filter(m => m.id > Number(since));
  if (msgs.length > 0) return res.json(msgs);

  r.clients[user].res = res;
  setTimeout(() => {
    if (r.clients[user] && r.clients[user].res) {
      r.clients[user].res.json([]);
      r.clients[user].res = null;
    }
  }, 25000);
});

// list rooms
app.get("/rooms", (req, res) => {
  const list = Object.entries(rooms).map(([name, r]) => ({
    name,
    hasPassword: !!r.password,
    host: r.host
  }));
  res.json(list);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
