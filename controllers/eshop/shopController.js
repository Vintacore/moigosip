// controllers/eshop/shopController.js
const ShopOwner = require('../../models/ShopOwner');
const User = require('../../models/User');


// Update shop (shop owner only)
exports.updateShop = async (req, res) => {
  try {
    const { shopName, description, address, phoneNumber } = req.body;
    
    const shop = await ShopOwner.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or you are not authorized'
      });
    }
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    // Check if new shop name is already taken by another shop
    if (shopName && shopName !== shop.shopName) {
      const nameExists = await ShopOwner.findOne({ shopName, _id: { $ne: shop._id } });
      if (nameExists) {
        return res.status(400).json({ message: 'Shop name already taken' });
      }
      shop.shopName = shopName;
    }
    
    if (description) shop.description = description;
    if (address) shop.address = address;
    if (phoneNumber) shop.phoneNumber = phoneNumber;
    if (req.file) shop.logo = req.file.filename;
    
    await shop.save();
    
    res.status(200).json({
      success: true,
      data: shop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update shop',
      error: error.message
    });
  }
};

// Toggle shop open/closed status (shop owner only)
exports.toggleShopOpen = async (req, res) => {
  try {
    const shop = await ShopOwner.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or you are not authorized'
      });
    }
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    shop.isOpen = !shop.isOpen;
    await shop.save();
    
    res.status(200).json({
      success: true,
      message: `Shop is now ${shop.isOpen ? 'open' : 'closed'}`,
      data: shop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle shop status',
      error: error.message
    });
  }
};

// Get my shop (shop owner only)
exports.getMyShop = async (req, res) => {
  try {
    const shop = await ShopOwner.findOne({ user: req.user.id })
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