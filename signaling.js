// signaling.js
// Run: node signaling.js
// Simple WebSocket signaling server for local LAN — no auth, plaintext.
// Keeps a live room list and relays signaling messages between host and clients.

import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });
console.log('Signaling server listening on ws://0.0.0.0:3000');

const rooms = {}; // roomId -> { password, host: ws, hostId, clients: Map(clientId->ws) }

function broadcastRoomList() {
  const list = Object.entries(rooms).map(([id, r]) => ({ id, hasHost: !!r.host, name: r.name || id }));
  const msg = JSON.stringify({ type: 'rooms_list', list });
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
}

wss.on('connection', ws => {
  ws.id = Math.random().toString(36).slice(2,9);

  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data.toString()); } catch(e){ return; }

    // Messages
    // create_room { type:'create_room', roomId, password, name }
    // join_request { type:'join_request', roomId, password, name }
    // offer { type:'offer', target:'host', roomId, sdp, clientId }
    // answer { type:'answer', target:clientId, sdp, clientId }
    // ice { type:'ice', target, candidate, clientId }
    // stop_host { type:'stop_host', roomId }
    // leave { type:'leave', roomId, clientId }

    if (m.type === 'create_room') {
      const rid = m.roomId;
      rooms[rid] = rooms[rid] || { password: m.password || null, name: m.name || rid, host: null, hostId: null, clients: new Map() };
      rooms[rid].password = m.password || null;
      rooms[rid].name = m.name || rid;
      rooms[rid].host = ws;
      rooms[rid].hostId = ws.id;
      ws.roomId = rid;
      ws.isHost = true;
      ws.send(JSON.stringify({ type:'create_room_ok', roomId:rid }));
      broadcastRoomList();
      return;
    }

    if (m.type === 'stop_host') {
      const rid = m.roomId;
      const room = rooms[rid];
      if (!room) return;
      // notify clients room closed
      for (const [cid, cws] of room.clients) {
        if (cws.readyState === 1) cws.send(JSON.stringify({ type:'room_closed', roomId:rid }));
        try { cws.close(); } catch(e){}
      }
      if (room.host && room.host.readyState === 1) {
        try { room.host.send(JSON.stringify({ type:'host_stopped', roomId:rid })); } catch(e){}
      }
      delete rooms[rid];
      broadcastRoomList();
      return;
    }

    if (m.type === 'join_request') {
      const room = rooms[m.roomId];
      if (!room || !room.host) {
        ws.send(JSON.stringify({ type:'join_rejected', reason:'no_host' })); return;
      }
      if (room.password && room.password !== m.password) {
        ws.send(JSON.stringify({ type:'join_rejected', reason:'bad_password' })); return;
      }
      // accepted — register client in room
      room.clients.set(ws.id, ws);
      ws.roomId = m.roomId;
      ws.isHost = false;
      ws.name = m.name || 'guest';
      // ack to client
      ws.send(JSON.stringify({ type:'join_accepted', roomId:m.roomId, hostId: room.hostId }));
      // notify host someone intends to join (host will expect an offer forwarded)
      if (room.host && room.host.readyState===1) {
        room.host.send(JSON.stringify({ type:'client_waiting', clientId: ws.id, clientName: ws.name }));
      }
      broadcastRoomList();
      return;
    }

    if (m.type === 'offer') {
      // from client -> forward to host
      const room = rooms[m.roomId];
      if (!room || !room.host) { ws.send(JSON.stringify({type:'error', reason:'no_host'})); return; }
      if (room.host.readyState === 1) {
        room.host.send(JSON.stringify({ type:'offer', sdp: m.sdp, clientId: m.clientId, clientName: m.clientName, roomId: m.roomId }));
      }
      return;
    }

    if (m.type === 'answer') {
      // from host -> forward to clientId
      const rid = m.roomId;
      const room = rooms[rid];
      if (!room) return;
      const target = room.clients.get(m.clientId);
      if (target && target.readyState === 1) {
        target.send(JSON.stringify({ type:'answer', sdp: m.sdp, clientId: m.clientId }));
      }
      return;
    }

    if (m.type === 'ice') {
      // forward ICE candidate. m.target = 'host' or clientId
      const rid = m.roomId;
      const room = rooms[rid];
      if (!room) return;
      if (m.target === 'host') {
        if (room.host && room.host.readyState === 1) room.host.send(JSON.stringify({ type:'ice', candidate: m.candidate, clientId: m.clientId }));
      } else {
        const target = room.clients.get(m.target);
        if (target && target.readyState === 1) target.send(JSON.stringify({ type:'ice', candidate: m.candidate }));
      }
      return;
    }

    if (m.type === 'leave') {
      const rid = m.roomId;
      const room = rooms[rid];
      if (!room) return;
      room.clients.delete(ws.id);
      if (room.host && room.host.readyState===1) room.host.send(JSON.stringify({ type:'client_left', clientId: ws.id }));
      broadcastRoomList();
      return;
    }

  });

  ws.on('close', () => {
    // cleanup: if host, remove room and notify clients
    if (ws.isHost && ws.roomId) {
      const rid = ws.roomId;
      const room = rooms[rid];
      if (room) {
        for (const [cid, cws] of room.clients) {
          if (cws.readyState===1) cws.send(JSON.stringify({ type:'room_closed', roomId:rid }));
          try { cws.close(); } catch(e){}
        }
        delete rooms[rid];
        broadcastRoomList();
      }
    } else if (ws.roomId) {
      const rid = ws.roomId;
      const room = rooms[rid];
      if (room) {
        room.clients.delete(ws.id);
        if (room.host && room.host.readyState===1) room.host.send(JSON.stringify({ type:'client_left', clientId: ws.id }));
        broadcastRoomList();
      }
    }
  });

});
