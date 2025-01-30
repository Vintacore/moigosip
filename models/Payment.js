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
    enum: ['pending', 'completed', 'failed', 'refund_required'],
    default: 'pending'
  },
  provider_reference: String,
  provider_response: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;