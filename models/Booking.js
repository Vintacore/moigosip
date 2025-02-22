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

export default mongoose.model("Booking", bookingSchema);