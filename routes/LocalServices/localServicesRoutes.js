// routes/serviceRoutes.js
import express from 'express';
import {
  createService,
  searchServices,
  exploreServices,
  approveService,
  rejectService,
  getMyServices,
  rateService,
  getPending
} from '../../controllers/LocalServices/serviceController.js'; 
import verifyToken from "../../middleware/authMiddleware.js";
import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

router.post('/', verifyToken, createService);
router.get('/search', searchServices);
router.get('/explore', exploreServices);
router.get('/mine', verifyToken, getMyServices);
router.post('/:id/rate', verifyToken, rateService);

// Admin
router.get('/pending', verifyToken,adminAuth , getPending);
router.patch('/:id/approve', verifyToken,adminAuth , approveService);
router.delete('/:id/reject', verifyToken,adminAuth , rejectService);

export default router;
