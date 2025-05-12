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

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: '', // Font Awesome or other icon class
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Pre-save middleware to generate slug
categorySchema.pre('save', async function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = await generateUniqueSlug(this.constructor, this.name);
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

export default Category;