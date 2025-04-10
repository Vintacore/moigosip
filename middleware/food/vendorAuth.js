import Vendor from '../../models/food/Vendor.js';
import jwt from 'jsonwebtoken';

// Middleware to check if a user has vendor privileges
export const vendorAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    
    // Check if user has vendor privileges
    const vendor = await Vendor.findOne({ user: userId });
    if (!vendor) {
      return res.status(403).json({ message: 'You do not have vendor privileges' });
    }
    
    // Check if vendor is approved and active
    if (!vendor.isApproved) {
      return res.status(403).json({ message: 'Your vendor account is pending approval' });
    }
    
    if (!vendor.isActive) {
      return res.status(403).json({ message: 'Your vendor account is inactive' });
    }
    
    // Add user and vendor IDs to request
    req.user = { userId };
    req.vendorId = vendor._id;
    
    next();
  } catch (error) {
    res.status(401).json({
      message: 'Token invalid or expired',
      error: error.message
    });
  }
};

export default vendorAuth;