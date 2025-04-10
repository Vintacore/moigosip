// /jobs/subscriptionChecker.js
import Vendor from '../models/food/Vendor.js';  // Adjust path to Vendor model

const checkVendorSubscriptions = async () => {
  try {
    const now = new Date();

    const expiredVendors = await Vendor.find({
      subscriptionEndDate: { $lt: now },
      isActive: true
    });

    if (expiredVendors.length > 0) {
      for (const vendor of expiredVendors) {
        vendor.isActive = false;
        await vendor.save();
        console.log(`Deactivated: ${vendor.name}`);
      }
    } else {
      console.log('No expired vendors found.');
    }
  } catch (err) {
    console.error('Error checking subscriptions:', err);
  }
};

export default checkVendorSubscriptions;
