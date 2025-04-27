import express from 'express';
import {
  applyForVendor,dashboardData,updateVendorProfile,getVendorStats    
} from '../../controllers/eshop/vendorController.js';
import {
  createProduct,
  getShopProducts,updateProduct,deleteProduct,toggleProductAvailability,getMyProducts
} from '../../controllers/eshop/productController.js';
import {
  getCategories,
  getShopsByCategory 
} from '../../controllers/eshop/publicController.js'; // <- you'll add these

import verifyToken from '../../middleware/authMiddleware.js';
import shopOwnerAuth from '../../middleware/eshop/shopOwnerAuth.js';


const router = express.Router();

// 👤 Vendor Routes
router.post('/apply', verifyToken, applyForVendor);
router.get('/dashboard', verifyToken, shopOwnerAuth, dashboardData);
// Update vendor profile
router.put('/profile', verifyToken, shopOwnerAuth, updateVendorProfile);
// Get vendor stats
router.get('/stats', verifyToken, shopOwnerAuth, getVendorStats);
// 🛒 Product Routes
router.post('/product/create', verifyToken, shopOwnerAuth, createProduct);
router.get('/shop/:shopId/products', getShopProducts); // Publicly fetch shop's products
router.put('/product/:id', shopOwnerAuth, updateProduct);
router.delete('/product/:id', verifyToken, shopOwnerAuth, deleteProduct);
router.patch('/product/:id/toggle', verifyToken, shopOwnerAuth, toggleProductAvailability);
router.get('/my-products', verifyToken, shopOwnerAuth, getMyProducts);
// 🌍 Public Routes
router.get('/categories', getCategories); // Publicly fetch categories
router.get('/categories/:categoryName/shops', getShopsByCategory); // Fetch shops by category name

export default router;   
