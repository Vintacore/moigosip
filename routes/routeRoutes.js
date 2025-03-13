import express from 'express';
import { routeController } from '../controllers/routeController.js';
import { matatuController } from '../controllers/matatuController.js';
import adminAuth from '../middleware/adminAuth.js';  

const router = express.Router();

// ✅ Create a new route (Admin only)
router.post('/create', adminAuth, routeController.createRoute);

// ✅ Get all routes
router.get('/', routeController.getAllRoutes);

// ✅ Get a single route by ID
router.get('/:id', routeController.getRouteById);

// ✅ Update a route by ID (Admin only)
router.put('/:id', adminAuth, routeController.updateRoute);

// ✅ Delete a route by ID (Admin only)
router.delete('/:id', adminAuth, routeController.deleteRoute);
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
