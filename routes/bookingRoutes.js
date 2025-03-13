import express from "express";
import { bookingController } from "../controllers/bookingController.js";
import { paymentController } from "../controllers/PaymentController.js";
import verifyToken from "../middleware/authMiddleware.js"; 
import adminAuth from '../middleware/adminAuth.js';  

const router = express.Router();

// Seat availability and locking routes
router.get("/:matatuId/check-seat", verifyToken, bookingController.checkSeatAvailability);
router.post("/:matatuId/lock/:seatId", verifyToken, bookingController.lockSeat);


// Payment processing routes
// Payment routes - these will be under /api/bookings/payments/... 
router.post('/payments/initiate', verifyToken, paymentController.initiatePayment); 
router.post('/payments/callback', paymentController.handleCallback);
router.get('/payments/status/:paymentId', verifyToken, paymentController.checkPaymentStatus);
router.get('/payments', verifyToken, paymentController.getPayments);
router.get('/payments/:paymentId', verifyToken, paymentController.getPaymentById);
router.put('/payments/:paymentId', verifyToken, paymentController.updatePaymentStatus);

// Booking management routes
router.post("/:matatuId/book", verifyToken, bookingController.bookSeat);
router.get("/user/:userId", verifyToken, bookingController.getUserBookings);
router.get("/", adminAuth, bookingController.getAllBookings);

router.put('/verify-booking', adminAuth, bookingController.verifyBooking);
router.get("/:matatuId", verifyToken, bookingController.getMatatuBookings);
router.post('/admin/toggle-seat/:matatuId/:seatNumber', adminAuth, bookingController.adminToggleSeatStatus);
router.post('/admin/book-seat/:matatuId/:seatNumber',  adminAuth, bookingController.adminBookSeat);
router.put('/admin/modify-booking/:matatuId/:seatNumber',  adminAuth, bookingController.adminModifyBooking);
router.delete('/admin/unbook-seat/:matatuId/:seatNumber',  adminAuth, bookingController.adminUnbookSeat);
  
 
export default router;  