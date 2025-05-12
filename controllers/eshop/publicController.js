import ShopOwner from '../../models/eshop/ShopOwner.js';
import Category from '../../models/eshop/Category.js';
import Product from '../../models/eshop/Product.js'; // Add this

// Get all categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({});
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
};
// Categories for drop down
export const getCategoriesDropdown = async (req, res) => {
  try {
    // Only fetch the necessary fields for the dropdown: id, name
    const categories = await Category.find({ isActive: true })
      .select('_id name')
      .sort({ name: 1 });

    res.status(200).json({ 
      success: true, 
      data: categories 
    });
  } catch (error) {
    console.error('Error fetching categories for dropdown:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories', 
      error: error.message 
    });
  }
};

// Controller to get shops by category slug
export const getShopsByCategory = async (req, res) => {
  try {
    const { categorySlug } = req.params;

    // Find category by slug instead of name
    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const shops = await ShopOwner.find({
      category: category._id,
      isApproved: true,
      isActive: true,
      subscriptionEndDate: { $gt: new Date() }
    }).populate('category', 'name slug'); // Optional: populate category details

    res.status(200).json({ success: true, data: shops });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch shops', error: error.message });
  }
};

// 🔽 Get products of a specific shop with Search, Filter, Sort, and Pagination
export const getProductsByShop = async (req, res) => {
  try {
    const { shopSlug } = req.params;
    const { search, category, sortBy, page = 1, limit = 10 } = req.query;

    // Find shop by slug first
    const shop = await ShopOwner.findOne({ slug: shopSlug });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    // Build the search query object
    let query = { shopOwner: shop._id, isActive: true };

    // Add search filter if 'search' query parameter is provided
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
      query = { ...query, $or: [{ name: searchRegex }, { description: searchRegex }] };
    }

    // Add category filter if 'category' query parameter is provided
    if (category) {
      // Assuming category is a slug, find the category first
      const categoryDoc = await Category.findOne({ slug: category });
      if (categoryDoc) {
        query = { ...query, category: categoryDoc._id };
      }
    }

    // Determine the sorting options based on the 'sortBy' query parameter
    let sortOptions = {};
    if (sortBy === 'price_asc') {
      sortOptions = { price: 1 }; // Sort by price in ascending order
    } else if (sortBy === 'price_desc') {
      sortOptions = { price: -1 }; // Sort by price in descending order
    }

    // Pagination calculations
    const skip = (page - 1) * limit;

    // Fetch products based on query, sort, and pagination
    const products = await Product.find(query)
      .sort(sortOptions) // Apply sorting if any
      .skip(skip) // Skip the appropriate number of documents based on pagination
      .limit(limit)
      .populate('category', 'name slug'); // Optional: populate category details

    // Get the total count of products for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    // Send the response with the paginated products
    res.status(200).json({
      success: true,
      data: products,
      count: products.length,
      total: totalProducts,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};
  
