// Approve vendor and set subscription end date
import Vendor from '../../models/food/Vendor.js';
import User from '../../models/User.js'; // ✅ Needed to update the user role

// Approve vendor and set subscription end date
export const approveVendor = async (req, res) => {
  const { id } = req.params;
  const { subscriptionEndDate } = req.body;

  try {
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // ✅ Update vendor info
    vendor.isApproved = true;
    vendor.isActive = true;
    vendor.subscriptionEndDate = new Date(subscriptionEndDate);

    await vendor.save();

    // ✅ Update user's role to vendor
    const user = await User.findById(vendor.user);
    if (user && user.role !== 'vendor') {
      user.role = 'vendor';
      await user.save();
    }

    res.status(200).json({ message: 'Vendor approved successfully', vendor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Admin: Update vendor status
export const updateVendorStatus = async (req, res) => {
  const vendorId = req.params.id;
  const { isApproved, isActive, subscriptionEndDate } = req.body; // Add subscriptionEndDate
   
  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
       
    if (isApproved !== undefined) vendor.isApproved = isApproved;
    if (isActive !== undefined) vendor.isActive = isActive;
    
    // Add this condition to update subscription date
    if (subscriptionEndDate) {
      vendor.subscriptionEndDate = new Date(subscriptionEndDate);
    }
       
    await vendor.save();
    
    // If vendor is being approved and user's role needs updating
    if (isApproved && !vendor._previousIsApproved) {
      const user = await User.findById(vendor.user);
      if (user && user.role !== 'vendor') {
        user.role = 'vendor';
        await user.save();
      }
    }
    
    // Store previous value for future reference
    vendor._previousIsApproved = vendor.isApproved;
       
    res.status(200).json({
      message: 'Vendor status updated',
      vendor
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get all vendors
export const getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().populate('user', 'username email');
    res.status(200).json({ vendors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Public: Get approved and active vendors
export const getApprovedVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ isApproved: true, isActive: true })
      .populate('user', 'username email');
    res.status(200).json({ vendors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
 
// Admin: Get vendors pending approval
export const getUnapprovedVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ isApproved: false })
      .populate('user', 'username email');
    res.status(200).json({ vendors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};  

// Delete vendor profile
export const deleteVendor = async (req, res) => {
  const vendorId = req.vendorId;
  
  try {
    const result = await Vendor.findByIdAndDelete(vendorId);
    if (!result) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    
    res.status(200).json({ message: 'Vendor profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};