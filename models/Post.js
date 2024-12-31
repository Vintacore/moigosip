import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true }, // The comment text
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the User model
  date: { type: Date, default: Date.now }, // Timestamp for the comment
});

const postSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to User model
  content: [
    {
      type: { type: String, required: true }, // e.g., 'paragraph', 'header', 'image', 'list'
      text: { type: String },                // For paragraphs or headers
      src: { type: String },                 // For images (Cloudinary URL)
      caption: { type: String },             // Optional: image caption
      items: { type: [String] }              // For lists  
    }
  ],
  date: { type: Date, default: Date.now },
  readTime: { type: Number },  // Now optional; will be calculated automatically
  image: { type: String, required: true },  // Cloudinary URL for the main image
  relatedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs who liked the post
  comments: [commentSchema], // Array of comment objects
  excerpt: { type: String, trim: true }, // Excerpt field
});

// Virtual for calculating read time
postSchema.virtual('calculatedReadTime').get(function () {
  const textContent = this.content
    .map(block => block.text) // Extract text from paragraphs and headers
    .filter(text => text)     // Filter out undefined or empty texts
    .join(' ');               // Join them into one large string

  const wordCount = textContent.split(/\s+/).length; // Count words
  const wordsPerMinute = 200; // Approximate reading speed
  const readTime = Math.ceil(wordCount / wordsPerMinute); // Calculate read time in minutes

  return readTime || 1; // Return at least 1 minute
});

// Virtual for generating an excerpt
postSchema.virtual('generatedExcerpt').get(function () {
  // Extract text from paragraphs and headers, filter out undefined or empty texts, and join them
  const textContent = this.content
    .map(block => block.text)
    .filter(text => text)
    .join(' ');

  // Create an excerpt by slicing the first 150 characters of the content
  const excerpt = textContent.slice(0, 150);
  return excerpt;
});

// Middleware to set the readTime field before saving
postSchema.pre('save', function (next) {
  if (!this.readTime) {
    this.readTime = this.calculatedReadTime;  // Set readTime based on the calculated value
  }

  // Automatically set the excerpt if it isn't manually provided
  if (!this.excerpt) {
    this.excerpt = this.generatedExcerpt;
  }

  next();
});

const Post = mongoose.model('Post', postSchema);

export default Post;
