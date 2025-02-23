import Matatu from "../models/Matatu.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const validateSeatStatus = (seat, userId) => {
  const currentTime = new Date();
  const seatLockedBy = seat?.locked_by?.toString();
  const lockExpiry = seat?.lock_expiry ? new Date(seat.lock_expiry) : null;
  const hasValidLock = lockExpiry && lockExpiry > currentTime;
  const isYourLock = seatLockedBy === userId?.toString();

  return {
    hasValidLock,
    isYourLock,
    lockExpiry
  };
};

const checkSeatAvailability = async (req, res) => {
  const { matatuId } = req.params;
  const { seat_number } = req.query;

  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    // Convert seat_number to integer to ensure proper matching
    const seatNumberInt = parseInt(seat_number);
    
    const matatu = await Matatu.findById(matatuId).populate('route', 'origin destination');
    if (!matatu) {
      return res.status(404).json({ message: "Matatu not found" });
    }

    // Find the specific seat in the seatLayout array
    const seat = matatu.seatLayout.find(s => s.seatNumber === seatNumberInt);
    if (!seat) {
      return res.status(404).json({ message: "Seat not found" });
    }

    const { hasValidLock, isYourLock, lockExpiry } = validateSeatStatus(seat, req.user.userId);

    if (seat.isBooked) {
      return res.status(400).json({
        message: `Seat ${seat_number} is already booked`,
        status: 'booked'
      });
    }

    // Check if the seat is locked
    if (hasValidLock) {
      // If the seat is locked by the user
      if (isYourLock) {
        return res.status(200).json({
          message: `Seat ${seat_number} is locked by you`,
          status: 'locked',
          locked_by_you: true,
          lock_expiry: lockExpiry,
          matatu_details: {
            registration: matatu.registrationNumber,
            route: matatu.route,
            departure_time: matatu.departureTime
          },
          seat: {
            seatNumber: seat.seatNumber,
            isBooked: seat.isBooked,
            _id: seat._id
          }
        });
      }
      
      // If the seat is locked by another user
      return res.status(400).json({
        message: `Seat ${seat_number} is temporarily locked by another user`,
        status: 'locked',
        locked_by_you: false
      });
    }

    return res.status(200).json({
      message: `Seat ${seat_number} is available`,
      status: 'available',
      locked_by_you: false,
      matatu_details: {
        registration: matatu.registrationNumber,
        route: matatu.route,
        departure_time: matatu.departureTime
      },
      seat: {
        seatNumber: seat.seatNumber,
        isBooked: seat.isBooked,
        _id: seat._id
      }
    });

  } catch (err) {
    console.error('Error in checkSeatAvailability:', err);
    res.status(500).json({ 
      message: "Server error", 
      error: err.message 
    });
  }
};

const lockSeat = async (req, res) => {
  const { matatuId, seatId } = req.params;

  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const userId = req.user.userId;
    const lockExpiry = new Date();
    lockExpiry.setMinutes(lockExpiry.getMinutes() + 3);

    // First, reset any expired locks
    await Matatu.updateMany(
      { "seatLayout.lock_expiry": { $lt: new Date() } },
      { 
        $set: { 
          "seatLayout.$[expiredSeat].locked_by": null, 
          "seatLayout.$[expiredSeat].lock_expiry": null 
        } 
      },
      {
        arrayFilters: [{ "expiredSeat.lock_expiry": { $lt: new Date() } }]
      }
    );

    // Also, release any previous locks by this user
    await Matatu.updateMany(
      { "seatLayout.locked_by": userId },
      { 
        $set: { 
          "seatLayout.$[userSeat].locked_by": null, 
          "seatLayout.$[userSeat].lock_expiry": null 
        } 
      },
      {
        arrayFilters: [{ "userSeat.locked_by": userId }]
      }
    );

    // Now proceed to lock the specific seat
    const matatu = await Matatu.findById(matatuId);
    if (!matatu) {
      return res.status(404).json({ message: "Matatu not found" });
    }

    // Find the seat index to update
    const seatIndex = matatu.seatLayout.findIndex(
      seat => seat._id.toString() === seatId && !seat.isBooked
    );

    if (seatIndex === -1) {
      return res.status(400).json({ 
        message: "Seat is either already booked or does not exist" 
      });
    }

    // Check if seat is already locked by someone else
    const seat = matatu.seatLayout[seatIndex];
    if (seat.locked_by && 
        seat.locked_by.toString() !== userId.toString() && 
        new Date(seat.lock_expiry) > new Date()) {
      return res.status(400).json({ 
        message: "Seat is already locked by another user" 
      });
    }

    // Update the specific seat
    matatu.seatLayout[seatIndex].locked_by = userId;
    matatu.seatLayout[seatIndex].lock_expiry = lockExpiry;
    
    await matatu.save();
    
    // Reload the matatu to get the updated data with populated route
    const updatedMatatu = await Matatu.findById(matatuId).populate('route', 'origin destination');
    const updatedSeat = updatedMatatu.seatLayout[seatIndex];

    res.status(200).json({
      message: `Seat ${updatedSeat.seatNumber} locked successfully`,
      lock_expiry: updatedSeat.lock_expiry,
      matatu_details: {
        registration: updatedMatatu.registrationNumber,
        route: updatedMatatu.route,
        departure_time: updatedMatatu.departureTime
      },
      seat: updatedSeat
    });

  } catch (err) {
    console.error('Error in lockSeat:', err);
    res.status(500).json({ 
      message: "Server error: Failed to lock seat", 
      error: err.message 
    });
  }
};

const bookSeat = async (req, res) => {
  const { matatuId } = req.params;
  const { seat_number, payment_id } = req.body;

  console.log('🚀 Starting booking process:', {
    matatuId,
    seat_number,
    payment_id,
    userId: req.user?.userId
  });

  if (!payment_id) {
    return res.status(400).json({ message: "Payment ID is required" });
  }

  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const userId = req.user.userId;
    const seatNumberInt = parseInt(seat_number);

    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // First verify the payment - this is crucial
      console.log('💳 Verifying payment:', { payment_id });
      const payment = await Payment.findOne({
        _id: payment_id,
        matatu: matatuId,
        seat_number: seatNumberInt,
        user: userId,
        status: 'completed'
      }).lean();

      if (!payment) {
        throw new Error("Valid completed payment not found");
      }

      // Get matatu details
      console.log('🚐 Fetching matatu details');
      const matatu = await Matatu.findById(matatuId).populate('route');
      
      if (!matatu) {
        throw new Error("Matatu not found");
      }

      // Find and update the seat directly - no need to check locks since payment is confirmed
      const seatUpdateResult = await Matatu.updateOne(
        {
          _id: matatuId,
          "seatLayout.seatNumber": seatNumberInt,
          // Ensure seat isn't already booked - final safety check
          "seatLayout.isBooked": { $ne: true }
        },
        {
          $set: {
            "seatLayout.$.isBooked": true,
            "seatLayout.$.booked_by": userId,
            "seatLayout.$.booking_time": new Date(),
            "seatLayout.$.locked_by": null,
            "seatLayout.$.lock_expiry": null
          }
        },
        { session }
      );

      if (seatUpdateResult.modifiedCount === 0) {
        throw new Error("Failed to update seat - may already be booked");
      }

      // Create the booking record
      console.log('📝 Creating booking record');
      const booking = new Booking({
        matatu: matatuId,
        seat_number: seatNumberInt,
        user: userId,
        payment_reference: payment_id,
        booking_date: new Date(),
        route: matatu.route._id,
        status: 'confirmed'
      });

      await booking.save({ session });
      console.log('✅ Booking saved successfully:', booking._id);

      await session.commitTransaction();
      console.log('✅ Transaction committed successfully');

      res.status(200).json({
        message: "Booking confirmed successfully",
        booking: {
          ...booking.toObject(),
          matatu_details: {
            registration: matatu.registrationNumber,
            route: matatu.route,
            departure_time: matatu.departureTime
          }
        }
      });

    } catch (error) {
      console.log('❌ Error during transaction:', error.message);
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

  } catch (err) {
    console.error('❌ Error in bookSeat:', err);
    res.status(500).json({
      message: err.message || "Server error",
      error: err.message
    });
  }
};

const getUserBookings = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const bookings = await Booking.find({ user: req.user.userId })
      .populate('matatu')
      .populate('route')
      .sort({ booking_date: -1 });

    if (!bookings.length) {
      return res.status(404).json({ message: "No bookings found for this user" });
    }

    res.status(200).json({ bookings });
  } catch (err) {
    console.error('Error in getUserBookings:', err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

const getMatatuBookings = async (req, res) => {
  const { matatuId } = req.params;

  try {
    const bookings = await Booking.find({ matatu: matatuId })
      .populate('user', 'name email')
      .populate('route')
      .sort({ booking_date: -1 });

    if (!bookings.length) {
      return res.status(404).json({ message: "No bookings found for this matatu" });
    }

    res.status(200).json({ bookings });
  } catch (err) {
    console.error('Error in getMatatuBookings:', err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

export const bookingController = {
  checkSeatAvailability,
  lockSeat,
  bookSeat,
  getUserBookings,
  getMatatuBookings
}; 