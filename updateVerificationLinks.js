import mongoose from "mongoose";
import dotenv from "dotenv";
import Booking from "./models/Booking.js"; // Ensure the correct path

dotenv.config();

const BASE_URL = "https://moihub.onrender.com"; // New Base URL

const updateVerificationLinks = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log("🚀 Connected to MongoDB");

    // Find all bookings
    const bookings = await Booking.find();

    if (!bookings.length) {
      console.log("✅ No bookings found to update.");
      return;
    }

    console.log(`🔄 Updating ${bookings.length} bookings...`);

    // Update each booking
    for (let booking of bookings) {
      const newVerificationLink = `${BASE_URL}/verify-booking?booking_id=${booking._id}`;

      await Booking.updateOne(
        { _id: booking._id },
        { $set: { verification_link: newVerificationLink } }
      );

      console.log(`✅ Updated booking ${booking._id}`);
    }

    console.log("🎉 All bookings updated successfully!");
    mongoose.connection.close();
  } catch (error) {
    console.error("❌ Error updating bookings:", error);
    mongoose.connection.close();
  }
};

updateVerificationLinks();
