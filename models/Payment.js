import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  matatu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Matatu',
    required: true 
  },
  seat_number: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  phone_number: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refund_required', 'stk_pushed', 'processing', 'expired'],
    default: 'pending'
  },
  provider_reference: String,
  provider_response: String,
  stk_initiated: {
    type: Boolean,
    default: false
  },
  stk_completion_status: {
    type: String,
    enum: ['awaiting_user_input', 'completed', 'cancelled', 'failed', 'stk_pushed'],
    default: null
  },
  transaction_details: {
    receipt_number: String,
    transaction_date: String
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  // Add these to your Payment schema
  verification_attempts: { type: Number, default: 0 },
  error_log: [{
    message: String,
    timestamp: Date,
    stack: String
  }],
  updated_at: {
    type: Date
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
