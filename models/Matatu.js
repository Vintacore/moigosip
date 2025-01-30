import mongoose from 'mongoose';

const matatuSchema = new mongoose.Schema({
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true
    },
    registrationNumber: {
        type: String,
        required: true,
        unique: true
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
        },
        locked_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        lock_expiry: {
            type: Date,
            default: null
        }
    }]
}, {
    timestamps: true,
    strict: true
});

// Add index with sparse option
matatuSchema.index({ registrationNumber: 1 }, { unique: true });

// Add method to clear expired locks
matatuSchema.methods.clearExpiredLocks = async function() {
    const currentTime = new Date();
    
    this.seatLayout = this.seatLayout.map(seat => {
        if (seat.lock_expiry && seat.lock_expiry < currentTime) {
            seat.locked_by = null;
            seat.lock_expiry = null;
        }
        return seat;
    });
    
    return this.save();
};

const Matatu = mongoose.model('Matatu', matatuSchema);

export default Matatu;