import Queue from 'bull';
import Redis from 'ioredis';

// Use Upstash Redis connection string
const redisUrl = process.env.REDIS_URL;

// Create payment queue with correct configuration
const paymentQueue = new Queue('payment-processing', {
  redis: redisUrl,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export default {
  paymentQueue
};