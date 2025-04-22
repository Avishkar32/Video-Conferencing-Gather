const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://video-conferencing-gather.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    // Notify others in the room
    socket.to(roomId).emit('user-connected', socket.id);

    // Send offers and ICE candidates
    socket.on('offer', ({ to, offer }) => {
      io.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
      io.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${socket.id} disconnected`);
      socket.to(roomId).emit('user-disconnected', socket.id);
    });

    socket.on('leave-room', () => {
      console.log(`User ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', socket.id);
      socket.leave(roomId);
    });
  });
});

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Socket.io server is running.');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
