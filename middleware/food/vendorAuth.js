import Vendor from '../../models/food/Vendor.js';
import jwt from 'jsonwebtoken';

// Middleware to check if a user has vendor privileges
export const vendorAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Check if user has vendor privileges
    const vendor = await Vendor.findOne({ user: userId });
    if (!vendor) {
      return res.status(403).json({ success: false, message: 'You do not have vendor privileges' });
    }

    // Check if vendor is approved and active
    if (!vendor.isApproved) {
      return res.status(403).json({ success: false, message: 'Your vendor account is pending approval' });
    }

    if (!vendor.isActive) {
      return res.status(403).json({ success: false, message: 'Your vendor account is inactive' });
    }

    // Attach the vendor object to the request
    req.user = { userId };
    req.vendor = vendor; // Attach full vendor object
    req.vendorId = vendor._id; // Add this line to make it compatible with your controller

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Token invalid or expired',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Token verification failed'
    });
  }
};

export default vendorAuth;