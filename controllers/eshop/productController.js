// controllers/eshop/productController.js
import { cloudinary } from '../../config/cloudinaryConfig.js'; 
import Product from '../../models/eshop/Product.js'; 
import ShopOwner from '../../models/eshop/ShopOwner.js'; 


// Helper function to upload image to Cloudinary
const uploadImage = async (imageFile) => {
  try {
    const result = await cloudinary.uploader.upload(imageFile.tempFilePath);
    return result.secure_url; // Returning the Cloudinary URL of the uploaded image
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Image upload failed');
  }
};

// Create a new product (shop owner only)
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, category } = req.body;
    
    // Update this line to use the userId from shopOwnerAuth middleware
    // or use shopOwnerId directly since we know the shop exists
    const userId = req.shopOwner.user; // This should contain the user ID from your ShopOwner model
    
    // Since we already have the shopOwner object from the middleware, 
    // we can skip the shop lookup
    const shop = req.shopOwner;

    // Validate required product fields
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!description) errors.description = 'Description is required';
    if (price == null) errors.price = 'Price is required';
    if (!category) errors.category = 'Category is required';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors
      });
    }

    // Check image file
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'Product image is required'
      });
    }

    // Upload to Cloudinary
    const imageURL = await uploadImage(req.files.image);

    // Create and save product
    const product = new Product({
      name,
      description,
      price: parseFloat(price),
      category,
      shop: shop._id,
      image: imageURL
    });

    await product.save();

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Error creating product:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};


// Get all products from a shop
export const getShopProducts = async (req, res) => {
  try {
    const { shopId } = req.params;

    // Check if shop exists, is approved and active
    const shop = await ShopOwner.findOne({
      _id: shopId,
      isApproved: true,
      isActive: true,
      subscriptionEndDate: { $gt: new Date() }
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or not available'
      });
    }

    const products = await Product.find({ shop: shopId });

    res.status(200).json({
      success: true,
      count: products.length,
      shop: {
        name: shop.shopName,
        contactNumber: shop.phoneNumber
      },
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};


// Update a product (shop owner only)
export const updateProduct = async (req, res) => {
  try {
    const { name, description, price, quantity, isAvailable } = req.body;
    
    // Find the product
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if the current user owns the shop that has this product
    const shop = await ShopOwner.findOne({ 
      _id: product.shop,
      user: req.shopOwner.user  // FIXED: Use req.shopOwner.user instead of req.user.id
    });
    
    if (!shop) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this product'
      });
    }
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    // Update product fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = price;
    if (quantity !== undefined) product.quantity = quantity;
    if (isAvailable !== undefined) product.isAvailable = isAvailable;
    if (req.file) product.image = req.file.filename;
    
    await product.save();
    
    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

// Delete a product (shop owner only)
export const deleteProduct = async (req, res) => {
  try {
    // Find the product
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if the current user owns the shop that has this product
    const shop = await ShopOwner.findOne({ 
      _id: product.shop,
      user: req.shopOwner.user 
    });
    
    if (!shop) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this product'
      });
    }
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    await Product.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

// Toggle product availability (shop owner only)
export const toggleProductAvailability = async (req, res) => {
  try {
    // Find the product
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if the current user owns the shop that has this product
    const shop = await ShopOwner.findOne({ 
      _id: product.shop,
      user: req.shopOwner.user  
    });
    
    if (!shop) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this product'
      });
    }
    
    // Check if subscription is still valid
    if (shop.subscriptionEndDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please contact admin to renew.'
      });
    }
    
    product.isAvailable = !product.isAvailable;
    await product.save();
    
    res.status(200).json({
      success: true,
      message: `Product is now ${product.isAvailable ? 'available' : 'unavailable'}`,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle product availability',
      error: error.message
    });
  }
};

// Get all products for shop owner's dashboard
export const getMyProducts = async (req, res) => {
  try {
    // Find shop belonging to the current user
    const shop = await ShopOwner.findOne({ user: req.shopOwner.user });  // Change from req.user.id
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    const products = await Product.find({ shop: shop._id });
    
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};
