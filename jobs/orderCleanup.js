// jobs/orderCleanup.js
import Order from '../models/food/Order.js';

const cleanOldOrders = async () => {
  try {
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    const result = await Order.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: 'pending' // Optional: only delete abandoned orders
    });

    console.log(`🧹 Deleted ${result.deletedCount} old orders`);
  } catch (err) {
    console.error('❌ Error cleaning old orders:', err);
  }
};

export default cleanOldOrders;
