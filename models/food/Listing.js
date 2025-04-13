import mongoose from 'mongoose';

const listingSchema = mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  imageURL: {
    type: String,
    required: true  // you had a typo here: `reuired` => `required`
  },
  isActive: {
    type: Boolean,
    default: true   // will be used to toggle stock availability
  }
}, { timestamps: true });

const Listing = mongoose.model('Listing', listingSchema);

export default Listing;
