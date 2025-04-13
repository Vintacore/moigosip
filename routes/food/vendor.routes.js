import express from 'express';
import {
  registerVendor,
  getProfile,
  updateProfile,
  getDashboard,
  getApprovedVendors,
  deleteVendor
} from '../../controllers/food/vendor.controller.js';

import verifyToken from "../../middleware/authMiddleware.js";  
import { toggleVendorAvailability } from '../../controllers/food/vendor.controller.js';
import vendorAuth from '../../middleware/food/vendorAuth.js';

const router = express.Router();

// Public route
router.get('/public/approved', getApprovedVendors);

// Register vendor (convert user to vendor)
router.post('/register', verifyToken, registerVendor);
 
// Protected routes (require vendor authentication) all routes prefixed /api/food/vendors in server.js
router.get('/profile', vendorAuth, getProfile);
router.put('/profile', vendorAuth, updateProfile);
router.get('/dashboard', vendorAuth, getDashboard);
router.delete('/profile', vendorAuth, deleteVendor);
// Vendor availability toggle
router.patch('/availability/toggle', vendorAuth, toggleVendorAvailability);
export default router;   