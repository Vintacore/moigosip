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
        CallBackURL: `${process.env.BASE_URL}/api/payments/callback`,
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
  try {
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

    console.log('MPesa Callback received:', JSON.stringify(req.body, null, 2));

    // Find payment by checkout request ID
    const payment = await Payment.findOne({
      provider_reference: CheckoutRequestID
    });

    if (!payment) {
      console.error('Payment not found for checkout request ID:', CheckoutRequestID);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Acknowledged but payment not found" });
    }

    // Extract transaction details if payment successful
    let mpesaReceiptNumber = null;
    let transactionDate = null;
    
    if (ResultCode === 0 && CallbackMetadata && CallbackMetadata.Item) {
      const receiptItem = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
      const dateItem = CallbackMetadata.Item.find(item => item.Name === "TransactionDate");
      
      if (receiptItem && receiptItem.Value) mpesaReceiptNumber = receiptItem.Value;
      if (dateItem && dateItem.Value) transactionDate = dateItem.Value;
    }

    // Update payment status based on MPesa response
    payment.status = ResultCode === 0 ? 'processing' : 'failed';
    payment.provider_response = ResultDesc;
    payment.transaction_receipt = mpesaReceiptNumber;
    payment.transaction_date = transactionDate;
    payment.updated_at = new Date();
    await payment.save();

    // Always acknowledge MPesa callback first to prevent timeout
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // Then continue with the rest of the process
    io.to(`user-${payment.user}`).emit('payment_status_update', {
      payment_id: payment._id,
      status: payment.status,
      message: ResultDesc
    });

    // Process successful payment after responding to MPesa
    if (ResultCode === 0) {
      processSuccessfulPayment(payment);
    } else {
      // Payment failed - emit update with failure message
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'failed',
        message: ResultDesc || 'Payment was not completed. Please try again.'
      });
    }
  } catch (error) {
    console.error('Error in handleCallback:', error);
    // Always respond to MPesa even if there's an error
    res.status(200).json({ ResultCode: 0, ResultDesc: "Acknowledged with error" });
  }
};




const processSuccessfulPayment = async (payment, userToken) => {  // Add userToken
  try {
    const bookingResponse = await fetch(
      `${process.env.BASE_URL}/api/bookings/${payment.matatu}/book`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`  // Use user's session token
        },
        body: JSON.stringify({
          seat_number: payment.seat_number,
          payment_id: payment._id
        })
      }
    );

    if (!bookingResponse.ok) {
      payment.status = 'refund_required';
      await payment.save();
      console.error('Failed to create booking after successful payment');
      
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: 'refund_required',
        message: 'Payment successful but booking failed. A refund will be processed.'
      });
    } else {
      // Update payment status to completed
      payment.status = 'completed';
      await payment.save();
      
      // Update seat status in matatu collection
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
      
      // Check if the update was successful
      if (!updateMatatu) {
        throw new Error("Failed to update matatu seat status");
      }
      
      
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
    }
  } catch (error) {
    console.error('Error creating booking:', error);
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