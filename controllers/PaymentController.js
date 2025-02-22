import Payment from "../models/Payment.js";
import Matatu from "../models/Matatu.js";
import axios from 'axios';
import { io } from '../config/socket.js';


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
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const { phone_number } = req.body;
    if (!phone_number) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Find matatu with a seat locked by this user
    const matatu = await Matatu.findOne({
      "seatLayout": {
        $elemMatch: {
          locked_by: req.user.userId,
          lock_expiry: { $gt: new Date() }
        }
      }
    }).populate('route');

    if (!matatu) {
      return res.status(400).json({ 
        message: "Please lock a seat first before initiating payment" 
      });
    }

    // Get the locked seat
    const lockedSeat = matatu.seatLayout.find(
      seat => seat.locked_by?.toString() === req.user.userId.toString()
    );

    // Create payment record
    const payment = new Payment({
        user: req.user.userId,
        matatu: matatu._id,
        seat_number: lockedSeat.seatNumber,
        amount: matatu.route.basePrice || 1, 
        phone_number: phone_number,
        status: 'pending',
        created_at: new Date()
      });

    await payment.save();

    // Initiate MPesa STK Push
    const mpesaResponse = await initiateMPesaSTKPush(
        phone_number,
        payment.amount,
        payment._id.toString()
      );
 
    // Update payment with MPesa checkout request ID
    payment.provider_reference = mpesaResponse.CheckoutRequestID;
    payment.status = 'stk_pushed';
    await payment.save();

    // Emit socket event for payment initiated
    io.to(`user-${req.user.userId}`).emit('payment_requested', {
      payment_id: payment._id,
      status: 'stk_pushed',
      checkout_request_id: mpesaResponse.CheckoutRequestID
    });

    res.status(200).json({
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
    });

  } catch (error) {
    console.error('Error in initiatePayment:', error);
    res.status(500).json({
      message: "Failed to initiate payment",
      error: error.message
    });
  }
};

// Modify the handleCallback function to be more robust
const handleCallback = async (req, res) => {
  console.log('Callback received at:', new Date().toISOString());
  console.log('Full request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Validate the callback payload structure
    if (!req.body?.Body?.stkCallback) {
      console.error('Invalid callback payload structure');
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

    console.log('Processing callback for CheckoutRequestID:', CheckoutRequestID);

    // Find payment by checkout request ID
    const payment = await Payment.findOne({
      provider_reference: CheckoutRequestID
    });

    if (!payment) {
      console.error('Payment not found for checkout request ID:', CheckoutRequestID);
      return res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Payment not found" 
      });
    }

    console.log('Found payment:', payment._id);

    // Extract transaction details if payment successful
    let mpesaReceiptNumber = null;
    let transactionDate = null;
    
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      console.log('Payment successful, extracting metadata');
      const receiptItem = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
      const dateItem = CallbackMetadata.Item.find(item => item.Name === "TransactionDate");
      
      mpesaReceiptNumber = receiptItem?.Value || null;
      transactionDate = dateItem?.Value || null;
      
      console.log('Receipt:', mpesaReceiptNumber, 'Date:', transactionDate);
    }

    // Update payment status
    payment.status = ResultCode === 0 ? 'processing' : 'failed';
    payment.provider_response = ResultDesc;
    payment.transaction_receipt = mpesaReceiptNumber;
    payment.transaction_date = transactionDate;
    payment.updated_at = new Date();
    
    console.log('Updating payment status to:', payment.status);
    await payment.save();

    // Acknowledge MPesa callback first
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // Emit initial status update
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: payment.status,
      message: ResultDesc
    });

    // Process successful payment
    if (ResultCode === 0) {
      console.log('Initiating successful payment processing');
      await processSuccessfulPayment(payment);
    } else {
      console.log('Payment failed, notifying user');
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'failed',
        message: ResultDesc || 'Payment was not completed. Please try again.'
      });
    }

  } catch (error) {
    console.error('Error in handleCallback:', error);
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: "Acknowledged with error" 
    });
  }
};

const processSuccessfulPayment = async (payment) => {
  console.log('Starting processSuccessfulPayment for payment:', payment._id);
  
  try {
    // First update the payment status
    payment.status = 'processing_booking';
    await payment.save();
    
    console.log('Making booking request');
    const bookingResponse = await axios.post(
      `${process.env.BASE_URL}/api/bookings/${payment.matatu}/book`,
      {
        seat_number: payment.seat_number,
        payment_id: payment._id
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Booking response:', bookingResponse.data);

    if (!bookingResponse.data?.success) {
      throw new Error('Booking request failed');
    }

    // Update matatu seat status
    console.log('Updating matatu seat status');
    const updateMatatu = await Matatu.findByIdAndUpdate(
      payment.matatu,
      {
        $set: {
          "seatLayout.$[seat].status": "booked",
          "seatLayout.$[seat].booked_by": payment.user,
          "seatLayout.$[seat].locked_by": null,
          "seatLayout.$[seat].lock_expiry": null
        }
      },
      {
        arrayFilters: [{ "seat.seatNumber": payment.seat_number }],
        new: true
      }
    );
    
    if (!updateMatatu) {
      throw new Error("Failed to update matatu seat status");
    }

    // Update payment status to completed
    payment.status = 'completed';
    await payment.save();
    
    console.log('Emitting success events');
    // Emit socket events
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
      receipt: payment.transaction_receipt,
      transaction_date: payment.transaction_date
    });

  } catch (error) {
    console.error('Error in processSuccessfulPayment:', error);
    
    payment.status = 'refund_required';
    await payment.save();
    
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: 'refund_required',
      message: 'There was an error processing your booking. A refund will be issued.'
    });
  }
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