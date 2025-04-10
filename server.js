import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;
import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';
import postRoutes from './routes/postRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import matatuRoutes from './routes/matatuRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import { cloudinary } from './config/cloudinaryConfig.js';
import { initSocket } from './config/socket.js';
import { paymentController } from './controllers/PaymentController.js';

// Import food routes
import vendorRoutes from './routes/food/vendor.routes.js';
import listingRoutes from './routes/food/listing.routes.js';
//import orderRoutes from './routes/food/order.routes.js';
import adminRoutes from './routes/food/admin.routes.js';
import cron from 'node-cron';
import checkVendorSubscriptions from './jobs/subscriptionChecker.js';

// Load environment variables 
dotenv.config(); 

// Initialize the Express app
const app = express(); 

// Middleware for JSON parsing, CORS, and logging
app.use(express.json());
app.use(morgan('dev')); // Logger for development

// CORS configuration (add options for specific origins)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
}));

// Cloudinary configuration check
console.log('Cloudinary Configuration Status:', {
  isConfigured: cloudinary.config().cloud_name !== undefined,
  cloudName: cloudinary.config().cloud_name,
  apiKeyConfigured: !!cloudinary.config().api_key,
  apiSecretConfigured: !!cloudinary.config().api_secret,
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with the HTTP server
initSocket(server);

// Start the payment cleanup cron job
paymentController.setupPaymentCronJobs();

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI )
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/matatus', matatuRoutes);
app.use('/api/bookings', bookingRoutes);  
// Routes for food
app.use('/api/food/vendors', vendorRoutes);  // Vendor routes (register, login, etc.)
app.use('/api/food/listings', listingRoutes);  // Listings CRUD routes
//app.use('/api/food/orders', orderRoutes);  // Orders CRUD routes
app.use('/api/admin/food', adminRoutes);  // Admin routes (approve vendors, etc.)
// Error-handling middleware
app.use((err, req, res, next) => {
  console.error(`Error at ${req.method} ${req.url}:`, err.stack);

  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  });
});
// Schedule job to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Running vendor subscription checker...');
  checkVendorSubscriptions();
});
// Start server
const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});  