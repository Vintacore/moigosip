import express from 'express';
import {
  applyForVendor,dashboardData,updateVendorProfile,getVendorStats    
} from '../../controllers/eshop/vendorController.js';
import {
  createProduct,searchShopProducts,
  getShopProducts,updateProduct,deleteProduct,toggleProductAvailability,getMyProducts
} from '../../controllers/eshop/productController.js';
import {
  getCategories,
  getShopsByCategory,getCategoriesDropdown 
} from '../../controllers/eshop/publicController.js'; 

import verifyToken from '../../middleware/authMiddleware.js';

import shopOwnerAuth from '../../middleware/eshop/shopOwnerAuth.js';


const router = express.Router();

// 👤 Vendor Routes
router.post('/apply', verifyToken, applyForVendor);
router.get('/dashboard', verifyToken, shopOwnerAuth, dashboardData);
router.get('/dropdown', getCategoriesDropdown);

// Update vendor profile
router.put('/profile', verifyToken, shopOwnerAuth, updateVendorProfile);
// Get vendor stats
router.get('/stats', verifyToken, shopOwnerAuth, getVendorStats);
// 🛒 Product Routes
router.post('/product/create', verifyToken, shopOwnerAuth, createProduct);

router.put('/product/:id', shopOwnerAuth, updateProduct);
router.delete('/product/:id', verifyToken, shopOwnerAuth, deleteProduct);
router.patch('/product/:id/toggle', verifyToken, shopOwnerAuth, toggleProductAvailability);
router.get('/my-products', verifyToken, shopOwnerAuth, getMyProducts);
// 🌍 Public Routes
router.get('/categories', getCategories); // Publicly fetch categories
router.get('/categories/:categorySlug/shops', getShopsByCategory); // Fetch shops by category name
router.get('/shops/:shopSlug/products', getShopProducts);
router.get('/shops/:shopSlug/search', searchShopProducts);
export default router;   
