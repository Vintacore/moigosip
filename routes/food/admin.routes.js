import express from 'express';
import {
  approveVendor,
} from '../../controllers/food/admin.controller.js';

import {
  getAllVendors,
  getUnapprovedVendors,
  updateVendorStatus
} from '../../controllers/food/vendor.controller.js';

import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

// Approve a vendor
router.patch('/vendors/:id/approve', adminAuth, approveVendor);

// Update vendor status (approve/reject/activate/deactivate)
router.put('/vendors/:id/status', adminAuth, updateVendorStatus);

// Get all vendors
router.get('/vendors', adminAuth, getAllVendors);

// Get unapproved vendors
router.get('/vendors/pending', adminAuth, getUnapprovedVendors);

export default router;