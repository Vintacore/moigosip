import Order from '../../models/food/Order.js';
import Vendor from '../../models/food/Vendor.js';
import Listing from '../../models/food/Listing.js';
//import User from '../../models/User.js';
import { sendVendorOrderNotification } from '../../services/emailService.js';
const VALID_STATUS_TRANSITIONS = {
    'pending': ['confirmed', 'rejected'],
    'confirmed': ['delivered', 'rejected'],
    'rejected': [], // No transitions allowed from rejected
    'delivered': [] // No transitions allowed from delivered
  };
  
export const placeOrder = async (req, res) => {
  try {
    const { items, vendorId, deliveryInstructions } = req.body;

    // ✅ Validate vendor
    const vendor = await Vendor.findById(vendorId).populate('user');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    if (!vendor.isApproved || !vendor.isActive || !vendor.isOpen) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vendor is not accepting orders at this time' 
      });
    }

    let totalPrice = 0;
    const validItems = [];

    // ✅ Validate items and calculate total
    for (const item of items) {
      const listing = await Listing.findById(item.listingId);
      if (listing) {
        totalPrice += listing.price * item.quantity;
        validItems.push({
          listingId: listing._id,
          quantity: item.quantity
        });
      }
    }

    if (validItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid items in order' });
    }

    // ✅ Create order
    const newOrder = new Order({
      items: validItems,
      vendorId,
      userId: req.user.userId,
      deliveryInstructions,
      status: 'pending',
      totalPrice
    });

    await newOrder.save();

    // ✅ Respond to client immediately
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: newOrder
    });

    // 🔁 Send email asynchronously (non-blocking)
    if (vendor?.user?.email) {
      sendVendorOrderNotification({
        to: vendor.user.email,
        vendorName: vendor.user.username || 'Vendor',
        orderId: newOrder._id.toString(),
        deliveryInstructions,
        totalPrice,
        itemCount: validItems.length
      }).then(() => {
        console.log('✅ Order email sent to vendor:', vendor.user.email);
      }).catch((emailErr) => {
        console.error('❌ Failed to send email to vendor:', emailErr);
      });
    }

  } catch (err) {
    console.error("❌ Place order error:", err);
    res.status(500).json({ success: false, message: 'Failed to place order', error: err.message });
  }
};
export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const orders = await Order.find({ vendorId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error('Get vendor orders error:', err);
    res.status(500).json({ success: false, message: 'Error fetching vendor orders' });
  }
};
export const updateOrderStatus = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status: newStatus } = req.body;
      const vendorId = req.vendor.id;
      
      // Find the order and verify it belongs to this vendor
      const order = await Order.findOne({ _id: orderId, vendorId });
      
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          message: 'Order not found or does not belong to this vendor' 
        });
      }
      
      const currentStatus = order.status;
      
      // Check if the transition is allowed
      if (!VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change order status from '${currentStatus}' to '${newStatus}'`
        });
      }
  
      // Update status
      order.status = newStatus;
      await order.save();
      
      res.status(200).json({ 
        success: true, 
        message: 'Order status updated successfully',
        order 
      });
      
    } catch (err) {
      console.error("❌ Update order status error:", err);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update order status', 
        error: err.message 
      });
    }
  };