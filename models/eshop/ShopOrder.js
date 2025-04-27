import mongoose from 'mongoose';

const shopOrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', 
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShopOwner',
    required: true
  },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      price: {
        type: Number,
        required: true
      }
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled'], 
    default: 'pending'
  },
  shippingAddress: {
    type: String,
    required: true
  },
  
  contactNumber: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Safeguard for avoiding overwrite errors
const ShopOrder = mongoose.models.ShopOrder || mongoose.model('ShopOrder', shopOrderSchema);

export default ShopOrder;
 