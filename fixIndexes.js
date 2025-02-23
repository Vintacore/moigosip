import mongoose from "mongoose";
import Booking from "./models/Booking.js"; // Adjust the path based on your project structure

// MongoDB connection URL (Replace with your actual connection string)
const MONGO_URI = ""; // Change 'your_database_name'

const fixIndexes = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to MongoDB...");

    const collection = mongoose.connection.db.collection("bookings");

    // List existing indexes
    const indexes = await collection.indexes();
    console.log("Existing Indexes:", indexes);

    // Drop any old index on `matatu` only
    for (const index of indexes) {
      if (index.key.matatu === 1 && Object.keys(index.key).length === 1) {
        console.log("Dropping incorrect index:", index.name);
        await collection.dropIndex(index.name);
      }
    }

    // Ensure the correct compound index is set
    await Booking.collection.createIndex({ matatu: 1, seat_number: 1 }, { unique: true });
    console.log("✅ Correct index { matatu + seat_number } set!");

    await mongoose.connection.close();
    console.log("Database connection closed.");
  } catch (error) {
    console.error("Error fixing indexes:", error);
    process.exit(1);
  }
};

fixIndexes();
