// backend/models/food/Listing.js
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
    reuired:true
  }
}, { timestamps: true });

const Listing = mongoose.model('Listing', listingSchema);

export default Listing;
