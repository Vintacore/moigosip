import Matatu from "../models/Matatu.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
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

    const matatu = await Matatu.findOne(
      { 
        _id: matatuId,
        "seatLayout.seatNumber": parseInt(seat_number)
      },
      {
        "seatLayout.$": 1,
        registrationNumber: 1,
        route: 1,
        departureTime: 1
      }
    ).populate('route', 'origin destination');

    if (!matatu) {
      return res.status(404).json({ message: "Matatu not found or seat does not exist" });
    }

    const seat = matatu.seatLayout[0];
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

    // Reset expired locks
    try {
      await Matatu.updateMany(
        { "seatLayout.lock_expiry": { $lt: new Date() } },
        { 
          $set: { "seatLayout.$[].locked_by": null, "seatLayout.$[].lock_expiry": null } 
        }
      );
    } catch (error) {
      console.error("Error resetting expired locks:", error);
      return res.status(500).json({ message: "Failed to reset expired locks", error: error.message });
    }

    // Find and lock the seat using matatuId and seatId
    const matatu = await Matatu.findOneAndUpdate(
      {
        _id: matatuId,
        "seatLayout._id": seatId,
        "seatLayout.isBooked": false,
        $or: [
          { "seatLayout.locked_by": null },
          { "seatLayout.lock_expiry": { $lt: new Date() } }
        ]
      },
      {
        $set: {
          "seatLayout.$.locked_by": userId,
          "seatLayout.$.lock_expiry": lockExpiry
        }
      },
      { new: true }
    ).populate('route', 'origin destination');

    if (!matatu) {
      return res.status(400).json({ 
        message: "Seat is either already locked, booked, or does not exist" 
      });
    }

    // Find the locked seat and respond
    const seat = matatu.seatLayout.find(s => s._id.toString() === seatId);
    res.status(200).json({
      message: `Seat ${seat.seatNumber} locked successfully`,
      lock_expiry: seat.lock_expiry,
      matatu_details: {
        registration: matatu.registrationNumber,
        route: matatu.route,
        departure_time: matatu.departureTime
      },
      seat
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
  const { seat_number, payment_id } = req.body; // Changed from payment_reference to payment_id

  if (!payment_id) {
    return res.status(400).json({ message: "Payment ID is required" });
  }

  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const userId = req.user.userId;

    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Verify seat is not already booked by someone else
      const existingBooking = await Booking.findOne({
        matatu: matatuId,
        seat_number: parseInt(seat_number),
        status: 'booked'
      });

      if (existingBooking) {
        throw new Error("Seat already booked by another user");
      }

      // Verify payment status first
      const payment = await PaymentModel.findOne({
        _id: payment_id,
        matatu: matatuId,
        seat_number: parseInt(seat_number),
        user: userId,
        status: 'completed'
      });

      if (!payment) {
        throw new Error("Valid completed payment not found");
      }

      const matatu = await Matatu.findOne({
        _id: matatuId,
        "seatLayout.seatNumber": parseInt(seat_number)
      }).populate('route');

      if (!matatu) {
        throw new Error("Matatu not found");
      }

      const seat = matatu.seatLayout.find(s => s.seatNumber === parseInt(seat_number));
      
      if (!seat) {
        throw new Error("Seat not found");
      }

      const { hasValidLock, isYourLock } = validateSeatStatus(seat, userId);
      if (!hasValidLock || !isYourLock) {
        throw new Error("Seat lock has expired or is not locked by you");
      }

      const updatedMatatu = await Matatu.findOneAndUpdate(
        {
          _id: matatuId,
          "seatLayout.seatNumber": parseInt(seat_number),
          "seatLayout.locked_by": userId,
          "seatLayout.isBooked": false
        },
        {
          $set: {
            "seatLayout.$.isBooked": true,
            "seatLayout.$.booked_by": userId,
            "seatLayout.$.booking_time": new Date()
          },
          $unset: {
            "seatLayout.$.locked_by": "",
            "seatLayout.$.lock_expiry": ""
          }
        },
        { session, new: true }
      );

      if (!updatedMatatu) {
        throw new Error("Failed to update seat status");
      }

      const booking = new Booking({
        matatu: matatuId,
        seat_number: parseInt(seat_number),
        user: userId,
        payment_reference: payment_id, // Use payment_id as reference
        booking_date: new Date(),
        route: matatu.route._id
      });

      await booking.save({ session });
      await session.commitTransaction();

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
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

  } catch (err) {
    console.error('Error in bookSeat:', err);
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

// Mock payment verification
const verifyPayment = async (paymentReference) => {
  // Replace with actual payment verification logic
  return true;
};

export const bookingController = {
  checkSeatAvailability,
  lockSeat,
  bookSeat,
  getUserBookings,
  getMatatuBookings
};