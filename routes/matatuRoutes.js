import express from 'express';
import { matatuController } from '../controllers/matatuController.js';

const router = express.Router();

// Create a new Matatu
router.post('/', matatuController.createMatatu);

// Get Matatus by route ID
router.get('/route/:routeId', matatuController.getMatatusByRoute);

// Get a Matatu by ID
router.get('/:id', matatuController.getMatatuById);

// Update a Matatu
router.put('/:id', matatuController.updateMatatu);

// Delete a Matatu
router.delete('/:id', matatuController.deleteMatatu);

export default router;
