import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import pkg from 'cloudinary';
const { v2: cloudinary } = pkg;
import Post from '../models/Post.js';

const router = express.Router();

// Cloudinary storage setup (same as previous implementation)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'blog/posts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type! Please upload an image.'), false);
    }
  },
});

// PUBLIC ROUTES
// Get all posts with pagination and filtering
// Get all posts with pagination and filtering
router.get('/', async (req, res) => {
  try {
    // Filtering options
    const filters = {};
    if (req.query.category) filters.category = req.query.category;
    if (req.query.author) filters.author = req.query.author;

    // Sorting options
    const sortOptions = { date: -1 }; // Default: newest first
    if (req.query.sortBy === 'popular') {
      sortOptions.viewCount = -1;
    }

    // Fetch all posts with filtering and populated author details
    const posts = await Post.find(filters)
      .sort(sortOptions)
      .populate('author', 'username') // Populate author's username
      .select('-content'); // Exclude full content for list view

    res.status(200).json({
      posts,
      totalPosts: posts.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts', error: error.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    const posts = await Post.find({})
      .sort({ date: -1 })
      .populate('author', 'username')
      .select('-content');

    res.status(200).json({
      posts,
      totalPosts: posts.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts', error: error.message });
  }
});

// Get single post with related posts
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;  

    const mainPost = await Post.findById(postId)
      .populate({
        path: 'author',
        select: 'username' // Populate only the 'username' field of the author
      })
      .populate({
        path: 'comments.user',
        select: 'username profilePicture' // Populate username for comments as well
      });

    if (!mainPost) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const relatedPosts = await Post.find({
      category: mainPost.category,
      _id: { $ne: postId },
    })
    .limit(4)
    .select('-content');

    res.status(200).json({
      post: mainPost,
      relatedPosts: relatedPosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching post', error: error.message });
  }
});

// New endpoint: Like a post
// Modify the like endpoint to be more robust
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const { liked } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (liked) {
      // Use Set to ensure unique likes
      if (!post.likes.some(id => id.toString() === userId)) {
        post.likes.push(userId);
      }
    } else {
      // Remove the specific user's like
      post.likes = post.likes.filter(id => id.toString() !== userId);
    }

    await post.save();

    res.status(200).json({
      likeCount: post.likes.length,
      liked: post.likes.some(id => id.toString() === userId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling like', error: error.message });
  }
});
// In your backend routes (e.g., postsRoutes.js or commentsRoutes.js)
router.get('/posts/:postId/comments', verifyToken, async (req, res) => {
  try {
    const postId = req.params.postId;
    
    // Find comments for the specific post and populate user details if needed
    const comments = await Comment.find({ post: postId })
      .sort({ createdAt: -1 }) // Sort by most recent first
      .populate('user', 'username'); // Optional: populate user details
    
    res.json({ comments }); 
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});
// Update comment endpoint to populate user details
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text cannot be empty' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = { 
      text,
      user: req.user.id,
      date: new Date(),
    };

    post.comments.push(comment);

    await post.save();

    // Populate user information for the newly added comments
    const populatedPost = await Post.findById(postId)
      .populate({
        path: 'comments.user',
        select: 'username profilePicture' // Select specific fields to populate
      });

    // Return only the comments with populated user info
    res.status(200).json(populatedPost.comments);
  } catch (error) {
    res.status(500).json({ message: 'Error adding comment', error: error.message });
  }
});

// Update single post route to populate comments
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;

    const mainPost = await Post.findById(postId)
      .populate({
        path: 'comments.user',
        select: 'username profilePicture'
      })
      .populate('author', 'name');

    if (!mainPost) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const relatedPosts = await Post.find({
      category: mainPost.category,
      _id: { $ne: postId },
    })
    .limit(4)
    .select('-content');

    res.status(200).json({
      post: mainPost,
      relatedPosts: relatedPosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching post', error: error.message });
  }
});
// Route to delete a comment
router.delete('/:postId/comment/:commentId', verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const commentIndex = post.comments.findIndex((comment) => comment._id.toString() === commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if the user is an writter(admin) or the owner of the comment
    const isAdmin = req.user.role === 'writer'; // Assume `role` is stored in the token
    const isOwner = post.comments[commentIndex].user.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    } 

    // Remove the comment
    post.comments.splice(commentIndex, 1);  
    await post.save();

    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting comment', error: error.message });
  }
});

// PROTECTED ROUTES (for writers/authenticated users)
// Create a new post
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
  console.log('Request Body:', req.body);  // Check if the body is being sent correctly
  console.log('Uploaded File:', req.file); // Check if the file is uploaded properly

  try {
    const { title, category, content, readTime } = req.body;
    const image = req.file ? req.file.path : null;

    // Parse content from JSON string
    let parsedContent = [];
    if (content) {
      try {
        parsedContent = JSON.parse(content);
      } catch (error) {
        return res.status(400).json({ message: 'Invalid content format' });
      }
    }

    console.log('Parsed Content:', parsedContent); // Debug content parsing

    // Create a new post
    const newPost = new Post({
      title,
      category,
      content: parsedContent,
      author: req.user.id, // Use the authenticated user's ID as the author
      readTime,
      image,
      date: new Date(),
    });

    // Save the post
    await newPost.save();

    // Debugging: Check if the post has been saved with the correct author ID
    console.log('New Post Saved:', newPost);

    // Populate the author field with the name before responding
    const populatedPost = await Post.findById(newPost._id)
      .populate('author', 'name');  // Populate only the 'name' field of the author

    // Debugging: Check if population worked
    console.log('Populated Post:', populatedPost);

    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error creating post', error: error.message });
  }
});

// Update an existing post
router.patch('/:id', verifyToken, upload.single('image'), async (req, res) => {   
  try {
    const { id } = req.params;
    const { title, category, content, readTime } = req.body;
    const image = req.file ? req.file.path : null;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });  
    }

    // Check if the authenticated user is the author
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to update this post' });
    }

    let parsedContent = [];
    if (content) {
      try {
        parsedContent = JSON.parse(content);
      } catch (error) {
        return res.status(400).json({ message: 'Invalid content format' });
      }
    }

    // Update fields
    post.title = title || post.title;
    post.category = category || post.category;
    post.content = parsedContent.length > 0 ? parsedContent : post.content;
    post.readTime = readTime || post.readTime;
    if (image) post.image = image;

    const updatedPost = await post.save();
    res.status(200).json(updatedPost);
  } catch (error) {
    res.status(500).json({ message: 'Error updating post', error: error.message });
  }
});

// Delete a post
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if the authenticated user is the author
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to delete this post' });
    }

    await Post.findByIdAndDelete(id);
    res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting post', error: error.message });
  }
});

// Middleware to authenticate and extract user info from token
const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, 'your_secret_key', (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.user = decoded; // Attach decoded user info to the request
    next();
  });
};

// Fetch posts for the logged-in user
router.get('/posts', authenticate, async (req, res) => {
  try {
    // Fetch posts that belong to the logged-in user
    const posts = await Post.find({ userId: req.user.id }); // Assuming the user ID is stored in the token
    res.json({ posts, userId: req.user.id });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

export default router;