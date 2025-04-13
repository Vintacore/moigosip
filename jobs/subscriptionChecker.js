// jobs/subscriptionChecker.js
import Vendor from '../models/food/Vendor.js';  // Adjust path to Vendor model
import { sendVendorSubscriptionExpired } from '../services/emailService.js'; // Import the email service

const checkVendorSubscriptions = async () => {
  try {
    const now = new Date();

    const expiredVendors = await Vendor.find({
      subscriptionEndDate: { $lt: now },
      isActive: true
    });

    if (expiredVendors.length > 0) {
      for (const vendor of expiredVendors) {
        // Deactivate the vendor
        if (vendor.isActive) {
          vendor.isActive = false;
          await vendor.save();
          console.log(`Deactivated: ${vendor.name}`);

          // Send email notification to vendor
          try {
            await sendVendorSubscriptionExpired({
              to: vendor.user.email,
              vendorName: vendor.name || 'Vendor'
            });
          } catch (emailErr) {
            console.error(`Failed to notify ${vendor.name}:`, emailErr);
          }
        }
      }
    } else {
      console.log('No expired vendors found.');
    }
  } catch (err) {
    console.error('Error checking subscriptions:', err);
  }
};

export default checkVendorSubscriptions;
