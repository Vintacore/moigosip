import mongoose from 'mongoose';

const serviceTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  }
}, { timestamps: true });

export const ServiceType = mongoose.model('ServiceType', serviceTypeSchema);
