import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cron from 'node-cron';
import multer from 'multer';
import fileUpload from 'express-fileupload';

// Load environment variables.
dotenv.config();

// Initialize app and server.
const app = express();
const server = http.createServer(app);

// Middleware.
app.use(express.json());
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
}));

// Configure express-fileupload.
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/',
  limits: { fileSize: 10 * 1024 * 1024 }, 
  abortOnLimit: true
}));

// Cloudinary config check.
import { cloudinary } from './config/cloudinaryConfig.js';
console.log('Cloudinary Configuration Status:', {
  isConfigured: cloudinary.config().cloud_name !== undefined,
  cloudName: cloudinary.config().cloud_name,
  apiKeyConfigured: !!cloudinary.config().api_key,
  apiSecretConfigured: !!cloudinary.config().api_secret,
});
  
// Multer. 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Socket Setup.
import { initSocket } from './config/socket.js';
initSocket(server);

// Database Connection.
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Payment Setup
import { paymentController } from './controllers/PaymentController.js';
paymentController.setupPaymentCronJobs();

// Cron Jobs
import checkVendorSubscriptions from './jobs/subscriptionChecker.js';
import cleanOldOrders from './jobs/orderCleanup.js';
 
// 🕛 Run daily at midnight //vendor subscription
cron.schedule('0 0 * * *', () => {
  console.log('🌙 Running vendor subscription checker...');
  checkVendorSubscriptions();
});

// ⏱️ Run every hour //order cleanup
cron.schedule('0 * * * *', () => {
  console.log('🧹 Running order cleanup...');
  cleanOldOrders();
});




// Routes – Core
import authRoutes from './routes/authRoutes.js';
import postRoutes from './routes/postRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import matatuRoutes from './routes/matatuRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/matatus', matatuRoutes);
app.use('/api/bookings', bookingRoutes);

// Routes – Food App
import vendorRoutes from './routes/food/vendor.routes.js';
import listingRoutes from './routes/food/listing.routes.js';
import orderRoutes from './routes/food/order.routes.js';
import adminRoutes from './routes/food/admin.routes.js';

app.use('/api/food/vendors', vendorRoutes);
app.use('/api/food/listings', listingRoutes);
app.use('/api/food/orders', orderRoutes);
app.use('/api/food/admin', adminRoutes);

// Routes – Eshops
import categoryRoutes from './routes/eshop/categoryRoutes.js';
import shopownerRoutes from './routes/eshop/shopownerRoutes.js';
import eshopAdminRoutes from './routes/eshop/adminRoutes.js';
import eshopOrderRoutes from './routes/eshop/eshopOrderRoutes.js'; // Add this import

 
app.use('/api/eshop/categories', categoryRoutes);
app.use('/api/eshop/vendor', shopownerRoutes);
app.use('/api/eshop/admin', eshopAdminRoutes);
app.use('/api/eshop/orders', eshopOrderRoutes);

// Error Handling
app.use((err, req, res, next) => {
  console.error(`Error at ${req.method} ${req.url}:`, err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
    },
  });
});

// Start Server
const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 