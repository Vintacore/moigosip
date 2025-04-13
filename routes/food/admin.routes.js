import express from 'express';
import {
  approveVendor,
  getAllVendors,
  getUnapprovedVendors,
  updateVendorStatus,
  deleteVendor
} from '../../controllers/food/admin.controller.js';

import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

// These routes will be prefixed with /api/food/admin in server.js

// Approve a vendor
router.patch('/vendors/:id/approve', adminAuth, approveVendor);

// Update vendor status
router.put('/vendors/:id/status', adminAuth, updateVendorStatus);

// Delete vendor
router.delete('/vendors/:id', adminAuth, deleteVendor);

// Get all vendors
router.get('/vendors', adminAuth, getAllVendors);

// Get unapproved vendors
router.get('/vendors/pending', adminAuth, getUnapprovedVendors);

export default router;
