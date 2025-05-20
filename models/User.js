import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  averageRating: {
  type: Number,
  default: 0
},
linkMeUser: { type: Boolean, default: false },
isVerified: { type: Boolean, default: false },
verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
selfieUrl: { type: String }, // for uploaded selfie
submissionDate: { type: Date },
  role: { 
    type: String, 
    required: true, 
    enum: ['user', 'admin', 'writer','vendor', 'shopowner'], 
    default: 'user' 
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User; 
