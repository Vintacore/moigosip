import Payment from "../models/Payment.js";
import Matatu from "../models/Matatu.js";
import mongoose from 'mongoose'; // Add this import for mongoose
import axios from 'axios';
import { io } from '../config/socket.js';
import jwt from 'jsonwebtoken';
import queueConfig from '../config/queue.js';
const { paymentQueue } = queueConfig;




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
          authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error initiating MPesa payment:', error);
    throw new Error('Failed to initiate MPesa payment');
  }
};

// Main controller function
const initiatePayment = async (req, res) => {
  const requestId = `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`[${requestId}] Payment initiation started`);

  try {
    // Authorization check
    if (!req.user?.userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    // Validate phone number
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

    if (!lockedSeat) {
      return res.status(400).json({ 
        message: "No locked seat found for this user" 
      });
    }

    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Create payment record
      const payment = new Payment({
        user: req.user.userId,
        matatu: matatu._id,
        seat_number: lockedSeat.seatNumber,
        amount: matatu.route.basePrice || 1,
        phone_number: phone_number,
        status: 'pending',
        created_at: new Date(),
        request_id: requestId
      });
      
      await payment.save({ session });
      console.log(`[${requestId}] Payment record created: ${payment._id}`);

      // Initiate MPesa STK Push
      console.log(`[${requestId}] Initiating MPesa STK Push`);
      const mpesaResponse = await initiateMPesaSTKPush(
        phone_number,
        payment.amount,
        payment._id.toString()
      );

      // Update payment with MPesa checkout request ID
      payment.provider_reference = mpesaResponse.CheckoutRequestID;
      payment.status = 'stk_pushed';
      payment.mpesa_request_id = mpesaResponse.MerchantRequestID;
      await payment.save({ session });
      
      // Commit the transaction
      await session.commitTransaction();
      console.log(`[${requestId}] Transaction committed`);
      
      // Emit socket event
      io.to(`user-${req.user.userId}`).emit('payment_requested', {
        payment_id: payment._id,
        status: 'stk_pushed',
        checkout_request_id: mpesaResponse.CheckoutRequestID
      });
      console.log(`[${requestId}] Socket event emitted`);

      // Prepare response
      const response = {
        message: "Payment initiated successfully",
        payment_id: payment._id,
        checkout_request_id: mpesaResponse.CheckoutRequestID,
        amount: payment.amount,
        matatu_details: {
          registration: matatu.registrationNumber,
          route: matatu.route.name,
          departure_time: matatu.departureTime
        },
        seat: {
          number: lockedSeat.seatNumber
        },
        status: 'stk_pushed'
      };

      res.status(200).json(response);
      console.log(`[${requestId}] Response sent successfully`);

      // Queue payment verification (using Bull)
      paymentQueue.add('verify-payment', 
        { 
          paymentId: payment._id,
          requestId
        }, 
        {
          delay: 20000, // 20 seconds delay
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 20000 // starts at 20s, then increases exponentially
          },
          removeOnComplete: true,
          removeOnFail: 1000 // Keep failed jobs for debugging but limit to 1000
        }
      );
      console.log(`[${requestId}] Payment verification queued`);
      
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      console.error(`[${requestId}] Transaction aborted:`, error);
      throw error;
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error(`[${requestId}] Error in initiatePayment:`, error);
    
    // Provide user-friendly error message
    const errorMessage = error.response?.data?.ResponseDescription || 
                        error.message || 
                        "An error occurred while processing your payment";
    
    res.status(500).json({
      message: "Failed to initiate payment",
      error: errorMessage
    });
  }
};

const handleCallback = async (req, res) => {
  const requestId = `callback-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`[${requestId}] MPesa callback received`);
  
  // Send immediate response to MPesa (required)
  const sendAcknowledgment = () => {
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: "Received" 
    });
  };
  
  try {
    // Validate callback structure early
    if (!req.body?.Body?.stkCallback || 
        !req.body.Body.stkCallback.CheckoutRequestID || 
        req.body.Body.stkCallback.ResultCode === undefined) {
      console.error(`[${requestId}] Invalid callback payload structure`);
      return sendAcknowledgment();
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

    console.log(`[${requestId}] Processing: ${CheckoutRequestID}, code: ${ResultCode}, desc: ${ResultDesc}`);

    // Send acknowledgment immediately to avoid MPesa timeouts
    sendAcknowledgment();
    
    // Process the payment separately (won't block the response)
    processCallbackAsync(requestId, {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error in callback handler:`, error);
    sendAcknowledgment();
  }
};

// Handle callback processing asynchronously
const processCallbackAsync = async (requestId, callbackData) => {
  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
  
  try {
    // Use findOneAndUpdate for atomic operations
    const payment = await Payment.findOne({ 
      provider_reference: CheckoutRequestID,
      status: { $nin: ['completed', 'failed', 'expired', 'refund_required'] }
    });

    if (!payment) {
      console.log(`[${requestId}] Payment not found or already processed: ${CheckoutRequestID}`);
      return;
    }

    console.log(`[${requestId}] Found payment: ${payment._id}, status: ${payment.status}`);

    // Extract transaction details
    let transactionDetails = {};
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      transactionDetails = CallbackMetadata.Item.reduce((acc, item) => {
        if (item.Name === "MpesaReceiptNumber") acc.receipt_number = item.Value;
        if (item.Name === "TransactionDate") acc.transaction_date = item.Value;
        if (item.Name === "Amount") acc.amount = item.Value;
        if (item.Name === "PhoneNumber") acc.phone_number = item.Value;
        return acc;
      }, {});
    }

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
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
        { new: true, session }
      );

      if (!updatedPayment) {
        console.log(`[${requestId}] Payment was already processed by another request`);
        await session.abortTransaction();
        return;
      }

      // Emit initial status update
      io.to(`user-${payment.user}`).emit('payment_status_update', {
        payment_id: payment._id,
        status: updatedPayment.status,
        message: ResultDesc
      });

      if (ResultCode === 0) {
        console.log(`[${requestId}] Payment successful, processing booking`);
        await processSuccessfulPayment(updatedPayment, session);
        
        // Commit the transaction
        await session.commitTransaction();
        
        // Emit success event after transaction is committed
        io.to(`user-${payment.user}`).emit('payment_completed', {
          payment_id: payment._id,
          status: 'completed',
          message: ResultDesc,
          receipt: transactionDetails.receipt_number,
          transaction_date: transactionDetails.transaction_date
        });
        
      } else {
        // For failed payments, commit the transaction and notify
        await session.commitTransaction();
        
        console.log(`[${requestId}] Payment failed, notifying user`);
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'failed',
          message: ResultDesc || 'Payment was not completed. Please try again.'
        });
        
        // Release the locked seat
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
      }
      
    } catch (processError) {
      // Roll back transaction on error
      await session.abortTransaction();
      console.error(`[${requestId}] Error in payment processing:`, processError);
      
      // Mark payment for refund if it was initially successful
      if (ResultCode === 0) {
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
        
        // Queue refund handling
        handleRefundRequired(payment);
        
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'refund_required',
          message: 'There was an error processing your booking. A refund will be issued.'
        });
      }
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error(`[${requestId}] Unhandled error in processCallbackAsync:`, error);
    // Log to monitoring system here for critical errors
  }
};

const verifyPayment = async (job) => {
  const { paymentId, requestId } = job.data;
  const jobAttempt = job.attemptsMade + 1;
  
  console.log(`[${requestId}] Verifying payment ${paymentId} (attempt ${jobAttempt})`);

  try {
    const payment = await Payment.findById(paymentId).populate('matatu');

    if (!payment) {
      console.error(`[${requestId}] Payment ${paymentId} not found`);
      return { success: false, error: 'Payment not found' };
    }

    // Skip if payment is already in a final state
    if (['completed', 'failed', 'expired', 'refund_required'].includes(payment.status)) {
      console.log(`[${requestId}] Payment ${paymentId} already in final state: ${payment.status}`);
      return { success: true, status: payment.status };
    }

    console.log(`[${requestId}] Querying MPesa for payment ${paymentId}`);

    // Query MPesa status
    const mpesaStatus = await queryMPesaStatus(payment.provider_reference);
    console.log(`[${requestId}] MPesa response:`, mpesaStatus);

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      if (mpesaStatus.ResultCode === 0) {
        // Payment successful
        payment.status = 'completed';
        payment.provider_response = mpesaStatus.ResultDesc;
        payment.updated_at = new Date();
        await payment.save({ session });
        
        // Process successful payment
        await processSuccessfulPayment(payment, session);
        
        // Commit the transaction
        await session.commitTransaction();
        
        // Notify user via socket
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'completed',
          message: 'Payment confirmed! Your seat has been booked.'
        });
        
        return { success: true, status: 'completed' };
        
      } else if ([1032, 1037].includes(mpesaStatus.ResultCode)) {
        // Transaction is still being processed
        payment.status = 'processing';
        payment.provider_response = mpesaStatus.ResultDesc;
        payment.updated_at = new Date();
        payment.verification_attempts = (payment.verification_attempts || 0) + 1;
        await payment.save({ session });
        
        await session.commitTransaction();
        
        // Notify user about status
        io.to(`user-${payment.user}`).emit('payment_status_update', {
          payment_id: payment._id,
          status: 'processing',
          message: 'Your payment is still being processed. Please wait.'
        });
        
        // Throw error to trigger Bull retry
        throw new Error(`Payment verification pending (${mpesaStatus.ResultCode})`);
        
      } else {
        // Failed or other error state
        
        // Only mark as failed on last attempt or explicit failure
        if (jobAttempt >= 5 || [1, 1019, 1001].includes(mpesaStatus.ResultCode)) {
          payment.status = 'failed';
          payment.provider_response = mpesaStatus.ResultDesc;
          payment.updated_at = new Date();
          await payment.save({ session });
          
          // Release the locked seat
          if (payment.matatu) {
            await Matatu.updateOne(
              { _id: payment.matatu._id, "seatLayout.seatNumber": payment.seat_number },
              {
                $set: {
                  "seatLayout.$.locked_by": null,
                  "seatLayout.$.lock_expiry": null,
                  "seatLayout.$.status": "available"
                }
              },
              { session }
            );
          }
          
          await session.commitTransaction();
          
          // Notify user
          io.to(`user-${payment.user}`).emit('payment_status_update', {
            payment_id: payment._id,
            status: 'failed',
            message: 'Payment verification failed. Please try again.'
          });
          
          return { success: false, status: 'failed' };
        } else {
          // Still retrying
          payment.verification_attempts = (payment.verification_attempts || 0) + 1;
          await payment.save({ session });
          await session.commitTransaction();
          
          // Throw error to trigger Bull retry
          throw new Error(`Payment verification returned status: ${mpesaStatus.ResultCode}`);
        }
      }
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    
  } catch (error) {
    console.error(`[${requestId}] Error verifying payment ${paymentId}:`, error);
    
    // Add error to payment record
    try {
      await Payment.findByIdAndUpdate(paymentId, {
        $push: {
          error_log: {
            message: error.message,
            timestamp: new Date(),
            attempt: jobAttempt
          }
        }
      });
    } catch (logError) {
      console.error(`[${requestId}] Failed to log error:`, logError);
    }
    
    // Re-throw to let Bull handle retry
    throw error;
  }
};

// Helper function to query MPesa status
const queryMPesaStatus = async (checkoutRequestId) => {
  const token = await generateMPesaAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkquery/v1/query',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 10000 // 10 second timeout
      }
    );
    return response.data;
  } catch (error) {
    // More detailed error handling
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`MPesa API error: ${error.response.status}`, error.response.data);
      return { 
        ResultCode: 999, 
        ResultDesc: `MPesa API error: ${error.response.status}` 
      };
    } else if (error.request) {
      // The request was made but no response was received
      console.error('MPesa API timeout or network error');
      return { 
        ResultCode: 998, 
        ResultDesc: 'MPesa timeout or network error' 
      };
    } else {
      // Something happened in setting up the request
      console.error('Error setting up MPesa request:', error.message);
      return { 
        ResultCode: 997, 
        ResultDesc: 'Error setting up MPesa request' 
      };
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
const handleRefundRequired = async (payment) => {
  console.log(`Refund process initiated for payment ${payment._id}`);
  
  try {
    // Check if refund is already being processed
    const existingRefund = await Refund.findOne({ payment: payment._id });
    if (existingRefund) {
      console.log(`Refund for payment ${payment._id} already exists in status: ${existingRefund.status}`);
      return;
    }
    
    // Create refund record
    const refund = new Refund({
      payment: payment._id,
      user: payment.user,
      amount: payment.amount,
      receipt_number: payment.transaction_details?.receipt_number,
      reason: payment.error_details?.message || 'System error during booking process',
      status: 'pending',
      created_at: new Date()
    });
    
    await refund.save();
    
    // Add to refund queue for processing
    refundQueue.add('process-refund', 
      { 
        refundId: refund._id,
        paymentId: payment._id,
        requestId: `refund-${Date.now()}`
      }, 
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 60000 }, // 1 minute between attempts
        removeOnComplete: 500,
        removeOnFail: 500
      }
    );
    
    // Notify admin (e.g., email, SMS, dashboard alert)
    notifyAdminOfRefund({
      paymentId: payment._id,
      amount: payment.amount,
      receiptNumber: payment.transaction_details?.receipt_number,
      userId: payment.user,
      timestamp: new Date()
    });
    
    // Update payment status if not already set
    if (payment.status !== 'refund_required') {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'refund_required' } }
      );
    }
    
    // Release seat if it was locked
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
      status: 'refund_required',
      message: 'We apologize for the inconvenience. A refund has been initiated and will be processed within 24-48 hours.'
    });
    
    console.log(`Refund process queued successfully for payment ${payment._id}`);
    
  } catch (error) {
    console.error(`Error initiating refund for payment ${payment._id}:`, error);
    
    // Create error log
    try {
      await Payment.updateOne(
        { _id: payment._id },
        { 
          $push: { 
            error_log: {
              process: 'refund_initiation',
              message: error.message,
              timestamp: new Date()
            }
          }
        }
      );
    } catch (logError) {
      console.error('Failed to log refund error:', logError);
    }
    
    // Send critical alert to dev team
    sendCriticalAlert({
      type: 'REFUND_INITIATION_FAILED',
      paymentId: payment._id,
      error: error.message,
      timestamp: new Date()
    });
  }
};

// Helper function to notify admin
const notifyAdminOfRefund = (refundDetails) => {
  // In production, this might send an email, SMS, or push notification
  console.log('⚠️ ADMIN ALERT: Refund required', refundDetails);
  
  // If you have a central notification system:
  // notificationService.sendToAdmins({
  //   type: 'REFUND_REQUIRED',
  //   priority: 'high',
  //   details: refundDetails
  // });
};

// Helper function for critical alerts
const sendCriticalAlert = (alertDetails) => {
  console.error('🚨 CRITICAL ALERT:', alertDetails);
  
  // In production, integrate with your monitoring/alerting system:
  // 1. Send to Slack/Teams channel
  // 2. Create incident in PagerDuty/OpsGenie
  // 3. Send urgent email to support team
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
  verifyPayment,
  setupPaymentCronJobs,getPayments, getPaymentById, updatePaymentStatus
}; 