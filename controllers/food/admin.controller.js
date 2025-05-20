import mongoose from 'mongoose';
// Approve vendor and set subscription end date
import Vendor from '../../models/food/Vendor.js';
import User from '../../models/User.js'; // ✅ Needed to update the user role

export const approveVendor = async (req, res) => {
  const { id } = req.params;
  const { subscriptionEndDate } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid vendor ID format' });
  }

  try {
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Use a transaction for the approval process
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // ✅ Update vendor info
      vendor.isApproved = true;
      vendor.isActive = true;
      vendor.subscriptionEndDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;

      await vendor.save({ session });

      // ✅ Update user's role to vendor
      const user = await User.findById(vendor.user);
      if (!user) {
        throw new Error(`User not found for vendor ID: ${id}, user ID: ${vendor.user}`);
      }
      
      if (user.role !== 'vendor') {
        user.role = 'vendor';
        await user.save({ session });
      }
      
      await session.commitTransaction();
      session.endSession();

      console.log(`Vendor ${id} approved successfully for user ${vendor.user}`);
      
      res.status(200).json({ 
        message: 'Vendor approved successfully', 
        vendor 
      });
    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
  } catch (error) {
    console.error('Error approving vendor:', error);
    res.status(500).json({ 
      message: 'Server error during vendor approval',
      error: error.message 
    });
  }
};

// Admin: Update vendor status
export const updateVendorStatus = async (req, res) => {
  const vendorId = req.params.id;
  const { isApproved, isActive, subscriptionEndDate } = req.body;
   
  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    return res.status(400).json({ message: 'Invalid vendor ID format' });
  }
  
  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    
    const wasApproved = vendor.isApproved; // Store previous state
    
    // Update vendor fields if provided
    if (isApproved !== undefined) vendor.isApproved = isApproved;
    if (isActive !== undefined) vendor.isActive = isActive;
    
    // Add this condition to update subscription date
    if (subscriptionEndDate) {
      vendor.subscriptionEndDate = new Date(subscriptionEndDate);
    }
    
    // Use transaction for role updates
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      await vendor.save({ session });
      
      // If vendor is being approved for the first time
      if (isApproved === true && !wasApproved) {
        const user = await User.findById(vendor.user);
        if (!user) {
          throw new Error(`User not found for vendor ID: ${vendorId}, user ID: ${vendor.user}`);
        }
        
        if (user.role !== 'vendor') {
          user.role = 'vendor';
          await user.save({ session });
        }
      }
      
      await session.commitTransaction();
      session.endSession();
      
      console.log(`Vendor ${vendorId} status updated. Approved: ${vendor.isApproved}, Active: ${vendor.isActive}`);
      
      res.status(200).json({
        message: 'Vendor status updated',
        vendor
      });
    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
  } catch (error) {
    console.error('Error updating vendor status:', error);
    res.status(500).json({ 
      message: 'Server error updating vendor status',
      error: error.message 
    });
  }
};

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