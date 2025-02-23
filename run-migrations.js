// run-migration.js
import mongoose from 'mongoose';
import { runMigrations } from './run-migrations.js';

const MONGODB_URI = process.env.MONGODB_URI || 'your_mongodb_uri';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    return runMigrations();
  })
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });