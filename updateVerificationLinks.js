import Payment from "../models/Payment.js";
import Matatu from "../models/Matatu.js";
import axios from 'axios';
import { io } from '../config/socket.js';
import jwt from 'jsonwebtoken';


// MPesa helper functions
const generateMPesaAccessToken = async () => {
  const consumer_key = process.env.MPESA_CONSUMER_KEY;
  const consumer_secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64');

  try {
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error generating MPesa token:', error);
    throw new Error('Failed to generate MPesa token');
  }
};

const initiateMPesaSTKPush = async (phone, amount, paymentId) => {
  const token = await generateMPesaAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  
  const password = Buffer.from(
    `${shortcode}${passkey}${timestamp}`
  ).toString('base64');

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: `${process.env.BASE_URL}/api/bookings/payments/callback`,
        AccountReference: paymentId,
        TransactionDesc: "Matatu Seat Booking"
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error initiating MPesa payment:', error);
    throw new Error('Failed to initiate MPesa payment');
  }
};

// Main controller functions
const initiatePayment = async (req, res) => {
  console.log('=== Starting Payment Initiation ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('User ID:', req.user?.userId);
  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  try {
    // Authorization check
    if (!req.user?.userId) {
      console.log('❌ Authorization failed - no user ID');
      return res.status(401).json({ message: "Unauthorized access" });
    }

    // Validate phone number
    const { phone_number } = req.body;
    if (!phone_number) {
      console.log('❌ Validation failed - missing phone number');
      return res.status(400).json({ message: "Phone number is required" });
    }

    console.log('🔍 Finding matatu with locked seat...');
    // Find matatu with a seat locked by this user
    const matatu = await Matatu.findOne({
      "seatLayout": {
        $elemMatch: {
          locked_by: req.user.userId,
          lock_expiry: { $gt: new Date() }
        }
      }
    }).populate('route');

    console.log('Matatu search result:', matatu ? {
      id: matatu._id,
      registration: matatu.registrationNumber,
      route: matatu.route
    } : 'none');

    if (!matatu) {
      console.log('❌ No matatu found with locked seat');
      return res.status(400).json({ 
        message: "Please lock a seat first before initiating payment" 
      });
    }

    console.log('🔍 Finding locked seat in layout...');
    // Get the locked seat
    const lockedSeat = matatu.seatLayout.find(
      seat => seat.locked_by?.toString() === req.user.userId.toString()
    );

    console.log('Locked seat details:', {
      seatNumber: lockedSeat?.seatNumber,
      lockExpiry: lockedSeat?.lock_expiry
    });

    if (!lockedSeat) {
      console.log('❌ Locked seat not found in layout');
      return res.status(400).json({ 
        message: "No locked seat found for this user" 
      });
    }

    // Create payment record
    console.log('💾 Creating payment record...');
    const payment = new Payment({
      user: req.user.userId,
      matatu: matatu._id,
      seat_number: lockedSeat.seatNumber,
      amount: matatu.route.basePrice || 1,
      phone_number: phone_number,
      status: 'pending',
      created_at: new Date()
    });

    console.log('Payment object created:', {
      id: payment._id,
      amount: payment.amount,
      seatNumber: payment.seat_number,
      status: payment.status
    });

    console.log('💾 Saving payment record...');
    await payment.save();
    console.log('✅ Payment record saved successfully');

    // Initiate MPesa STK Push
    console.log('🚀 Initiating MPesa STK Push...');
    console.log('STK Push parameters:', {
      phone: phone_number,
      amount: payment.amount,
      paymentId: payment._id.toString()
    });

    const mpesaResponse = await initiateMPesaSTKPush(
      phone_number,
      payment.amount,
      payment._id.toString()
    );
    console.log('MPesa STK Push Response:', mpesaResponse);

    // Update payment with MPesa checkout request ID
    console.log('📝 Updating payment with checkout request ID...');
    payment.provider_reference = mpesaResponse.CheckoutRequestID;
    payment.status = 'stk_pushed';
    await payment.save();
    console.log('✅ Payment updated with checkout request ID');

    // Emit socket event
    console.log('📡 Emitting socket event...');
    io.to(`user-${req.user.userId}`).emit('payment_requested', {
      payment_id: payment._id,
      status: 'stk_pushed',
      checkout_request_id: mpesaResponse.CheckoutRequestID
    });
    console.log('✅ Socket event emitted');

    // Prepare response
    const response = {
      message: "Payment initiated successfully",
      payment_id: payment._id,
      checkout_request_id: mpesaResponse.CheckoutRequestID,
      amount: payment.amount,
      matatu_details: {
        registration: matatu.registrationNumber,
        route: matatu.route,
        departure_time: matatu.departureTime
      },
      seat: {
        number: lockedSeat.seatNumber,
        _id: lockedSeat._id
      },
      status: 'stk_pushed'
    };

    console.log('📤 Sending success response:', response);
    res.status(200).json(response);
    console.log('=== Payment Initiation Completed ===');

    // Start verification process after 20 seconds
    if (payment && payment._id) {
      console.log(`🕒 Scheduling payment verification for ID: ${payment._id}`);
      setTimeout(() => verifyPayment(payment._id), 20000);
    } else {
      console.log("❌ Payment verification skipped: No valid payment ID.");
    }

  } catch (error) {
    console.error('❌ Error in initiatePayment:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      message: "Failed to initiate payment",
      error: error.message
    });
  }
};


// Modify the handleCallback function to be more robust
const handleCallback = async (req, res) => {
  const requestId = Date.now().toString();
  console.log(`[${requestId}] ================== MPESA CALLBACK RECEIVED ==================`);
  console.log(`[${requestId}] Timestamp:`, new Date().toISOString());
  console.log(`[${requestId}] Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[${requestId}] Raw Body:`, JSON.stringify(req.body, null, 2));

  try {
    // Validate callback structure
    if (!req.body?.Body?.stkCallback || 
        !req.body.Body.stkCallback.CheckoutRequestID || 
        req.body.Body.stkCallback.ResultCode === undefined) {
      console.error(`[${requestId}] ❌ Invalid callback payload structure`);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Invalid callback payload" 
      });
    }

    const {
      Body: {
        stkCallback: {
          MerchantRequestID,
          CheckoutRequestID,
          ResultCode,
          ResultDesc,
          CallbackMetadata
        }
      }
    } = req.body;

    console.log(`[${requestId}] Processing callback:`, {
      CheckoutRequestID,
      ResultCode,
      ResultDesc
    });

    // Find and validate payment
    const payment = await Payment.findOne({ 
      provider_reference: CheckoutRequestID,
      status: { $nin: ['completed', 'failed', 'expired', 'refund_required'] }
    }).populate('matatu');

    if (!payment) {
      console.log(`[${requestId}] ❌ Payment not found or already processed:`, CheckoutRequestID);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Payment not found or already processed" 
      });
    }

    console.log(`[${requestId}] Found payment:`, {
      paymentId: payment._id,
      userId: payment.user,
      matatuId: payment.matatu?._id,
      currentStatus: payment.status
    });

    // Extract transaction details
    let transactionDetails = {};
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      transactionDetails = CallbackMetadata.Item.reduce((acc, item) => {
        switch(item.Name) {
          case "MpesaReceiptNumber":
            acc.receipt_number = item.Value;
            break;
          case "TransactionDate":
            acc.transaction_date = item.Value;
            break;
          case "Amount":
            acc.amount = item.Value;
            break;
          case "PhoneNumber":
            acc.phone_number = item.Value;
            break;
        }
        return acc;
      }, {});

      console.log(`[${requestId}] Transaction details:`, transactionDetails);
    }

    // Update payment status atomically
    const updatedPayment = await Payment.findOneAndUpdate(
      { 
        _id: payment._id,
        status: { $nin: ['completed', 'failed', 'expired', 'refund_required'] }
      },
      {
        $set: {
          status: ResultCode === 0 ? 'completed' : 'failed',
          provider_response: ResultDesc,
          transaction_details: transactionDetails,
          updated_at: new Date(),
          last_processed_at: new Date(),
          processing_request_id: requestId
        }
      },
      { new: true }
    );

    if (!updatedPayment) {
      console.log(`[${requestId}] Payment was already processed by another request`);
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Payment already processed"
      });
    }

    // Send immediate response to MPesa
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // Emit initial status update
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: updatedPayment.status,
      message: ResultDesc
    });

    // Process successful payment
    if (ResultCode === 0) {
      console.log(`[${requestId}] Payment successful, processing booking`);
      try {
        await processSuccessfulPayment(updatedPayment);
        
        io.to(`user-${payment.user}`).emit('payment_completed', {
          payment_id: payment._id,
          status: 'completed',
          message: ResultDesc,
          receipt: transactionDetails.receipt_number,
          transaction_date: transactionDetails.transaction_date
        });

      } catch (processError) {
        console.error(`[${requestId}] Error in processSuccessfulPayment:`, processError);
        console.error('Error stack:', processError.stack);
        
        // Update payment to refund required
        await Payment.findByIdAndUpdate(
          payment._id,
          {
            $set: {
              status: 'refund_required',
              error_details: {
                message: processError.message,
                stack: processError.stack,
                timestamp: new Date()
              }
            }
          }
        );
        
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'refund_required',
          message: 'There was an error processing your booking. A refund will be issued.'
        });
      }
    } else {
      console.log(`[${requestId}] Payment failed, notifying user`);
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'failed',
        message: ResultDesc || 'Payment was not completed. Please try again.'
      });
    }

    console.log(`[${requestId}] ================== CALLBACK PROCESSING COMPLETED ==================`);

  } catch (error) {
    console.error(`[${requestId}] ❌ Error in handleCallback:`, error);
    console.error('Error stack:', error.stack);
    
    // Always return 200 to MPesa
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: "Acknowledged with internal error" 
    });
  }
};

const verifyPayment = async (paymentId, attempt = 1) => {
  console.log(`Verifying payment ${paymentId} - Attempt ${attempt}`);
  const MAX_ATTEMPTS = 5;
  const INTERVAL = 20000; // 20 seconds

  try {
    const payment = await Payment.findById(paymentId).populate('matatu');

    if (!payment) {
      console.error(`Payment ${paymentId} not found`);
      return;
    }

    // Skip if payment is already in a final state
    if (['completed', 'failed', 'expired', 'refund_required'].includes(payment.status)) {
      console.log(`Payment ${paymentId} already in final state: ${payment.status}`);
      return;
    }

    // Query MPesa status
    const token = await generateMPesaAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;

    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
      'base64'
    );

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkquery/v1/query',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: payment.provider_reference
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (response.data.ResultCode === 0) {
      // Payment successful
      payment.status = 'completed';
      payment.provider_response = response.data.ResultDesc;
      await payment.save();
      await processSuccessfulPayment(payment);
    } else if (response.data.ResultCode === 1) {
      // Payment failed
      payment.status = 'failed';
      payment.provider_response = response.data.ResultDesc;
      await payment.save();

      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'failed',
        message: 'Payment failed. Please try again.'
      });
    } else if (attempt < MAX_ATTEMPTS) {
      // Schedule next attempt
      setTimeout(() => verifyPayment(paymentId, attempt + 1), INTERVAL);
    }
  } catch (error) {
    console.error(`Error verifying payment ${paymentId}:`, error);
    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => verifyPayment(paymentId, attempt + 1), INTERVAL);
    }
  }
};

const processSuccessfulPayment = async (payment) => {
  console.log('Starting processSuccessfulPayment for payment:', payment._id);

  try {
    console.log('Initiating successful payment processing');
    const token = generateSystemToken(payment.user);
    console.log('Received Token:', token);

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded Token:', decodedToken);

    // Extract matatuId as a string from the ObjectId
    const matatuId = payment.matatu._id.toString();

    const bookingResponse = await axios.post(
      `${process.env.BASE_URL}/api/bookings/${matatuId}/book`,
      {
        seat_number: payment.seat_number,
        payment_id: payment._id.toString()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('Booking response:', bookingResponse.data);

    if (!bookingResponse.data?.booking) {
      throw new Error('Booking request failed');
    }

    console.log('Emitting success events');
    io.to(`matatu-${matatuId}`).emit('seat_update', {
      matatu_id: matatuId,
      seat_number: payment.seat_number,
      status: 'booked',
      user_id: payment.user
    });

    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: 'completed',
      message: 'Payment successful! Your seat has been booked.',
      booking: bookingResponse.data.booking,
      receipt: payment.transaction_details.receipt_number,
      transaction_date: payment.transaction_details.transaction_date
    });

  } catch (processError) {
    console.error('Error in processSuccessfulPayment:', processError);
    payment.status = 'refund_required';
    await payment.save();
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: 'refund_required',
      message: 'There was an error processing your booking. A refund will be issued.'
    });
  }
};

const generateSystemToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
      role: 'user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const checkPaymentStatus = async (req, res) => {
  const { paymentId } = req.params;

  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      user: req.user.userId
    }).populate({
      path: 'matatu',
      populate: {
        path: 'route',
        select: 'origin destination fare'
      }
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({
      payment_id: payment._id,
      status: payment.status,
      amount: payment.amount,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      provider_response: payment.provider_response,
      matatu_details: {
        registration: payment.matatu.registrationNumber,
        route: payment.matatu.route,
        departure_time: payment.matatu.departureTime
      },
      seat_number: payment.seat_number
    });

  } catch (error) {
    console.error('Error in checkPaymentStatus:', error);
    res.status(500).json({
      message: "Failed to check payment status",
      error: error.message
    });
  }
};

// Helper function to cancel expired payments
const cancelExpiredPayments = async () => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  try {
    const expiredPayments = await Payment.find({
      status: { $in: ['pending', 'stk_pushed', 'processing'] },
      created_at: { $lt: thirtyMinutesAgo }
    });
    
    for (const payment of expiredPayments) {
      payment.status = 'expired';
      payment.provider_response = 'Payment request expired';
      payment.updated_at = new Date();
      await payment.save();
      
      // Release locked seats
      await Matatu.updateOne(
        { _id: payment.matatu, "seatLayout.seatNumber": payment.seat_number },
        {
          $set: {
            "seatLayout.$.locked_by": null,
            "seatLayout.$.lock_expiry": null,
            "seatLayout.$.status": "available"
          }
        }
      );
      
      // Notify user
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'expired',
        message: 'Your payment request has expired. The seat has been released.'
      });
    }
    
    console.log(`Cleaned up ${expiredPayments.length} expired payments`);
  } catch (error) {
    console.error('Error in cancelExpiredPayments:', error);
  }
};

// This function should be called when the server starts
const setupPaymentCronJobs = () => {
  // Run every 5 minutes
  setInterval(cancelExpiredPayments, 5 * 60 * 1000);
  console.log('Payment cleanup cron job scheduled');
};
// Administrative controller for managing payments
const getPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter conditions
    const filterConditions = {};
    
    if (req.query.status) {
      filterConditions.status = req.query.status;
    }
    
    if (req.query.userId) {
      filterConditions.user = req.query.userId;
    }
    
    if (req.query.phoneNumber) {
      filterConditions.phone_number = req.query.phoneNumber;
    }
    
    if (req.query.paymentId && mongoose.Types.ObjectId.isValid(req.query.paymentId)) {
      filterConditions._id = new mongoose.Types.ObjectId(req.query.paymentId);
    }
    
    // Date range filtering
    if (req.query.dateRange) {
      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();
      
      switch (req.query.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          startDate.setDate(now.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          endDate.setDate(now.getDate() - 1);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'last7days':
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'last30days':
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'thisMonth':
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'lastMonth':
          startDate.setMonth(now.getMonth() - 1);
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
          endDate.setDate(1);
          endDate.setHours(0, 0, 0, 0);
          endDate.setMilliseconds(-1);
          break;
      }
      
      filterConditions.created_at =      { $gte: startDate, $lte: endDate };
    }

    // Fetch payments with pagination and filtering
    const payments = await Payment.find(filterConditions)
      .populate('user', 'username email phone_number')
      .sort({ created_at: -1 }) // Sort by latest payments
      .skip(skip)
      .limit(limit);

    // Count total documents for pagination metadata
    const totalPayments = await Payment.countDocuments(filterConditions);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total: totalPayments,
        page,
        limit,
        totalPages: Math.ceil(totalPayments / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Fetch a single payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ success: false, message: 'Invalid payment ID' });
    }

    const payment = await Payment.findById(paymentId).populate('user', 'username email');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    console.error('Error fetching payment by ID:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
 
// Update payment status manually (e.g., for refund or verification)
const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status } = req.body;

    if (!['pending', 'completed', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status update' });
    }

    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      { status },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Notify client about the update
    io.emit('paymentUpdated', payment);

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};



export const paymentController = {
  initiatePayment,
  handleCallback,
  checkPaymentStatus,
  setupPaymentCronJobs,getPayments, getPaymentById, updatePaymentStatus
};