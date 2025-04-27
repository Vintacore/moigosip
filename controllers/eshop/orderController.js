// controllers/eshop/orderController.js
import Product from '../../models/eshop/Product.js';
import ShopOwner from '../../models/eshop/ShopOwner.js';
import ShopOrder from '../../models/eshop/ShopOrder.js'; 


// Place a new order
export const placeOrder = async (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is missing. Please authenticate first.'
    });
  }
  
  try {
    const { shopId, items, shippingAddress, contactNumber } = req.body;
    const userId = req.user.userId;

    // Validate the shop
    const shop = await ShopOwner.findOne({
      _id: shopId,
      isApproved: true,
      isActive: true,
      isOpen: true,
      subscriptionEndDate: { $gt: new Date() }
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or not available'
      });
    }

    // Validate items and calculate total
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one item to order'
      });
    }

    let totalAmount = 0;
    const orderItems = [];

    // Fetch products in bulk to avoid multiple DB queries
    const productIds = items.map(item => item.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      shop: shopId,
      isAvailable: true
    });

    // Create a map of products for quick lookup
    const productMap = new Map(products.map(product => [product._id.toString(), product]));

    // Validate and process each item
    for (const item of items) {
      const product = productMap.get(item.productId.toString());

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product with ID ${item.productId} not found or unavailable`
        });
      }

      const itemTotal = product.price * (item.quantity || 1);
      totalAmount += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity || 1,
        price: product.price
      });
    }

    // Create the order
    const order = new ShopOrder({
      user: userId,
      shop: shopId,
      items: orderItems,
      totalAmount,
      shippingAddress,
      contactNumber,
      status: 'pending'
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};
// Get orders for logged in user
export const getMyOrders = async (req, res) => {
  try {
    // Apply filters if provided
    const filterOptions = { user: req.user.userId }; // Changed from req.user.id to req.user.userId
    
    if (req.query.status) {
      filterOptions.status = req.query.status;
    }
    
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    const totalOrders = await ShopOrder.countDocuments(filterOptions); // Changed from Order to ShopOrder
    
    const orders = await ShopOrder.find(filterOptions) // Changed from Order to ShopOrder
      .populate('shop', 'shopName')
      .populate('items.product', 'name image')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      count: orders.length,
      totalPages: Math.ceil(totalOrders / limit),
      currentPage: page,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};

// Get vendor orders (shop owner only)
export const getVendorOrders = async (req, res) => {
  try {
    // Since we're using shopOwnerAuth middleware, we can use req.shopOwner directly
    const shop = req.shopOwner;
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    // Apply filters if provided
    const filterOptions = { shop: shop._id };
    
    if (req.query.status) {
      filterOptions.status = req.query.status;
    }
    
    // Date filter
    if (req.query.startDate && req.query.endDate) {
      filterOptions.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    const totalOrders = await ShopOrder.countDocuments(filterOptions);

    const orders = await ShopOrder.find(filterOptions)
      .populate('user', 'name email')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      count: orders.length,
      totalPages: Math.ceil(totalOrders / limit),
      currentPage: page,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching vendor orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor orders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};

// Get a single order by ID (for vendor)
export const getVendorOrderById = async (req, res) => {
  try {
    // Using shopOwner from middleware
    const shop = req.shopOwner;
    
    const order = await ShopOrder.findOne({ // Changed from Order to ShopOrder
      _id: req.params.id,
      shop: shop._id
    })
    .populate('user', 'name email')
    .populate('items.product', 'name image price');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};
 
// Update order status (vendor only)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status
    if (!['processing', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    // Using shopOwner from middleware
    const shop = req.shopOwner;
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    const order = await ShopOrder.findOne({ // Changed from Order to ShopOrder
      _id: req.params.id,
      shop: shop._id
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // If order is already completed or cancelled, don't allow further updates
    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Order is already ${order.status} and cannot be updated`
      });
    }
    
    // When processing an order, we might want to decrease product quantities
    if (status === 'processing' && order.status === 'pending') {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          // Check if enough quantity available
          if (product.quantity < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient quantity for product ${product.name}`,
              productId: product._id
            });
          }
          
          // Decrease product quantity
          product.quantity -= item.quantity;
          await product.save();
        }
      }
    }
    
    // If cancelling order, return quantities to products
    if (status === 'cancelled' && order.status !== 'cancelled') {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.quantity += item.quantity;
          await product.save();
        }
      }
    }
    
    order.status = status;
    await order.save();
    
    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
}; 

