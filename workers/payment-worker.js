import queueConfig from '../config/queue.js';
import { paymentController } from '../controllers/PaymentController.js';

const { paymentQueue } = queueConfig;
const { verifyPayment, cancelExpiredPayments } = paymentController;

// Process verification jobs
paymentQueue.process('verify-payment', async (job) => {
  console.log(`Processing payment verification job: ${job.id}`);
  const { paymentId } = job.data;

  try {
    await verifyPayment(paymentId, 1); // Ensure verifyPayment function handles logic correctly
    return { success: true };
  } catch (error) {
    console.error(`Error processing payment job ${job.id}:`, error);
    throw error; // This will trigger a retry based on Bull's configuration
  }
});

// Setup scheduled job for cleanup
paymentQueue.add('cleanup-expired-payments', {}, {
  repeat: {
    every: 5 * 60 * 1000 // every 5 minutes
  }
});

paymentQueue.process('cleanup-expired-payments', async () => {
  console.log('Running scheduled payment cleanup job');
  
  try {
    await cancelExpiredPayments(); // Ensure this function exists in PaymentController
    return { success: true };
  } catch (error) {
    console.error('Error during payment cleanup:', error);
    throw error;
  }
});

// Handle global events
paymentQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err.message}`);
});

paymentQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down payment queue...');
  await paymentQueue.close();
  process.exit(0);
});
