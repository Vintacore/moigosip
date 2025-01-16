// models/Route.js
import mongoose from 'mongoose';

const routeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    origin: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    pickupPoint: {
        type: String,
        required: true
    },
    droppingPoint: {
        type: String,
        required: true
    },
    distance: {
        type: Number,
        required: true
    },
    estimatedDuration: {
        type: String,
        required: true
    },
    basePrice: {
        type: Number,
        required: true
    }
});

// Create index for efficient queries
routeSchema.index({ origin: 1, destination: 1 });

const Route = mongoose.model('Route', routeSchema);

export default Route;
