import Vendor from '../../models/food/Vendor.js';
import User from '../../models/User.js'; 

// Register a new vendor (upgrade existing user to vendor)
export const registerVendor = async (req, res) => {
  const { phone, location } = req.body;
  const userId = req.user.userId; // From verifyToken middleware

  try {
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if vendor already exists for this user
    const vendorExists = await Vendor.findOne({ user: userId });
    if (vendorExists) return res.status(400).json({ message: 'Vendor profile already exists for this user' });

    // Create new vendor profile
    const vendor = new Vendor({
      user: userId,
      phone,
      location,
      isApproved: false,
      isActive: true,
      subscriptionEndDate: null,
    });

    // Save the vendor first
    await vendor.save();

    // Now update the user's role and save it
    user.role = 'vendor';
    await user.save(); // 🔥 You must save after modifying the user

    res.status(201).json({ message: 'Vendor registration submitted for approval' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



// Get vendor profile
export const getProfile = async (req, res) => {
  try {
    // In vendor routes: req.vendorId is set by vendorAuth middleware
    // In application status routes: req.user.userId would be used
    const vendorId = req.vendorId || null;
    const userId = req.user?.userId || null;
    
    let vendor;
    
    if (vendorId) {
      vendor = await Vendor.findById(vendorId).populate('user', 'username email');
    } else if (userId) {
      vendor = await Vendor.findOne({ user: userId }).populate('user', 'username email');
    } else {
      return res.status(400).json({ message: 'Invalid request' });
    }
    
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    res.status(200).json({ vendor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
 
// Update vendor profile
export const updateProfile = async (req, res) => {
  const { phone, location } = req.body;
  const vendorId = req.vendorId;

  try {
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { phone, location },
      { new: true }
    );
    
    if (!updatedVendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    
    res.status(200).json({ message: 'Vendor profile updated', vendor: updatedVendor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get vendor dashboard data
export const getDashboard = async (req, res) => {
  const vendorId = req.vendorId;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    // Placeholder values - you'll replace these with actual data
    const activeOrders = 0;
    const totalOrders = 0;
    const totalSales = 0;

    res.status(200).json({
      message: 'Dashboard data retrieved',
      data: {
        activeOrders,
        totalOrders,
        totalSales,
        vendor
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================
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

// Admin: Update vendor status
export const updateVendorStatus = async (req, res) => {
  const vendorId = req.params.id;
  const { isApproved, isActive } = req.body;
  
  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    
    if (isApproved !== undefined) vendor.isApproved = isApproved;
    if (isActive !== undefined) vendor.isActive = isActive;
    
    await vendor.save();
    
    res.status(200).json({ 
      message: 'Vendor status updated', 
      vendor 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Vendor: Toggle their active status (open/closed)
export const toggleVendorAvailability = async (req, res) => {
  const userId = req.user.userId;
  const { isOpen } = req.body;

  try {
    const vendor = await Vendor.findOne({ user: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    vendor.isOpen = isOpen;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: `You are now ${isOpen ? 'open for business' : 'closed for business'}`,
      vendor
    });
  } catch (err) {
    console.error("❌ Toggle error:", err);
    res.status(500).json({ message: 'Failed to update availability', error: err.message });
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