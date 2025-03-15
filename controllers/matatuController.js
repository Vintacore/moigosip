import mongoose from 'mongoose';
import Matatu from '../models/Matatu.js';
import Route from '../models/Route.js';
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";

export const matatuController = {
  createMatatu: async (req, res) => {
    try {
      console.log('Request body:', req.body);

      const { route, registrationNumber, totalSeats, departureTime, currentPrice } = req.body;

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

      res.status(201).json(savedMatatu);
    } catch (error) {
      console.error('Detailed error creating matatu:', error);
      if (error.code === 11000) {
        return res.status(400).json({
          message: 'Matatu with this registration number already exists',
          error: error.message
        });
      }
      res.status(500).json({
        message: 'Error creating matatu',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },
  getAllMatatus: async (req, res) => {
    try {
        const matatus = await Matatu.find()
            .populate('route')
            .populate('seatLayout.locked_by', 'username email');

        // Fetch all confirmed bookings for these matatus
        const matatuIds = matatus.map(m => m._id);
        const bookings = await Booking.find({ matatu: { $in: matatuIds }, status: "confirmed" })
            .populate('user', 'username email')
            .populate('payment'); // Populate the payment reference

        // Map booked seats to their respective matatus and attach phone_number
        const matatusWithBookings = matatus.map(matatu => {
            const updatedSeats = matatu.seatLayout.map(seat => {
                const booked = bookings.find(b =>
                    b.matatu.equals(matatu._id) &&
                    b.seatNumber === seat.seatNumber
                );

                if (booked && booked.payment) {
                    // Extract phone number directly from the populated payment
                    const phoneNumber = booked.payment.phone_number || null;

                    return {
                        ...seat.toObject(),
                        booked_by: {
                            ...booked.user.toObject(),
                            phone_number: phoneNumber
                        }
                    };
                }

                return seat.toObject();
            });

            return { ...matatu.toObject(), seatLayout: updatedSeats };
        });

        // Add debug logging to see what's happening
        console.log("Sample booking with payment:", bookings.length > 0 ? 
            {
                booking_id: bookings[0]._id,
                has_payment: !!bookings[0].payment,
                payment_details: bookings[0].payment
            } : "No bookings found");

        res.status(200).json({
            matatus: matatusWithBookings,
            count: matatusWithBookings.length
        });
    } catch (error) {
        console.error('Error fetching matatus:', error);
        res.status(500).json({ message: 'Error fetching matatus', error: error.message });
    }
},  

getMatatusByRoute: async (req, res) => {
  try {
      const { routeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(routeId)) {
          return res.status(400).json({ message: 'Invalid routeId' });
      }

      // Fetch matatus by route
      const matatus = await Matatu.find({ route: routeId })
          .populate('route')
          .populate('seatLayout.locked_by', 'username email');

      // Fetch confirmed bookings for this route
      const bookings = await Booking.find({ route: routeId, status: 'confirmed' })
          .populate('user', 'username email')
          .select('matatu seatNumber user');

      // Merge bookings with matatus
      const matatusWithBookings = matatus.map(matatu => {
          const bookedSeats = bookings.filter(booking => 
              booking.matatu.toString() === matatu._id.toString()
          );

          matatu.seatLayout = matatu.seatLayout.map(seat => {
              const bookedSeat = bookedSeats.find(b => b.seatNumber === seat.seatNumber);
              return {
                  ...seat.toObject(),
                  booked_by: bookedSeat ? bookedSeat.user : null
              };
          });

          return matatu;
      });

      res.status(200).json({
          matatus: matatusWithBookings,
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