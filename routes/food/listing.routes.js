import express from 'express';
import {
  createListing,
  getVendorListings,
  updateListing,
  deleteListing,
  getListing,
  toggleListingStatus,
  getPublicVendorListings // Add this import
} from '../../controllers/food/listing.controller.js';

import vendorAuth from '../../middleware/food/vendorAuth.js';

const router = express.Router();

// Public routes (no auth required)
router.get('/vendor/:vendorId', getPublicVendorListings); // Add this route

// Protected vendor routes
router.post('/', vendorAuth, createListing);  
router.get('/vendor', vendorAuth, getVendorListings);
router.get('/:id', vendorAuth, getListing);
router.patch('/:id', vendorAuth, updateListing);
router.delete('/:id', vendorAuth, deleteListing);
router.patch('/:id/toggle-status', vendorAuth, toggleListingStatus);

export default router;