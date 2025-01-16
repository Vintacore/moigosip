// models/Booking.js
import mongoose from 'mongoose';


const bookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    matatu: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Matatu',
        required: true
    },
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true
    },
    seatNumber: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    bookingDate: {
        type: Date,
        default: Date.now
    },
    travelDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    mpesaTransactionId: {
        type: String
    }
}, { timestamps: true });  // Adding timestamps

// Create index for efficient queries
bookingSchema.index({ user: 1, travelDate: -1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
