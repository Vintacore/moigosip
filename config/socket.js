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
    console.log('User connected:', socket.user?.userId);
    
    // Join user-specific room for private messages
    if (socket.user?.userId) {
      socket.join(`user-${socket.user.userId}`);
    }
    
    // Handle joining matatu rooms for realtime updates
    socket.on('join_matatu', (matatuId) => {
      socket.join(`matatu-${matatuId}`);
    });
    
    socket.on('leave_matatu', (matatuId) => {
      socket.leave(`matatu-${matatuId}`);
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.user?.userId);
    });
  });
  
  return io;
};

// Export io to be used in other files
export { io };