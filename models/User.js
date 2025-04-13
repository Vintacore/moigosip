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
  role: { 
    type: String, 
    required: true, 
    enum: ['user', 'admin', 'writer','vendor'], 
    default: 'user' 
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User; 
