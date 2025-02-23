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
  console.log('================== MPESA CALLBACK RECEIVED ==================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Raw Body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Validate callback payload structure
    if (!req.body?.Body?.stkCallback) {
      console.error('❌ Invalid callback payload structure');
      console.error('Received body:', JSON.stringify(req.body, null, 2));
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Invalid callback payload"
      });
    }

    // Extract callback data
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

    console.log('📝 Processing callback data:', {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc
    });

    // Find corresponding payment
    console.log('🔍 Finding payment record for CheckoutRequestID:', CheckoutRequestID);
    const payment = await Payment.findOne({ 
      provider_reference: CheckoutRequestID 
    }).populate('matatu');

    if (!payment) {
      console.error('❌ Payment not found for checkout request ID:', CheckoutRequestID);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Payment not found" 
      });
    }

    console.log('✅ Found payment:', {
      paymentId: payment._id,
      userId: payment.user,
      matatuId: payment.matatu?._id,
      currentStatus: payment.status
    });

    // Extract transaction details
    let transactionDetails = {};
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      console.log('💳 Extracting transaction metadata');
      const getMetadataValue = (name) => {
        const item = CallbackMetadata.Item.find(item => item.Name === name);
        return item?.Value || null;
      };

      transactionDetails = {
        receipt_number: getMetadataValue("MpesaReceiptNumber"),
        transaction_date: getMetadataValue("TransactionDate"),
        amount: getMetadataValue("Amount"),
        phone_number: getMetadataValue("PhoneNumber")
      };

      console.log('📊 Transaction details:', transactionDetails);
    }

    // Update payment record
    console.log('📝 Updating payment status');
    if (ResultCode === 0) {
      payment.status = 'completed';
      payment.provider_response = ResultDesc;
      payment.transaction_details = transactionDetails;
    } else {
      payment.status = 'failed';
      payment.provider_response = ResultDesc;
    }
    payment.updated_at = new Date();
    
    await payment.save();
    console.log('✅ Payment record updated:', payment.status);

    // Send initial response to M-Pesa
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // Emit initial socket event
    console.log('📡 Emitting initial socket event');
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: payment.status,
      message: ResultDesc
    });

    // Process successful payment
    if (ResultCode === 0) {
      console.log('🎉 Payment successful, processing booking');
      try {
        await processSuccessfulPayment(payment);
        console.log('✅ Payment processing completed successfully');
      } catch (processError) {
        console.error('❌ Error in processSuccessfulPayment:', processError);
        console.error('Error stack:', processError.stack);
        
        // Update payment status to refund required
        payment.status = 'refund_required';
        await payment.save();
        
        // Notify user about refund
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'refund_required',
          message: 'There was an error processing your booking. A refund will be issued.'
        });
      }
    } else {
      console.log('❌ Payment failed, notifying user');
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'failed',
        message: ResultDesc || 'Payment was not completed. Please try again.'
      });
    }

    console.log('================== CALLBACK PROCESSING COMPLETED ==================');

  } catch (error) {
    console.error('❌ Error in handleCallback:', error);
    console.error('Error stack:', error.stack);
    
    // Always return 200 to M-Pesa even if we have internal errors
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: "Acknowledged with internal error" 
    });
    
    // Additional error logging if needed
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      type: error.type
    });
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

    const bookingResponse = await axios.post(
      `${process.env.BASE_URL}/api/bookings/${payment.matatu}/book`,
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
    io.to(`matatu-${payment.matatu}`).emit('seat_update', {
      matatu_id: payment.matatu,
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

export const paymentController = {
  initiatePayment,
  handleCallback,
  checkPaymentStatus,
  setupPaymentCronJobs
};