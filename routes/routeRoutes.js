import express from 'express';
import { routeController } from '../controllers/routeController.js';
import { matatuController } from '../controllers/matatuController.js';
import adminAuth from '../middleware/adminAuth.js';  // Optional: Admin auth middleware for restricted routes

const router = express.Router();

// Route for creating a new route
router.post('/create', adminAuth, routeController.createRoute);

// Route for getting all routes
router.get('/', routeController.getAllRoutes);

// Route for creating a matatu and assigning it to a route
router.post('/:routeId/matatu/create', adminAuth, matatuController.createMatatu);


// Route for getting matatus by a specific routeId
router.get('/matatu/:routeId', matatuController.getMatatusByRoute);

// Route for updating a matatu
router.put('/matatu/:id', adminAuth, matatuController.updateMatatu);

// Route for deleting a matatu
router.delete('/matatu/:id', adminAuth, matatuController.deleteMatatu);

// Other routes like updating and deleting a route can go here

export default router;