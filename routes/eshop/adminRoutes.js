import express from 'express';
import {
  getVendorApplications,
  approveVendorApplication,
  rejectVendorApplication,
  getAllShops,
  getShopById,
  updateShopStatus 

} from '../../controllers/eshop/adminController.js';
import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

// Vendor application management
router.get('/vendor-applications', adminAuth, getVendorApplications);
router.put('/vendor/:id/approve', adminAuth, approveVendorApplication);
router.delete('/vendor/:id/reject', adminAuth, rejectVendorApplication);

// Shop management
router.get('/shops', adminAuth, getAllShops);
router.get('/shop/:id', adminAuth, getShopById);
router.put('/shop/:id/status', adminAuth, updateShopStatus); 
export default router;