// controllers/eshop/vendorController.js
import ShopOwner from '../../models/eshop/ShopOwner.js';
import Category from '../../models/eshop/Category.js';
import Product from '../../models/eshop/Product.js';
import Order from '../../models/eshop/ShopOrder.js';



// Apply to become a vendor
export const applyForVendor = async (req, res) => {
  try {
    const { shopName, category, description, address, phoneNumber } = req.body;

    // Step 1: Ensure user is authenticated
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const userId = req.user.userId; // Consistently use this

    // Step 2: Check if user already has a shop
    const existingShop = await ShopOwner.findOne({ user: userId });
    if (existingShop) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a shop application or shop registered' 
      });
    }

    // Step 3: Check if shop name is taken
    const nameExists = await ShopOwner.findOne({ shopName });
    if (nameExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shop name already taken' 
      });
    }

    // Step 4: Find the category by name
    const categoryDoc = await Category.findOne({ name: category });
    if (!categoryDoc) {
      return res.status(400).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Step 5: Create the new shop
    const shopOwner = new ShopOwner({
      user: userId,
      shopName,
      category: categoryDoc._id,
      description,
      address,
      phoneNumber,
      logo: req.file ? req.file.filename : 'default-shop.png'
    });

    await shopOwner.save();

    res.status(201).json({
      success: true,
      message: 'Vendor application submitted successfully. Please wait for admin approval.',
      data: shopOwner
    });

  } catch (error) {
    console.error('Vendor application error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to submit vendor application',
      error: error.message
    });
  }
};

// Get vendor dashboard data
export const dashboardData = async (req, res) => {
  try {
    // Find shop belonging to the current user
    const shop = await ShopOwner.findOne({ user: req.user.userId })
      .populate('category', 'name');
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Check if shop is approved
    if (!shop.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your shop is not approved yet. Please wait for admin approval.',
        shopStatus: {
          isApproved: shop.isApproved,
          isActive: shop.isActive,
          subscriptionEndDate: shop.subscriptionEndDate
        }
      });
    }
    
    // Check if subscription is still valid
    const isSubscriptionValid = shop.subscriptionEndDate > new Date();
    
    // Get total products
    const totalProducts = await Product.countDocuments({ shop: shop._id });
    
    // Get available products
    const availableProducts = await Product.countDocuments({ 
      shop: shop._id,
      isAvailable: true
    });
    
    // Get total orders
    const totalOrders = await Order.countDocuments({ shop: shop._id });
    
    // Get pending orders
    const pendingOrders = await Order.countDocuments({ 
      shop: shop._id,
      status: 'pending'
    });
    
    // Get recent orders
    const recentOrders = await Order.find({ shop: shop._id })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Calculate revenue (completed orders only)
    const completedOrders = await Order.find({ 
      shop: shop._id,
      status: 'completed'
    });
    
    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    
    res.status(200).json({
      success: true,
      data: {
        shop,
        isSubscriptionValid,
        totalProducts,
        availableProducts,
        totalOrders,
        pendingOrders,
        recentOrders,
        totalRevenue
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

// Update vendor profile
export const updateVendorProfile = async (req, res) => {
  try {
      const { shopName, description, address, phoneNumber } = req.body;
      
      const shop = await ShopOwner.findOne({ user: req.user.userId });
      
      if (!shop) {
          return res.status(404).json({
              success: false,
              message: 'Shop not found'
          });
      }
      
      // Ensure vendor can't update category (that would require admin approval)
      // Check if new shop name is already taken by another shop
      if (shopName && shopName !== shop.shopName) {
          const nameExists = await ShopOwner.findOne({ shopName, _id: { $ne: shop._id } });
          if (nameExists) {
              return res.status(400).json({ 
                  success: false,
                  message: 'Shop name already taken' 
              });
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
          message: 'Vendor profile updated successfully',
          data: shop
      });
  } catch (error) {
      res.status(500).json({
          success: false,
          message: 'Failed to update vendor profile',
          error: error.message
      });
  }
};

// Get vendor stats for a specific time period
  export const getVendorStats = async (req, res) => {
    try {
      // Find shop belonging to the current user
      const shop = await ShopOwner.findOne({ user: req.user.userId });
      
      if (!shop) {
        return res.status(404).json({
          success: false,
          message: 'Shop not found'
        });
      }
      
      // Check if subscription is still valid
      if (shop.subscriptionEndDate < new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Your subscription has expired. Please contact admin to renew.'
        });
      }
      
      // Get time period from query params (default: last 30 days)
      const { period } = req.query;
      let startDate = new Date();
      
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30); // Default 30 days
      }
      
      // Get orders in the time period
      const orders = await Order.find({
        shop: shop._id,
        createdAt: { $gte: startDate }
      });
      
      // Calculate total revenue
      const totalRevenue = orders.reduce((sum, order) => 
        order.status === 'completed' ? sum + order.totalAmount : sum, 0);
      
      // Count orders by status
      const ordersByStatus = {
        pending: 0,
        processing: 0,
        completed: 0,
        cancelled: 0
      };
      
      orders.forEach(order => {
        ordersByStatus[order.status]++;
      });
      
      // Get most sold products
      const productSales = {};
      
      orders.forEach(order => {
        order.items.forEach(item => {
          const productId = item.product.toString();
          if (productSales[productId]) {
            productSales[productId] += item.quantity;
          } else {
            productSales[productId] = item.quantity;
          }
        });
      });
      
      // Convert to array and sort
      const topProducts = Object.entries(productSales)
        .map(([productId, quantity]) => ({ productId, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5); // Top 5
      
      // Get product details
      const topProductDetails = await Promise.all(
        topProducts.map(async item => {
          const product = await Product.findById(item.productId);
          return {
            name: product ? product.name : 'Product not found',
            quantity: item.quantity
          };
        })
      );
      
      res.status(200).json({
        success: true,
        data: {
          totalRevenue,
          totalOrders: orders.length,
          ordersByStatus,
          topProducts: topProductDetails,
          period
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor stats',
        error: error.message
      });
    }
  }; 
  
  