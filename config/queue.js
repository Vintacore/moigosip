import Queue from 'bull';
import Redis from 'ioredis';

// Use Upstash Redis connection string
const redisUrl = process.env.REDIS_URL;

// Create Redis clients for Bull
const redisClient = new Redis(redisUrl, {
  enableReadyCheck: false, // Fixes Bull queue issue
  maxRetriesPerRequest: null
});

const redisSubscriber = new Redis(redisUrl, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null
});

// Create payment queue
const paymentQueue = new Queue('payment-processing', {
  createClient: (type) => {
    switch (type) {
      case 'client':
        return redisClient;
      case 'subscriber':
        return redisSubscriber;
      default:
        return new Redis(redisUrl);
    }
  },
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
