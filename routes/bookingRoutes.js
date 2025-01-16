import express from 'express';
import { bookingController } from '../controllers/bookingController.js';
import { verifyToken } from '../middleware/authMiddleware.js';  // Correctly imported verifyToken
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

// Check seat availability
router.get('/check-availability', bookingController.checkSeatAvailability);

// Route to get booked seats for a specific matatu and date (Public or admin)
router.get('/booked-seats/:matatuId/:date', bookingController.getBookedSeats);

// Route to get locked seats for a specific matatu and date (Public or admin)
router.get('/locked-seats/:matatuId/:date', bookingController.getLockedSeats);

// Route to lock a seat (Authenticated user)
router.post('/lock-seat', verifyToken, bookingController.lockSeat);

// Route to confirm a booking (Authenticated user)
router.post('/confirm-booking', verifyToken, bookingController.confirmBooking);

// Route to get temporary bookings for a specific matatu
router.get('/temporary/:matatuId', verifyToken, bookingController.getTemporaryBookings);

// Route to get all bookings for a user (Authenticated user)
router.get('/my-bookings', verifyToken, bookingController.getUserBookings);

// Admin-specific route to manage bookings (Admin only)
router.get('/admin-bookings', adminAuth, bookingController.adminManageBookings);

export default router;