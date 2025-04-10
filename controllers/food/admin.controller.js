import Vendor from '../../models/food/Vendor.js';

// Approve vendor and set subscription end date
export const approveVendor = async (req, res) => {
  const { id } = req.params;
  const { subscriptionEndDate } = req.body; // Expecting a date string

  try {
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.isApproved = true;
    vendor.isActive = true;
    vendor.subscriptionEndDate = new Date(subscriptionEndDate); // Ensure valid date

    await vendor.save();
    res.status(200).json({ message: 'Vendor approved successfully', vendor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
