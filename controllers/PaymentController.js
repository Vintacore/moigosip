import Payment from "../models/Payment.js";
import Matatu from "../models/Matatu.js";
import axios from 'axios';

// MPesa helper functions remain the same
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

// Cleanup function for expired payments
const cleanupExpiredPayments = async () => {
  try {
    const expiredPayments = await Payment.updateMany(
      {
        status: 'pending',
        payment_expiry: { $lt: new Date() }
      },
      {
        $set: { 
          status: 'expired',
          provider_response: 'Payment timeout exceeded'
        }
      }
    );

    if (expiredPayments.modifiedCount > 0) {
      await Matatu.updateMany(
        {
          "seatLayout.locked_by": { $exists: true },
          "seatLayout.lock_expiry": { $lt: new Date() }
        },
        {
          $unset: {
            "seatLayout.$[expired].locked_by": "",
            "seatLayout.$[expired].lock_expiry": ""
          }
        },
        {
          arrayFilters: [{ "expired.lock_expiry": { $lt: new Date() } }]
        }
      );      
    }
  } catch (error) {
    console.error('Error cleaning up expired payments:', error);
  }
};

// Run cleanup every minute
setInterval(cleanupExpiredPayments, 60000);

// Updated controller functions
const initiatePayment = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const { phone_number } = req.body;
    if (!phone_number) {
      return res.status(400).json({ message: "Phone number is required" });
    }

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

    const lockedSeat = matatu.seatLayout.find(
      seat => seat.locked_by?.toString() === req.user.userId.toString()
    );

    // Set payment expiry to 10 minutes from now
    const paymentExpiry = new Date();
    paymentExpiry.setMinutes(paymentExpiry.getMinutes() + 10);

    const payment = new Payment({
      user: req.user.userId,
      matatu: matatu._id,
      seat_number: lockedSeat.seatNumber,
      amount: matatu.route.basePrice || 1,
      phone_number: phone_number,
      status: 'pending',
      created_at: new Date(),
      payment_expiry: paymentExpiry,
      stk_initiated: true,  // Flag to indicate STK has been initiated
      stk_completion_status: 'awaiting_user_input'  // New status to track STK process
    });

    await payment.save();

    const mpesaResponse = await initiateMPesaSTKPush(
      phone_number,
      payment.amount,
      payment._id.toString()
    );

    payment.provider_reference = mpesaResponse.CheckoutRequestID;
    await payment.save();

    res.status(200).json({
      message: "Payment initiated successfully",
      payment_id: payment._id,
      checkout_request_id: mpesaResponse.CheckoutRequestID,
      amount: payment.amount,
      expires_at: paymentExpiry,
      matatu_details: {
        registration: matatu.registrationNumber,
        route: matatu.route,
        departure_time: matatu.departureTime
      },
      seat: {
        number: lockedSeat.seatNumber,
        _id: lockedSeat._id
      }
    });

  } catch (error) {
    console.error('Error in initiatePayment:', error);
    res.status(500).json({
      message: "Failed to initiate payment",
      error: error.message
    });
  }
};

const handleCallback = async (req, res) => {
  try {
    if (!req.body?.Body?.stkCallback) {
      return res.status(400).json({ message: "Invalid callback payload" });
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

    const payment = await Payment.findOne({
      provider_reference: CheckoutRequestID
    });

    if (!payment) {
      console.error('Payment not found for checkout request ID:', CheckoutRequestID);
      return res.status(404).json({ message: "Payment not found" });
    }

    // Update STK status regardless of result
    payment.stk_completion_status = 'completed';
    
    // Extract transaction details if successful
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      const transactionDetails = {};
      
      CallbackMetadata.Item.forEach(item => {
        if (item.Name === 'MpesaReceiptNumber') {
          transactionDetails.receipt_number = item.Value;
        } else if (item.Name === 'TransactionDate') {
          transactionDetails.transaction_date = item.Value;
        }
      });
      
      payment.transaction_details = transactionDetails;
    }

    // Check if payment has expired
    if (payment.payment_expiry < new Date()) {
      payment.status = 'expired';
      payment.provider_response = 'Payment timeout exceeded';
      await payment.save();
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Payment expired" });
    }

    payment.status = ResultCode === 0 ? 'completed' : 'failed';
    payment.provider_response = ResultDesc;
    payment.updated_at = new Date();
    await payment.save();

    if (ResultCode === 0) {
      try {
        const bookingResponse = await fetch(
          `${process.env.BASE_URL}/api/bookings/${payment.matatu}/book`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
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
        }
      } catch (error) {
        console.error('Error creating booking:', error);
        payment.status = 'refund_required';
        await payment.save();
      }
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

  } catch (error) {
    console.error('Error in handleCallback:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Server Error" });
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

    // Check if payment has expired
    if (payment.status === 'pending' && payment.payment_expiry < new Date()) {
      payment.status = 'expired';
      payment.provider_response = 'Payment timeout exceeded';
      await payment.save();

      // Release the seat lock
      await Matatu.findOneAndUpdate(
        { _id: payment.matatu },
        {
          $unset: {
            "seatLayout.$[seat].locked_by": "",
            "seatLayout.$[seat].lock_expiry": ""
          }
        },
        {
          arrayFilters: [{ "seat.seatNumber": payment.seat_number }]
        }
      );
      
      return res.status(200).json({
        payment_id: payment._id,
        status: 'expired',
        amount: payment.amount,
        created_at: payment.created_at,
        updated_at: new Date(),
        expires_at: payment.payment_expiry,
        provider_response: 'Payment timeout exceeded',
        matatu_details: {
          registration: payment.matatu.registrationNumber,
          route: payment.matatu.route,
          departure_time: payment.matatu.departureTime
        },
        seat_number: payment.seat_number
      });
    }

    // If STK push is still in progress, don't report payment as not found
    if (payment.status === 'pending' && payment.stk_initiated) {
      const responseObj = {
        payment_id: payment._id,
        status: payment.status,
        stk_status: payment.stk_completion_status || 'awaiting_user_input',
        amount: payment.amount,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        expires_at: payment.payment_expiry,
        provider_response: payment.provider_response || 'Waiting for payment completion',
        matatu_details: {
          registration: payment.matatu.registrationNumber,
          route: payment.matatu.route,
          departure_time: payment.matatu.departureTime
        },
        seat_number: payment.seat_number
      };
      
      return res.status(200).json(responseObj);
    }

    res.status(200).json({
      payment_id: payment._id,
      status: payment.status,
      amount: payment.amount,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      expires_at: payment.payment_expiry,
      provider_response: payment.provider_response,
      transaction_details: payment.transaction_details,
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

// New function to query M-Pesa for status if needed
const queryMPesaStatus = async (req, res) => {
  const { paymentId } = req.params;
  
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      user: req.user.userId
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    
    if (!payment.provider_reference) {
      return res.status(400).json({ message: "No checkout request ID available" });
    }
    
    // Get M-Pesa token
    const token = await generateMPesaAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;

    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString('base64');
    
    try {
      const response = await axios.post(
        'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
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
      
      // Update payment based on query response
      if (response.data.ResultCode === 0) {
        payment.status = 'completed';
        payment.stk_completion_status = 'completed';
        payment.provider_response = response.data.ResultDesc;
        payment.updated_at = new Date();
        await payment.save();
        
        // Trigger booking creation
        try {
          await fetch(
            `${process.env.BASE_URL}/api/bookings/${payment.matatu}/book`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
              },
              body: JSON.stringify({
                seat_number: payment.seat_number,
                payment_id: payment._id
              })
            }
          );
        } catch (error) {
          console.error('Error creating booking after status query:', error);
          payment.status = 'refund_required';
          await payment.save();
        }
      } else if (response.data.ResultCode === 1032) {
        // Transaction canceled by user
        payment.status = 'cancelled';
        payment.stk_completion_status = 'cancelled';
        payment.provider_response = 'Transaction cancelled by user';
        payment.updated_at = new Date();
        await payment.save();
        
        // Release the seat lock
        await Matatu.findOneAndUpdate(
          { _id: payment.matatu },
          {
            $unset: {
              "seatLayout.$[seat].locked_by": "",
              "seatLayout.$[seat].lock_expiry": ""
            }
          },
          {
            arrayFilters: [{ "seat.seatNumber": payment.seat_number }]
          }
        );
      } else {
        // Other failure
        payment.status = 'failed';
        payment.stk_completion_status = 'failed';
        payment.provider_response = response.data.ResultDesc;
        payment.updated_at = new Date();
        await payment.save();
        
        // Release the seat lock
        await Matatu.findOneAndUpdate(
          { _id: payment.matatu },
          {
            $unset: {
              "seatLayout.$[seat].locked_by": "",
              "seatLayout.$[seat].lock_expiry": ""
            }
          },
          {
            arrayFilters: [{ "seat.seatNumber": payment.seat_number }]
          }
        );
      }
      
      return res.status(200).json({
        payment_id: payment._id,
        status: payment.status,
        stk_status: payment.stk_completion_status,
        amount: payment.amount,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        expires_at: payment.payment_expiry,
        provider_response: payment.provider_response,
        mpesa_result: response.data
      });
      
    } catch (error) {
      console.error('Error querying MPesa status:', error);
      return res.status(500).json({
        message: "Failed to query MPesa status",
        error: error.message
      });
    }
  } catch (error) {
    console.error('Error in queryMPesaStatus:', error);
    res.status(500).json({
      message: "Failed to query payment status",
      error: error.message
    });
  }
};


const verifyPaymentAndBooking = async (paymentId) => {
  try {
    const payment = await Payment.findById(paymentId)
      .populate({
        path: 'matatu',
        select: 'registrationNumber route departureTime',
        populate: { path: 'route' }
      });

    if (!payment) {
      throw new Error('Payment not found');
    }

    const seatLock = await Matatu.findOne({
      _id: payment.matatu,
      "seatLayout": {
        $elemMatch: {
          seatNumber: payment.seat_number,
          locked_by: payment.user
        }
      }
    });

    return {
      payment_status: payment.status,
      stk_status: payment.stk_completion_status,
      seat_locked: !!seatLock,
      lock_expiry: seatLock?.seatLayout.find(s => s.seatNumber === payment.seat_number)?.lock_expiry,
      matatu_details: payment.matatu
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    throw error;
  }
};

// Add to paymentController.js
const handlePaymentError = async (error, payment, user) => {
  console.error('Payment processing error:', {
    error: error.message,
    payment_id: payment?._id,
    user_id: user?.userId,
    timestamp: new Date()
  });

  // Update payment status if payment exists
  if (payment?._id) {
    try {
      payment.status = 'failed';
      payment.provider_response = error.message;
      payment.updated_at = new Date();
      await payment.save();
    } catch (saveError) {
      console.error('Error updating payment status:', saveError);
    }
  }

  return {
    success: false,
    message: 'Payment processing failed',
    error: error.message,
    payment_id: payment?._id
  };
};

// Add to paymentController.js
const recoverFailedPayment = async (paymentId) => {
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw new Error('Payment not found');

    // Check MPesa status
    const mpesaStatus = await queryMPesaStatus(payment.provider_reference);
    
    if (mpesaStatus.ResultCode === 0) {
      // Payment successful but callback failed
      payment.status = 'completed';
      payment.updated_at = new Date();
      await payment.save();
      
      // Trigger booking creation
      return await createBooking(payment);
    }
    
    // Payment truly failed, cleanup
    await cleanupFailedPayment(payment);
    return { success: false, message: 'Payment failed on MPesa' };
    
  } catch (error) {
    console.error('Payment recovery error:', error);
    throw error;
  }
};

const cleanupFailedPayment = async (payment) => {
  try {
    // Release seat lock
    await Matatu.findOneAndUpdate(
      { _id: payment.matatu },
      {
        $unset: {
          "seatLayout.$[seat].locked_by": "",
          "seatLayout.$[seat].lock_expiry": ""
        }
      },
      {
        arrayFilters: [{ "seat.seatNumber": payment.seat_number }]
      }
    );

    // Update payment status
    payment.status = 'failed';
    payment.updated_at = new Date();
    await payment.save();

    return { success: true, message: 'Cleanup completed' };
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
};

export const paymentController = {
  initiatePayment,
  handleCallback,
  checkPaymentStatus,
  verifyPaymentAndBooking,
  handlePaymentError,
  cleanupFailedPayment,
  queryMPesaStatus
}; 