import { cloudinary } from '../../config/cloudinaryConfig.js';
import Listing from '../../models/food/Listing.js';
import Vendor from '../../models/food/Vendor.js'; // Ensure Vendor model is imported

// Helper function for Cloudinary uploads
const uploadImage = async (imageFile) => {
  try {
    const result = await cloudinary.uploader.upload(imageFile.tempFilePath);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Image upload failed');
  }
};

// Helper function for Cloudinary deletions
const deleteImage = async (imageUrl) => {
  try {
    const publicId = imageUrl.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
};

// 1. CREATE
export const createListing = async (req, res) => {
  const { name, price, description, category } = req.body;
  const vendorId = req.vendorId; // Use req.vendorId here

  console.log('Received body:', req.body);
  console.log('Received files:', req.files);

  // Validate required fields
  if (!name || !price || !description || !category) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields',
      errors: {
        name: !name ? 'Name is required' : undefined,
        price: !price ? 'Price is required' : undefined,
        description: !description ? 'Description is required' : undefined,
        category: !category ? 'Category is required' : undefined,
      }
    });
  }

  // Validate image
  if (!req.files || !req.files.image) {
    return res.status(400).json({
      success: false,
      message: 'Image is required'
    });
  }

  try {
    // Check if the vendor is approved
    const vendor = await Vendor.findById(vendorId);
    console.log('Vendor:', vendor);

    if (!vendor || !vendor.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'You are not an approved vendor. Listing creation is not allowed.'
      });
    }

    // Proceed with image upload
    const imageURL = await uploadImage(req.files.image); // Ensure uploadImage function works correctly
    
    // Create new listing
    const listing = new Listing({
      name,
      price: Number(price),
      description,
      category,
      imageURL,
      vendorId,
      isActive: true // Default to active
    });

    // Save the listing
    await listing.save();

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      listing
    });
  } catch (err) {
    console.error('Create listing error:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating listing',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};
  
// 2. DELETE
export const deleteListing = async (req, res) => {
  const { id } = req.params;
  const vendorId = req.vendor.id;
  
  try {
    const listing = await Listing.findOne({ _id: id, vendorId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Listing not found or you do not have permission to delete it' 
      });
    }
    
    // Delete image from Cloudinary if it exists
    if (listing.imageURL) {
      await deleteImage(listing.imageURL);
    }
    
    await Listing.deleteOne({ _id: id, vendorId });
    
    res.status(200).json({ 
      success: true, 
      message: 'Listing deleted successfully' 
    });
  } catch (err) {
    console.error('Delete listing error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting listing',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};

// 3. UPDATE
export const updateListing = async (req, res) => {
  const { id } = req.params;
  const { name, price, description, category, isActive } = req.body;
  const vendorId = req.vendor.id;
  
  try {
    const listing = await Listing.findOne({ _id: id, vendorId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Listing not found or you do not have permission to update it' 
      });
    }
    
    // Update fields if provided
    if (name !== undefined) listing.name = name;
    if (price !== undefined) listing.price = Number(price);
    if (description !== undefined) listing.description = description;
    if (category !== undefined) listing.category = category;
    if (isActive !== undefined) listing.isActive = Boolean(isActive);
    
    // Handle image update if provided
    if (req.files && req.files.image) {
      // Delete old image if it exists
      if (listing.imageURL) {
        await deleteImage(listing.imageURL);
      }
      
      // Upload new image
      listing.imageURL = await uploadImage(req.files.image);
    }
    
    // Save updated listing
    await listing.save();
    
    res.status(200).json({ 
      success: true, 
      message: 'Listing updated successfully',
      listing 
    });
  } catch (err) {
    console.error('Update listing error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating listing',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};

// 4. GET VENDOR LISTINGS with pagination, sorting, and filtering
export const getVendorListings = async (req, res) => {
  const vendorId = req.vendor.id;
  const { page = 1, limit = 10, category, sortBy = 'createdAt', sortOrder = 'desc', isActive } = req.query;
  
  // Build filter object
  const filter = { vendorId };
  
  // Add optional filters
  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  
  try {
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await Listing.countDocuments(filter);
    
    // Get listings with pagination and sorting
    const listings = await Listing.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      listings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get vendor listings error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching listings',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};

// 5. GET SINGLE LISTING
export const getListing = async (req, res) => {
  const { id } = req.params;
  const vendorId = req.vendor.id;
  
  try {
    const listing = await Listing.findOne({ _id: id, vendorId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Listing not found' 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      listing 
    });
  } catch (err) {
    console.error('Get listing error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching listing',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};

// 6. TOGGLE LISTING ACTIVE STATUS
export const toggleListingStatus = async (req, res) => {
  const { id } = req.params;
  const vendorId = req.vendor.id;
  
  try {
    const listing = await Listing.findOne({ _id: id, vendorId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Listing not found' 
      });
    }
    
    // Toggle the active status
    listing.isActive = !listing.isActive;
    await listing.save();
    
    res.status(200).json({ 
      success: true, 
      message: `Listing ${listing.isActive ? 'activated' : 'deactivated'} successfully`,
      listing 
    });
  } catch (err) {
    console.error('Toggle listing status error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling listing status',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
};