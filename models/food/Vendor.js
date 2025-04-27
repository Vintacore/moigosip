import mongoose from 'mongoose';
const { Schema } = mongoose;

const VendorSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true 
  },
  phone: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  shopName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  // Removed coverImage to avoid image handling logic

  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  }
}, { timestamps: true });


export default mongoose.model('Vendor', VendorSchema);
