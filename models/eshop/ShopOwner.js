import mongoose from 'mongoose';
import slugify from 'slugify';

// Utility function to generate unique slugs
async function generateUniqueSlug(Model, originalSlug, field = 'slug') {
  let slug = slugify(originalSlug, { lower: true, strict: true });
  let uniqueSlug = slug;
  let count = 1;

  while (await Model.findOne({ [field]: uniqueSlug })) {
    uniqueSlug = `${slug}-${count}`;
    count++;
  }

  return uniqueSlug;
}

const shopOwnerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference the User model
    required: true
  },
  shopName: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',  // Reference the Category model
    required: true
  },
  description: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  logo: {
    type: String,
    default: 'default-shop.png'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate slug
shopOwnerSchema.pre('save', async function(next) {
  if (this.isModified('shopName') || !this.slug) {
    this.slug = await generateUniqueSlug(this.constructor, this.shopName);
  }
  next();
});

const ShopOwner = mongoose.model('ShopOwner', shopOwnerSchema);

export default ShopOwner;