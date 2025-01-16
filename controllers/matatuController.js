import mongoose from 'mongoose';
import Matatu from '../models/Matatu.js';
import Route from '../models/Route.js';

export const matatuController = {
  createMatatu: async (req, res) => {
    try {
      console.log('Request body:', req.body);

      const { route, registrationNumber, totalSeats, departureTime, currentPrice, plate } = req.body;

      // Debug log for incoming data
      console.log('Attempting to create matatu with registration:', registrationNumber);

      // Validate route existence
      const routeExists = await Route.findById(route);
      if (!routeExists) {
        console.log('Route not found:', route);
        return res.status(404).json({ message: 'Route not found' });
      }
      console.log('Route found:', routeExists);

      // Check if registrationNumber is unique with debug log
      const matatuExists = await Matatu.findOne({ registrationNumber });
      console.log('Existing matatu check result:', matatuExists);

      if (matatuExists) {
        console.log('Duplicate registration found:', matatuExists.registrationNumber);
        return res.status(400).json({
          message: 'Matatu with this registration number already exists',
          existingMatatu: matatuExists
        });
      }

      // Create and save the new matatu
      const newMatatu = new Matatu({
        route,
        registrationNumber,
        plate, // Optional, will be stored if provided
        totalSeats,
        departureTime,
        currentPrice,
        seatLayout: Array.from({ length: totalSeats }, (_, index) => ({
          seatNumber: index + 1,
          isBooked: false,
        }))
      });

      console.log('Attempting to save new matatu:', newMatatu);
      const savedMatatu = await newMatatu.save();
      console.log('Successfully saved matatu:', savedMatatu);

      // Remove the plate field from the response before sending it back
      savedMatatu.plate = undefined;

      res.status(201).json(savedMatatu);
    } catch (error) {
      console.error('Detailed error creating matatu:', error);
      res.status(500).json({
        message: 'Error creating matatu',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  getMatatusByRoute: async (req, res) => {
    try {
      const { routeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(routeId)) {
        return res.status(400).json({ message: 'Invalid routeId' });
      }

      // Fetch matatus for the route
      const matatus = await Matatu.find({ route: routeId }).populate('route');

      // Return count and data
      res.status(200).json({
        matatus,
        count: matatus.length
      });
    } catch (error) {
      console.error('Error fetching matatus:', error);
      res.status(500).json({ message: 'Error fetching matatus', error: error.message });
    }
  },

  getMatatuById: async (req, res) => {
    try {
      const { id } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid matatuId' });
      }
  
      // Fetch matatu by ID
      const matatu = await Matatu.findById(id).populate('route');
  
      if (!matatu) {
        return res.status(404).json({ message: 'Matatu not found' });
      }
  
      res.status(200).json(matatu);
    } catch (error) {
      console.error('Error fetching matatu:', error);
      res.status(500).json({ message: 'Error fetching matatu', error: error.message });
    }
  },

  updateMatatu: async (req, res) => {
    try {
      const { id } = req.params;
      const updatedData = req.body;

      const updatedMatatu = await Matatu.findByIdAndUpdate(id, updatedData, { new: true });
      if (!updatedMatatu) {
        return res.status(404).json({ message: 'Matatu not found' });
      }

      res.status(200).json({ message: 'Matatu updated successfully', updatedMatatu });
    } catch (error) {
      console.error('Error updating matatu:', error);
      res.status(500).json({ message: 'Error updating matatu', error: error.message });
    }
  },

  deleteMatatu: async (req, res) => {
    try {
      const { id } = req.params;

      const deletedMatatu = await Matatu.findByIdAndDelete(id);
      if (!deletedMatatu) {
        return res.status(404).json({ message: 'Matatu not found' });
      }

      res.status(200).json({ message: 'Matatu deleted successfully' });
    } catch (error) {
      console.error('Error deleting matatu:', error);
      res.status(500).json({ message: 'Error deleting matatu', error: error.message });
    }
  },
};