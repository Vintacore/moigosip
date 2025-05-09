import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true 
  },
  shopName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
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
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Add index for faster queries
vendorSchema.index({ user: 1 });
vendorSchema.index({ isApproved: 1, isActive: 1 });

// Pre-save hook to update updatedAt timestamp
vendorSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Vendor = mongoose.model('Vendor', vendorSchema);

export default Vendor;