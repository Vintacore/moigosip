import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Matatu from '../models/Matatu.js';

const LOCK_DURATION = 5 * 60 * 1000; // 5 minutes

const bookingController = {
  checkSeatAvailability: async (req, res) => {
    try {
      const { matatuId, seatNumber, travelDate } = req.query;

      const matatu = await Matatu.findById(matatuId);
      if (!matatu) {
        return res.status(404).json({ message: 'Matatu not found' });
      }

      const seat = matatu.seatLayout.find(
        seat => seat.seatNumber === parseInt(seatNumber)
      );

      if (!seat) {
        return res.status(400).json({ message: 'Invalid seat number' });
      }

      const existingBooking = await Booking.findOne({
        matatu: matatuId,
        seatNumber: parseInt(seatNumber),
        travelDate: new Date(travelDate),
        status: { $ne: 'cancelled' }
      });

      const isLocked = await Booking.findOne({
        matatu: matatuId,
        seatNumber: parseInt(seatNumber),
        travelDate: new Date(travelDate),
        status: 'pending',
        bookingExpiry: { $gt: new Date() }
      });

      res.status(200).json({
        available: !existingBooking && !seat.isBooked && !isLocked,
        currentPrice: matatu.currentPrice,
        departureTime: matatu.departureTime
      });

    } catch (error) {
      console.error('Error checking availability:', error);
      res.status(500).json({ message: error.message });
    }
  },

  lockSeat: async (req, res) => {
    try {
      const { matatuId, seatNumber, travelDate } = req.body;

      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const matatu = await Matatu.findById(matatuId);
      if (!matatu) {
        return res.status(404).json({ message: 'Matatu not found' });
      }

      const existingBooking = await Booking.findOne({
        matatu: matatuId,
        seatNumber: parseInt(seatNumber),
        travelDate: new Date(travelDate),
        status: { $ne: 'cancelled' }
      });

      if (existingBooking) {
        return res.status(400).json({ message: 'Seat already booked' });
      }

      const isLocked = await Booking.findOne({
        matatu: matatuId,
        seatNumber: parseInt(seatNumber),
        travelDate: new Date(travelDate),
        status: 'pending',
        bookingExpiry: { $gt: new Date() }
      });

      if (isLocked) {
        return res.status(400).json({ message: 'Seat is already locked' });
      }

      const newBooking = new Booking({
        user: req.user.id,
        matatu: matatuId,
        route: matatu.route,
        seatNumber: parseInt(seatNumber),
        price: matatu.currentPrice,
        travelDate: new Date(travelDate),
        status: 'pending',
        paymentStatus: 'pending',
        bookingExpiry: new Date(Date.now() + LOCK_DURATION)
      });

      await newBooking.save();

      const seatIndex = matatu.seatLayout.findIndex(
        seat => seat.seatNumber === parseInt(seatNumber)
      );
      matatu.seatLayout[seatIndex].isBooked = true;
      await matatu.save();

      // Set timeout to automatically cancel booking if not confirmed
      setTimeout(async () => {
        try {
          const booking = await Booking.findById(newBooking._id);
          if (booking && booking.status === 'pending') {
            booking.status = 'cancelled';
            await booking.save();

            const updatedMatatu = await Matatu.findById(matatuId);
            const seatIndex = updatedMatatu.seatLayout.findIndex(
              seat => seat.seatNumber === parseInt(seatNumber)
            );
            updatedMatatu.seatLayout[seatIndex].isBooked = false;
            await updatedMatatu.save();
          }
        } catch (error) {
          console.error('Error in timeout handler:', error);
        }
      }, LOCK_DURATION);

      res.status(201).json({
        message: 'Seat locked successfully',
        lockedSeat: {
          seatNumber: newBooking.seatNumber,
          bookingId: newBooking._id,
          expiresAt: newBooking.bookingExpiry
        }
      });

    } catch (error) {
      console.error('Error locking seat:', error);
      res.status(500).json({ message: error.message });
    }
  },

  confirmBooking: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { bookingId } = req.body;

      if (!req.user || !req.user.id) {
        await session.abortTransaction();
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const booking = await Booking.findById(bookingId).session(session);
      if (!booking) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Booking not found' });
      }

      if (booking.user.toString() !== req.user.id) {
        await session.abortTransaction();
        return res.status(403).json({ message: 'Unauthorized to confirm this booking' });
      }

      if (booking.status !== 'pending') {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Booking already confirmed or cancelled' });
      }

      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      await booking.save({ session });

      const matatu = await Matatu.findById(booking.matatu).session(session);
      const seatIndex = matatu.seatLayout.findIndex(
        seat => seat.seatNumber === booking.seatNumber
      );
      matatu.seatLayout[seatIndex].isBooked = true;
      await matatu.save({ session });

      await session.commitTransaction();

      res.status(200).json({
        message: 'Booking confirmed successfully',
        booking: {
          bookingId: booking._id,
          price: booking.price,
          matatu: {
            registrationNumber: matatu.registrationNumber,
            departureTime: matatu.departureTime
          }
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error confirming booking:', error);
      res.status(500).json({ message: error.message });
    } finally {
      session.endSession();
    }
  },

  getBookedSeats: async (req, res) => {
    try {
      const { matatuId, date } = req.params;

      const bookings = await Booking.find({
        matatu: matatuId,
        travelDate: new Date(date),
        status: { $ne: 'cancelled' }
      });

      const bookedSeats = bookings.map(booking => booking.seatNumber);

      res.status(200).json({
        bookedSeats
      });

    } catch (error) {
      console.error('Error getting booked seats:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getLockedSeats: async (req, res) => {
    try {
      const { matatuId, date } = req.params;

      const lockedSeats = await Booking.find({
        matatu: matatuId,
        travelDate: new Date(date),
        status: 'pending',
        bookingExpiry: { $gt: new Date() }
      });

      res.status(200).json({
        lockedSeats: lockedSeats.map(booking => ({
          seatNumber: booking.seatNumber,
          userId: booking.user.toString()
        }))
      });

    } catch (error) {
      console.error('Error getting locked seats:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getTemporaryBookings: async (req, res) => {
    try {
      const { matatuId } = req.params;
      const userId = req.user.id;

      const temporaryBookings = await Booking.find({
        matatu: matatuId,
        user: userId,
        status: 'pending',
        createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
      });

      res.status(200).json({
        temporaryBookings,
      });

    } catch (error) {
      console.error('Error fetching temporary bookings:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getUserBookings: async (req, res) => {
    try {
      const userId = req.user.id;

      const bookings = await Booking.find({ user: userId }).populate('matatu', 'route seatLayout departureTime');

      res.status(200).json({
        bookings
      });

    } catch (error) {
      console.error('Error fetching user bookings:', error);
      res.status(500).json({ message: error.message });
    }
  },

  adminManageBookings: async (req, res) => {
    try {
      const bookings = await Booking.find().populate('user matatu', 'route seatNumber status paymentStatus');

      res.status(200).json({
        bookings
      });

    } catch (error) {
      console.error('Error fetching bookings for admin:', error);
      res.status(500).json({ message: error.message });
    }
  }
};

export { bookingController };