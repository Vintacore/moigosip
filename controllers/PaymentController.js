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
      payment_expiry: paymentExpiry
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
          ResultDesc
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
    }

    res.status(200).json({
      payment_id: payment._id,
      status: payment.status,
      amount: payment.amount,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      expires_at: payment.payment_expiry,
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

export const paymentController = {
  initiatePayment,
  handleCallback,
  checkPaymentStatus
};