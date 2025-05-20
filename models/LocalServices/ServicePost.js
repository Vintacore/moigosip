import mongoose from 'mongoose';

const servicePostSchema = new mongoose.Schema({
  title: String,
  phoneNumber: String, // Keep this field
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType' },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved: { type: Boolean, default: false },
  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      value: { type: Number, min: 1, max: 5 }
    }
  ]
}, { timestamps: true });

servicePostSchema.virtual('averageRating').get(function () {
  if (!this.ratings.length) return 0;
  const total = this.ratings.reduce((sum, r) => sum + r.value, 0);
  return total / this.ratings.length;
});

export const ServicePost = mongoose.model('ServicePost', servicePostSchema);
