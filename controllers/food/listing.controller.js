// /backend/controllers/food/listingController.js
import { cloudinary } from '../../config/cloudinaryConfig.js'; // Your exact config import
import Listing from '../../models/food/Listing.js';

// 1. CREATE 
export const createListing = async (req, res) => {
  const { name, price, description, category } = req.body;
  const { image } = req.files;
  const vendorId = req.vendor.id;

  try {
    // Your original upload logic
    const result = await cloudinary.uploader.upload(image.tempFilePath);

    const listing = new Listing({
      name,
      price,
      description,
      category,
      imageURL: result.secure_url, // Your original field name
      vendorId
    });

    await listing.save();
    res.status(201).json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating listing' });
  }
};

// 2. DELETE 
export const deleteListing = async (req, res) => {
  const { id } = req.params;
  const vendorId = req.vendor.id;

  try {
    const listing = await Listing.findOne({ _id: id, vendorId });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    /* Optional but recommended cleanup */
    if (listing.imageURL) {
      try {
        const publicId = listing.imageURL.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryErr) {
        console.log('(Non-critical) Failed to delete Cloudinary image:', cloudinaryErr.message);
      }
    }

    await Listing.deleteOne({ _id: id, vendorId });
    res.status(200).json({ success: true, message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting listing' });
  }
};

// 3. UPDATE
export const updateListing = async (req, res) => {
  const { id } = req.params;
  const { name, price, description, category } = req.body;
  const vendorId = req.vendor.id;

  try {
    const listing = await Listing.findOne({ _id: id, vendorId });

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Your original field updates
    listing.name = name || listing.name;
    listing.price = price || listing.price;
    listing.description = description || listing.description;
    listing.category = category || listing.category;

    // Your original image update logic
    if (req.files?.image) {
      const result = await cloudinary.uploader.upload(req.files.image.tempFilePath);
      listing.imageURL = result.secure_url;
    }

    await listing.save();
    res.status(200).json({ success: true, listing });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating listing' });
  }
};

// 4. GET 
export const getVendorListings = async (req, res) => {
  const vendorId = req.vendor.id;

  try {
    const listings = await Listing.find({ vendorId });
    res.status(200).json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching listings' });
  }
};