import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      return next(new Error('Authentication error'));
    }
  });
  
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, 'User ID:', socket.user?.userId || socket.user?.id);
    
    // Join user-specific room for private messages
    if (socket.user?.userId || socket.user?.id) {
      const userId = socket.user?.userId || socket.user?.id;
      console.log(`User ${userId} automatically joining room: user-${userId}`);
      socket.join(`user-${userId}`);
    }
    
    // Handle explicit room joining (for redundancy)
    socket.on('join_user_room', (data) => {
      if (data.userId) {
        console.log(`User ${data.userId} explicitly joining room: user-${data.userId}`);
        socket.join(`user-${data.userId}`);
        socket.emit('room_joined', { 
          userId: data.userId, 
          room: `user-${data.userId}`, 
          status: 'joined' 
        });
      }
    });
    
    // Handle joining matatu rooms for realtime updates
    socket.on('join_matatu', (matatuId) => {
      console.log(`User joining matatu room: matatu-${matatuId}`);
      socket.join(`matatu-${matatuId}`);
      socket.emit('room_joined', { room: `matatu-${matatuId}`, status: 'joined' });
    });
    
    socket.on('leave_matatu', (matatuId) => {
      console.log(`User leaving matatu room: matatu-${matatuId}`);
      socket.leave(`matatu-${matatuId}`);
    });
    
    // Debug helper to check what rooms a user is in
    socket.on('get_my_rooms', () => {
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      console.log(`User ${socket.user?.userId} rooms:`, rooms);
      socket.emit('user_rooms', { rooms });
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id, 'User ID:', socket.user?.userId || socket.user?.id);
    });
  });
  
  return io;
};

// Helper function to debug which clients are in a room
export const getClientsInRoom = (roomName) => {
  if (!io) return [];
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? Array.from(room) : [];
};

// Helper function to debug emit to a user room
export const debugEmitToUserRoom = (userId, event, data) => {
  const roomName = `user-${userId}`;
  const clients = getClientsInRoom(roomName);
  console.log(`DEBUG: Emitting '${event}' to room ${roomName} with ${clients.length} clients`);
  console.log(`Clients in room:`, clients);
  console.log(`Data:`, data);
  return io.to(roomName).emit(event, data);
};

// Export io to be used in other files
export { io };