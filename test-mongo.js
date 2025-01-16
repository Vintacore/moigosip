import 'dotenv/config';
import mongoose from 'mongoose';

const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("MongoDB URI not found in .env file");
    process.exit(1);
}

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log("Connected to MongoDB");

        try {
            const db = mongoose.connection.db;
            const indexes = await db.collection('matatus').indexes();
            console.log("Indexes:", indexes);
        } catch (error) {
            console.error("Error fetching indexes:", error.message);
        } finally {
            mongoose.connection.close();
        }
    })
    .catch(error => {
        console.error("Error connecting to MongoDB:", error.message);
    });

    