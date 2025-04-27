import express from 'express';
import { createCategory } from '../../controllers/eshop/categoryController.js';
import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

// @route   POST /api/eshop/categories
// @desc    Create a new category (admin only)
// @access  Private (Admin)
router.post('/', adminAuth, createCategory);

export default router;
