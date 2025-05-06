import Vendor from '../../models/food/Vendor.js';
import User from '../../models/User.js'; 

// Register a new vendor (upgrade existing user to vendor)
// Fixed vendor registration controller
export const registerVendor = async (req, res) => {
  const { shopName, phone, location } = req.body;
  const userId = req.user.userId; // From verifyToken middleware
  
  try {
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if vendor already exists for this user
    const vendorExists = await Vendor.findOne({ user: userId });
    if (vendorExists) {
      return res.status(400).json({ 
        message: 'Vendor profile already exists for this user', 
        status: vendorExists.isApproved ? 'approved' : 'pending' 
      });
    }
    
    // Validate required fields
    if (!shopName || !phone || !location) {
      return res.status(400).json({ message: 'Shop name, phone and location are required' });
    }
    
    // Create new vendor profile
    const vendor = new Vendor({
      user: userId,
      shopName,
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
    await user.save();
    
    res.status(201).json({ 
      message: 'Vendor registration submitted for approval', 
      vendorId: vendor._id 
    });
    
  } catch (error) {
    console.error('Vendor registration error:', error);
    
    // Check for duplicate key error and provide a more specific message
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'You already have a vendor profile or there is a conflict with an existing record',
        error: error.message
      });
    }
    
    res.status(500).json({ 
      message: 'Server error during vendor registration', 
      error: error.message 
    });
  }
};
export const checkVendorStatus = async (req, res) => {
  const userId = req.user.userId;
  try {
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if vendor profile exists
    const vendor = await Vendor.findOne({ user: userId });
    
    if (!vendor) {
      return res.json({ 
        isVendor: false,
        isApproved: false
      });
    }
    
    // If vendor exists, return status
    return res.json({
      isVendor: true,
      isApproved: vendor.isApproved,
      shopName: vendor.shopName,
      status: vendor.isApproved ? 'approved' : 'pending'
    });
    
  } catch (error) {
    console.error('Vendor status check error:', error);
    return res.status(500).json({ message: 'Server error checking vendor status' });
  }
};
// Update vendor profile
export const updateProfile = async (req, res) => {
  const vendorId = req.vendorId;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Safe update: Only apply fields that are provided in the request
    vendor.phone = req.body.phone || vendor.phone;
    vendor.location = req.body.location || vendor.location;
    vendor.shopName = req.body.shopName || vendor.shopName;
    vendor.description = req.body.description || vendor.description;
    // vendor.coverImage = req.body.coverImage || vendor.coverImage; // Only when you implement uploads

    await vendor.save();

    res.status(200).json({ message: 'Vendor profile updated', vendor });
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
// GET PUBLIC VENDOR LISTINGS (Public endpoint)
export const getPublicVendorListings = async (req, res) => {
  const { vendorId } = req.params;
  const { page = 1, limit = 10, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  
  try {
    // Check if vendor exists and is approved
    const vendor = await Vendor.findOne({ 
      _id: vendorId,
      isApproved: true,
      isActive: true
    });
    
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found or not approved' 
      });
    }
    
    // Build filter for listings
    const filter = { 
      vendorId,
      isActive: true,
      isApproved: true  // Only show listings approved by admin
    };
    
    // Add optional category filter
    if (category) filter.category = category;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await Listing.countDocuments(filter);
    
    // Get listings with pagination and sorting
    const listings = await Listing.find(filter)
      .select('name price description category imageURL createdAt')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      vendorName: vendor.businessName,
      listings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get public vendor listings error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching vendor listings',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
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