
import { io } from "../config/socket.js"; 
import Matatu from "../models/Matatu.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';

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
      // Verify payment and get matatu details
      console.log('💳 Verifying payment:', { payment_id });
      const payment = await Payment.findOne({
        _id: payment_id,
        matatu: new mongoose.Types.ObjectId(matatuId),
        seat_number: seatNumberInt,
        user: userId,
        status: 'completed'
      })
      .populate({
        path: 'matatu',
        populate: { path: 'route' }
      })
      .session(session);

      if (!payment) {
        throw new Error(`Payment not found for ID: ${payment_id}`);
      }

      if (!payment.matatu) {
        throw new Error(`Matatu not found for payment ID: ${payment_id}`);
      }

      // Find the seat based on seat_number
      const seat = payment.matatu.seatLayout.find(s => s.seatNumber === seatNumberInt);

      if (!seat) {
        throw new Error(`Seat number ${seatNumberInt} not found in matatu ${matatuId}`);
      }

      if (seat.isBooked) {
        throw new Error(`Seat number ${seatNumberInt} is already booked`);
      }

      // Generate travel date based on payment timestamp
      const paymentTimestamp = payment.createdAt || new Date();
      const travelDate = new Date(paymentTimestamp);
      travelDate.setHours(0, 0, 0, 0); // Reset to start of day

      // Update the seat as booked
      const seatUpdateResult = await Matatu.updateOne(
        {
          _id: new mongoose.Types.ObjectId(matatuId),
          "seatLayout.seatNumber": seatNumberInt
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

      // Create the booking record with the generated travel date
      console.log('📝 Creating booking record');
      const booking = new Booking({
        matatu: matatuId,
        seat: seat._id,
        seatNumber: seatNumberInt,
        user: userId,
        route: payment.matatu.route._id,
        payment: payment_id,
        status: 'confirmed',
        travelDate: travelDate,
        fare: payment.amount,
        created_at: new Date()
      });

      await booking.save({ session });
      console.log('✅ Booking saved successfully:', booking._id);

      await session.commitTransaction();
      console.log('✅ Transaction committed successfully');

      // Generate QR Code for verification link
      const verificationLink = `${process.env.BASE_URL}/verify-booking?booking_id=${booking._id}`;
      const qrCodeDataURL = await QRCode.toDataURL(verificationLink); // Convert to image format

      console.log('✅ QR Code generated for booking:', verificationLink);

      // Emit real-time updates
      if (io) {
        io.to(`matatu-${matatuId}`).emit('seat_update', {
          matatu_id: matatuId,
          seat_number: seatNumberInt,
          status: 'booked',
          user_id: userId
        });

        io.to(`user-${userId}`).emit('booking_confirmed', {
          booking_id: booking._id,
          payment_id: payment_id,
          status: 'confirmed'
        });
      } else {
        console.error('Socket.io (io) is not defined');
      }

      res.status(200).json({
        message: "Booking confirmed successfully",
        booking: {
          ...booking.toObject(),
          qr_code: qrCodeDataURL, // Include QR Code image
          verification_link: verificationLink, // Include verification link
          matatu_details: {
            registration: payment.matatu.registrationNumber,
            route: payment.matatu.route,
            departure_time: payment.matatu.departureTime,
            travel_date: travelDate
          }
        }
      });

    } catch (error) {
      console.log('❌ Error during transaction:', error);
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

    const userId = new mongoose.Types.ObjectId(String(req.user.userId));

    // Fetch only the user's bookings
    const bookings = await Booking.find({ user: userId })
      .populate('matatu', 'name registration_number') // Exclude seatLayout
      .populate('route', 'name from to')
      .populate('payment', 'amount method status')
      .select('selectedSeats status booking_date payment matatu route') // Explicitly include selectedSeats
      .sort({ created_at: -1 });

    if (!bookings.length) {
      return res.status(404).json({ message: "No bookings found for this user" });
    }

    // Format the response to include only necessary data
    const bookingsWithQR = bookings.map((booking) => ({
      _id: booking._id,
      status: booking.status,
      booking_date: booking.booking_date,
      selectedSeats: booking.selectedSeats, // Ensures only booked seats are returned
      payment: booking.payment,
      matatu: {
        _id: booking.matatu._id,
        name: booking.matatu.name,
        registration_number: booking.matatu.registration_number,
      },
      route: booking.route,
      qr_verification_link: `https://moigosip.onrender.com/verify-booking?booking_id=${booking._id}`,
    }));

    res.status(200).json({ bookings: bookingsWithQR });
  } catch (err) {
    console.error('Error in getUserBookings:', err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};


const verifyBooking = async (req, res) => {
  const { booking_id } = req.query;

  console.log('🔍 Admin verifying booking:', booking_id);

  try {
    const booking = await Booking.findById(booking_id)
      .populate('matatu')
      .populate('user')
      .populate('payment');

    if (!booking) {
      return res.status(404).json({ message: "Booking not found. Possible fraud! 🚨" });
    }

    res.status(200).json({
      message: "Booking verified successfully ✅",
      booking: {
        id: booking._id,
        user: booking.user.name,
        seat: booking.seatNumber,
        matatu: booking.matatu.registrationNumber,
        route: booking.matatu.route,
        status: booking.status,
        travelDate: booking.travelDate,
        payment_status: booking.payment.status
      }
    });

  } catch (error) {
    console.error('❌ Error in verifyBooking:', error);
    res.status(500).json({ message: "Server error", error: error.message });
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
  verifyBooking,
  getMatatuBookings
}; 