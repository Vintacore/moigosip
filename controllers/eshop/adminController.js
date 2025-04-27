// controllers/eshop/adminController.js
import ShopOwner from '../../models/eshop/ShopOwner.js';
import Category from '../../models/eshop/Category.js';
import Product from '../../models/eshop/Product.js';
import Order from '../../models/eshop/ShopOrder.js';
import User from '../../models/User.js';


// Get all vendor applications
export const getVendorApplications = async (req, res) => {
  try {
    const applications = await ShopOwner.find({ isApproved: false })
      .populate('user', 'name email')
      .populate('category', 'name');
    
    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor applications',
      error: error.message
    });
  }
};

// Approve vendor application
export const approveVendorApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { subscriptionEndDate } = req.body;
    
    // Validate subscription end date
    if (!subscriptionEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Subscription end date is required'
      });
    }
    
    const shop = await ShopOwner.findById(id);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Update shop status
    shop.isApproved = true;
    shop.subscriptionEndDate = new Date(subscriptionEndDate);
    await shop.save();
    
    // Update user role to shop owner
    const user = await User.findById(shop.user);
    if (user) {
      user.role = 'shopowner';
      await user.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Vendor application approved successfully',
      data: shop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve vendor application',
      error: error.message
    });
  }
};

// Reject vendor application
export const rejectVendorApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    const shop = await ShopOwner.findById(id);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Delete the shop application
    await ShopOwner.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Vendor application rejected successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject vendor application',
      error: error.message
    });
  }
};

// Get all shops (admin)
export const getAllShops = async (req, res) => {
  try {
    const shops = await ShopOwner.find()
      .populate('user', 'name email')
      .populate('category', 'name');
    
    res.status(200).json({
      success: true,
      count: shops.length,
      data: shops
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
};

// Get shop by ID (admin)
export const getShopById = async (req, res) => {
  try {
    const shop = await ShopOwner.findById(req.params.id)
      .populate('user', 'name email')
      .populate('category', 'name');
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: shop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop',
      error: error.message
    });
  }
};

// Update shop status and subscription (admin)
export const updateShopStatus = async (req, res) => {
  try {
    const { isActive, subscriptionEndDate } = req.body;
    
    const shop = await ShopOwner.findById(req.params.id);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Update active status if provided
    if (isActive !== undefined) {
      shop.isActive = isActive;
    }
    
    // Update subscription end date if provided
    if (subscriptionEndDate) {
      shop.subscriptionEndDate = new Date(subscriptionEndDate);
    }
    
    await shop.save();
    
    res.status(200).json({
      success: true,
      message: 'Shop status updated successfully',
      data: shop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update shop status',
      error: error.message
    });
  }
};


