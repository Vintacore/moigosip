import express from 'express';
import {
  placeOrder,
  getMyOrders,
  getVendorOrders,
  getVendorOrderById,
  updateOrderStatus
} from '../../controllers/eshop/orderController.js';
import verifyToken from "../../middleware/authMiddleware.js";
import shopOwnerAuth from '../../middleware/eshop/shopOwnerAuth.js';

const router = express.Router();

// 🛒 Customer Order Routes
router.post('/place', verifyToken, placeOrder); // Place a new order
router.get('/my-orders', verifyToken, getMyOrders); // Get all orders for logged in user


// 🏪 Vendor Order Management Routes
router.get('/vendor', verifyToken, shopOwnerAuth, getVendorOrders); // Get all orders for vendor
router.get('/vendor/:id', verifyToken, shopOwnerAuth, getVendorOrderById); // Get specific order details for vendor
router.patch('/vendor/:id/status', verifyToken, shopOwnerAuth, updateOrderStatus); // Update order status

export default router;