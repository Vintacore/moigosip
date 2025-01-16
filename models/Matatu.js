// models/Matatu.js
import mongoose from 'mongoose';

// First, explicitly remove the old schema and model
try {
    mongoose.deleteModel('Matatu');
} catch (error) {
    // Model might not exist yet, which is fine
}

// Create a fresh schema
const matatuSchema = new mongoose.Schema({
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true
    },
    registrationNumber: {  // This is what we're using in the controller
        type: String,
        required: true,
        unique: true
    },
    // Explicitly remove any 'plate' field to avoid conflicts
    plate: {
        type: String,
        select: false  // This will hide the field but keep existing data
    },
    totalSeats: {
        type: Number,
        required: true
    },
    departureTime: {
        type: String,
        required: true
    },
    currentPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'maintenance', 'full', 'cancelled'],
        default: 'active'
    },
    seatLayout: [{
        seatNumber: Number,
        isBooked: {
            type: Boolean,
            default: false
        }
    }]
}, {
    timestamps: true,
    strict: true  // This ensures no extra fields can be added
});

// Clear existing indexes
matatuSchema.indexes().forEach(async ([name]) => {
    try {
        await mongoose.model('Matatu').collection.dropIndex(name);
    } catch (error) {
        // Index might not exist
    }
});

// Add the index for registrationNumber
matatuSchema.index({ registrationNumber: 1 }, { 
    unique: true,
    sparse: true  // This allows null values and prevents the duplicate key error for nulls
});

const Matatu = mongoose.model('Matatu', matatuSchema);

export default Matatu;