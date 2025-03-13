
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
const verifyBooking = async (req, res) => {
  const { booking_id } = req.query;

  console.log('🔍 Checking booking:', { booking_id });

  if (!booking_id) {
    return res.status(400).json({ message: "Booking ID is required" });
  }

  try {
    // ✅ Find booking with relevant details
    const booking = await Booking.findById(booking_id)
      .populate('user', 'name phone email')
      .populate('matatu', 'registrationNumber seatLayout departureTime')
      .populate('route', 'name startLocation endLocation')
      .populate('payment', 'amount paymentMethod referenceNumber');

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // ✅ Return booking details (NO UPDATES)
    res.status(200).json({
      message: "Booking found",
      booking: {
        _id: booking._id,
        status: booking.status,
        travelDate: booking.travelDate,
        seatNumber: booking.seatNumber,
        fare: booking.fare,
        passenger: {
          name: booking.user?.name,
          phone: booking.user?.phone,
          email: booking.user?.email
        },
        journey: {
          matatu: booking.matatu?.registrationNumber,
          route: {
            name: booking.route?.name,
            from: booking.route?.startLocation,
            to: booking.route?.endLocation
          },
          departureTime: booking.matatu?.departureTime
        },
        payment: {
          amount: booking.payment?.amount,
          method: booking.payment?.paymentMethod,
          reference: booking.payment?.referenceNumber
        }
      }
    });

  } catch (err) {
    console.error('❌ Error in verifyBooking:', err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

const adminToggleSeatStatus = async (req, res) => {
  try {
      const { matatuId, seatNumber } = req.params;
      const matatu = await Matatu.findById(matatuId);

      if (!matatu) {
          return res.status(404).json({ message: 'Matatu not found' });
      }

      const seat = matatu.seatLayout.find(seat => seat.seatNumber == seatNumber);
      if (!seat) {
          return res.status(404).json({ message: 'Seat not found' });
      }

      if (seat.isBooked) {
          // 🟥 UNBOOK: Reset booking details
          seat.isBooked = false;
          seat.booked_by = null;
      } else {
          // 🟩 BOOK: Assign to admin
          seat.isBooked = true;
          seat.booked_by = {
              _id: req.user.id,
              username: req.user.username,
              email: req.user.email
          };
      }

      await matatu.save();

      return res.json({
          message: `Seat ${seatNumber} is now ${seat.isBooked ? 'BOOKED by ADMIN' : 'AVAILABLE'}`,
          seat
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const adminBookSeat = async (req, res) => {
  const { matatuId, seatNumber } = req.params;
  const { adminId, adminUsername } = req.body; // Admin details

  console.log(`🚀 Admin Booking Seat: ${seatNumber} | Admin ID: ${adminId}`);

  if (!adminId) {
      return res.status(401).json({ message: "Unauthorized: Admin ID required" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const matatu = await Matatu.findById(matatuId).session(session);
      if (!matatu) throw new Error("Matatu not found");

      const seat = matatu.seatLayout.find(s => s.seatNumber === parseInt(seatNumber));
      if (!seat) throw new Error(`Seat ${seatNumber} not found`);

      // Assign admin to the seat
      seat.isBooked = true;
      seat.booked_by = {
          _id: adminId,
          username: adminUsername || "Admin"
      };

      await matatu.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Emit real-time update
      if (io) {
          io.to(`matatu-${matatuId}`).emit("seat_update", {
              matatu_id: matatuId,
              seat_number: parseInt(seatNumber),
              status: "booked",
              booked_by: seat.booked_by
          });
      }

      res.status(200).json({
          message: `Seat ${seatNumber} booked by Admin`,
          seat
      });

  } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("❌ Admin Booking Error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
  }
};
const adminModifyBooking = async (req, res) => {
  const { matatuId, seatNumber } = req.params;
  const { newUserId, newUsername } = req.body;

  console.log(`🔄 Admin Modifying Seat: ${seatNumber}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const matatu = await Matatu.findById(matatuId).session(session);
      if (!matatu) throw new Error("Matatu not found");

      const seat = matatu.seatLayout.find(s => s.seatNumber === parseInt(seatNumber));
      if (!seat || !seat.isBooked) throw new Error(`Seat ${seatNumber} is not booked`);

      // Change booking details
      seat.booked_by = {
          _id: newUserId || seat.booked_by._id,
          username: newUsername || seat.booked_by.username
      };

      await matatu.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
          message: `Seat ${seatNumber} booking modified`,
          seat
      });

  } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("❌ Admin Modification Error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
  }
};
const adminUnbookSeat = async (req, res) => {
  const { matatuId, seatNumber } = req.params;

  console.log(`🗑️ Admin Unbooking Seat: ${seatNumber}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const matatu = await Matatu.findById(matatuId).session(session);
      if (!matatu) throw new Error("Matatu not found");

      const seat = matatu.seatLayout.find(s => s.seatNumber === parseInt(seatNumber));
      if (!seat || !seat.isBooked) throw new Error(`Seat ${seatNumber} is not booked`);

      // Remove booking
      seat.isBooked = false;
      seat.booked_by = null;

      await matatu.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
          message: `Seat ${seatNumber} is now unbooked`,
          seat
      });

  } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("❌ Admin Unbooking Error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
  }
};
const getAllBookings = async (req, res) => {
  try {
    // Fetch all bookings with necessary population
    const bookings = await Booking.find()
      .populate('user', 'name username email phone_number')
      .populate({
        path: 'matatu',
        select: 'registrationNumber totalSeats departureTime currentPrice seatLayout route',
        populate: {
          path: 'route',
          select: 'name from to'
        }
      })
      .populate('route', 'name from to')
      .populate('payment', 'amount method status')
      .sort({ created_at: -1 }); // Using created_at from your schema

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ message: "No bookings found" });
    }

    // Format the response with proper null checks
    const formattedBookings = bookings.map((booking) => {
      // Get seat details from matatu's seatLayout
      let seatDetail = null;
      if (booking.matatu && booking.matatu.seatLayout) {
        seatDetail = booking.matatu.seatLayout.find(
          seat => seat.seatNumber === booking.seatNumber
        );
      }

      return {
        _id: booking._id,
        user: booking.user ? {
          _id: booking.user._id,
          name: booking.user.name,
          username: booking.user.username,
          email: booking.user.email,
          phone_number: booking.user.phone_number,
        } : null,
        status: booking.status,
        travelDate: booking.travelDate,
        fare: booking.fare,
        seatNumber: booking.seatNumber,
        seatDetail: seatDetail ? {
          isBooked: seatDetail.isBooked,
          booked_by: seatDetail.booked_by
        } : null,
        matatu: booking.matatu ? {
          _id: booking.matatu._id,
          registrationNumber: booking.matatu.registrationNumber,
          departureTime: booking.matatu.departureTime,
          currentPrice: booking.matatu.currentPrice
        } : null,
        route: booking.route ? {
          _id: booking.route._id,
          name: booking.route.name,
          from: booking.route.from,
          to: booking.route.to,
        } : null,
        payment: booking.payment,
        qr_verification_link: `https://moihub.onrender.com/api/bookings/verify-booking?booking_id=${booking._id}`,
      };
    });

    res.status(200).json({ bookings: formattedBookings });
  } catch (err) {
    console.error('Error fetching all bookings:', err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const userId = req.params.userId || (req.user ? req.user.userId : null);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized access - No user ID provided" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const userObjectId = new mongoose.Types.ObjectId(String(userId));

    // Fetch bookings along with necessary details
    const bookings = await Booking.find({ user: userObjectId })
      .populate('user', 'username email phone_number')
      .populate({
        path: 'matatu',
        select: 'registrationNumber totalSeats departureTime currentPrice seatLayout route',
        populate: {
          path: 'route',
          select: 'name from to',
        },
      })
      .sort({ createdAt: -1 });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ message: "No bookings found for this user" });
    }

    // Format response properly
    const formattedBookings = bookings.map((booking) => {
      const formattedBooking = {
        _id: booking._id,
        user: {
          _id: booking.user?._id || null,
          username: booking.user?.username || '',
          email: booking.user?.email || '',
          phone_number: booking.user?.phone_number || '',
        },
        status: booking.status || 'unknown',
        travelDate: booking.travelDate,
        bookingDate: booking.bookingDate,
        price: booking.price || 0,
        paymentStatus: booking.paymentStatus || 'pending',
        seatNumber: booking.seatNumber || null,
        matatu: booking.matatu
          ? {
              _id: booking.matatu._id,
              registrationNumber: booking.matatu.registrationNumber || '',
              departureTime: booking.matatu.departureTime || '',
              currentPrice: booking.matatu.currentPrice || 0,
              totalSeats: booking.matatu.totalSeats || 0,
            }
          : null,
        route: booking.matatu?.route
          ? {
              _id: booking.matatu.route._id,
              name: booking.matatu.route.name || '',
              from: booking.matatu.route.from || '',
              to: booking.matatu.route.to || '',
            }
          : null,
        qr_verification_link: `https://moihub.onrender.com/api/bookings/verify-booking?booking_id=${booking._id}`,
      };

      return formattedBooking;
    });

    res.status(200).json({ bookings: formattedBookings });
  } catch (err) {
    console.error('Error in getUserBookings:', err);
    res.status(500).json({ message: "Server error", error: err.message });
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
  adminToggleSeatStatus,
  getAllBookings,
  getUserBookings,
  verifyBooking,
  adminBookSeat,
  adminModifyBooking,
  adminUnbookSeat,
  getMatatuBookings
}; 