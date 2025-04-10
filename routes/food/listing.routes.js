import express from 'express';
import { createListing, getVendorListings, updateListing, deleteListing } from '../../controllers/food/listing.controller.js';
import vendorAuth from '../../middleware/food/vendorAuth.js';  

const router = express.Router();

// Vendor routes to manage listings
router.post('/', vendorAuth, createListing);  // Create listing
router.get('/vendor', vendorAuth, getVendorListings);  // Get vendor's listings
router.patch('/:id', vendorAuth, updateListing);  // Update listing (optional)
router.delete('/:id', vendorAuth, deleteListing);  // Delete listing (optional)

export default router;
