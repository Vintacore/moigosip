import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  matatu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Matatu",
    required: true
  },
  seat_number: {
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
  payment_reference: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'confirmed'
  },
  travel_date: {
    type: Date
  },
  booking_date: {
    type: Date,
    default: Date.now
  }
});

bookingSchema.index({ matatu: 1, seat_number: 1 }, { unique: true });

export default mongoose.model("Booking", bookingSchema);
