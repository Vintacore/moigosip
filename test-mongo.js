import mongoose from 'mongoose';
import Matatu from './models/Matatu.js';

// Replace with your MongoDB connection string
const MONGODB_URI = 'mongodb+srv://vinnykylex:5595@cluster0.auy7m.mongodb.net/';

async function dropIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    await Matatu.collection.dropIndexes();
    console.log('All indexes dropped successfully');

    // Optional: Create the new index
    await Matatu.collection.createIndex({ registrationNumber: 1 }, { unique: true });
    console.log('New index created successfully');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

dropIndexes();