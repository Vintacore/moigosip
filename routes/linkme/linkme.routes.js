import express from 'express';
import verifyToken from "../../middleware/authMiddleware.js";
import adminAuth from '../../middleware/adminAuth.js';

import { 
  upgradeToLinkMeUser 
} from '../../controllers/linkme/linkme.controller.js';

import { 
  approveLinkMeUser, 
  rejectLinkMeUser, 
  getPendingLinkMeRequests 
} from '../../controllers/linkme/admin.controller.js';

const router = express.Router();

// POST /linkme/upgrade - Upgrade to Link-Me user
router.post('/upgrade', verifyToken, upgradeToLinkMeUser);

// Admin-only actions
router.post('/approve/:userId', adminAuth, approveLinkMeUser);
router.post('/reject/:userId', adminAuth, rejectLinkMeUser);
router.get('/requests', adminAuth, getPendingLinkMeRequests);

export default router;
