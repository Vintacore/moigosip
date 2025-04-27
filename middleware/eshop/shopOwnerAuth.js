import ShopOwner from '../../models/eshop/ShopOwner.js';  // ShopOwner model
import jwt from 'jsonwebtoken';

// Middleware to check if a user has shop owner privileges
export const shopOwnerAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];  // Extract token from the authorization header

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Check if the user has shop owner privileges
    const shopOwner = await ShopOwner.findOne({ user: userId });  // Find the shop owner by user ID

    if (!shopOwner) {
      return res.status(403).json({ success: false, message: 'You do not have shop owner privileges' });
    }

    // Check if the shop is approved and active
    if (!shopOwner.isApproved) {
      return res.status(403).json({ success: false, message: 'Your shop is pending approval' });
    }

    if (!shopOwner.isActive) {
      return res.status(403).json({ success: false, message: 'Your shop is inactive' });
    }

    // Check if the shop subscription is still valid
    if (shopOwner.subscriptionEndDate && new Date(shopOwner.subscriptionEndDate) < new Date()) {
      return res.status(403).json({ success: false, message: 'Your subscription has expired' });
    }

    // Attach the shop owner object to the request for later use in the controller
    req.user = { userId };
    req.shopOwner = shopOwner;  // Attach full shop owner object to the request
    req.shopOwnerId = shopOwner._id;  // Add the shop owner ID for easy reference

    next();  // Proceed to the next middleware or controller action
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Token invalid or expired',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Token verification failed'
    });
  }
};

export default shopOwnerAuth;
