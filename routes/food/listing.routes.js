import express from 'express';
import {
  createListing,
  getVendorListings,
  updateListing,
  deleteListing,
  getListing,
  toggleListingStatus
} from '../../controllers/food/listing.controller.js';

import vendorAuth from '../../middleware/food/vendorAuth.js';

const router = express.Router();

// Listings routes
router.post('/', vendorAuth, createListing);  
router.get('/vendor', vendorAuth, getVendorListings);
router.get('/:id', vendorAuth, getListing);
router.patch('/:id', vendorAuth, updateListing);
router.delete('/:id', vendorAuth, deleteListing);
router.patch('/:id/toggle-status', vendorAuth, toggleListingStatus);



export default router;
