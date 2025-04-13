import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  items: [
    {
      listingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Listing',
        required: true
      },
      quantity: {
        type: Number,
        default: 1
      }
    }
  ],
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deliveryInstructions: {
    type: String,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'delivered'],
    default: 'pending'
  }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
export default Order;
