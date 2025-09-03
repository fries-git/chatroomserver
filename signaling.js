// run: node server.js
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = {}; // { roomName: Set of sockets }

wss.on('connection', ws => {
  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch(e){return;}
    const { type, room, payload } = data;

    if(type === 'join') {
      ws.room = room;
      if(!rooms[room]) rooms[room] = new Set();
      rooms[room].add(ws);
      // inform everyone about current users (optional)
      broadcastRoom(room, { type:'peers', count: rooms[room].size });
    } else if(type === 'signal' && ws.room) {
      // relay to all other peers in the room
      rooms[ws.room].forEach(peer => { if(peer!==ws) peer.send(JSON.stringify({type:'signal', payload})) });
    }
  });

  ws.on('close', ()=>{
    if(ws.room && rooms[ws.room]) {
      rooms[ws.room].delete(ws);
      if(rooms[ws.room].size === 0) delete rooms[ws.room];
      else broadcastRoom(ws.room, { type:'peers', count: rooms[ws.room].size });
    }
  });
});

function broadcastRoom(room, data){
  if(!rooms[room]) return;
  const str = JSON.stringify(data);
  rooms[room].forEach(peer => peer.send(str));
}

console.log('Signaling server running on ws://localhost:8080');
