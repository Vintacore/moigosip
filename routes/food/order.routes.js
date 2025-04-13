import express from 'express';
import { placeOrder, getVendorOrders, updateOrderStatus } from '../../controllers/food/order.controller.js';
import vendorAuth from '../../middleware/food/vendorAuth.js';
import verifyToken from "../../middleware/authMiddleware.js";

const router = express.Router();

// Customer routes
router.post('/', verifyToken, placeOrder);

// Vendor routes
router.get('/vendor', vendorAuth, getVendorOrders);
router.put('/vendor/:orderId/status', vendorAuth, updateOrderStatus);

export default router;