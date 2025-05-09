import mongoose from 'mongoose';
const { Schema } = mongoose;

const VendorSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // This already creates an index, no need for additional index
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

// Only add indexes that aren't created by 'unique: true'
VendorSchema.index({ isApproved: 1, isActive: 1 });

// Keep this if you still need the email index
VendorSchema.index({ email: 1 }, { sparse: true, background: true, unique: false });

const Vendor = mongoose.model('Vendor', VendorSchema);
export default Vendor;