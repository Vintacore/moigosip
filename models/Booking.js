import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  matatu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Matatu",
    required: true
  },
  // Keep both seat ID and seat number for different purposes
  seat: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Matatu.seatLayout" // References the specific seat document
  },
  seatNumber: {
    type: Number,
    required: true
  }, 
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Route",
    required: true
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'confirmed'
  },
  travelDate: {
    type: Date,
    required: true
  },
  fare: {
    type: Number,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index that ensures unique booking per matatu, seat number, and travel date
bookingSchema.index(
  { 
    matatu: 1, 
    seatNumber: 1, 
    travelDate: 1, 
    status: 1 
  }, 
  { 
    unique: true,
    partialFilterExpression: { status: "confirmed" } // Only enforce uniqueness for confirmed bookings
  }
);

// Update timestamps on save
bookingSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;