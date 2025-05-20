// File: controllers/LocalServices/serviceController.js
import { ServicePost } from '../../models/LocalServices/ServicePost.js';
import { ServiceType } from '../../models/LocalServices/ServiceType.js';
import  User  from '../../models/User.js'; // assuming your user model is named this

// Helper to update provider’s average rating
const updateProviderAverageRating = async (providerId) => {
  const posts = await ServicePost.find({ provider: providerId, ratings: { $not: { $size: 0 } } });

  const allRatings = posts.flatMap(p => p.ratings.map(r => r.value));
  const avgRating = allRatings.length
    ? allRatings.reduce((sum, val) => sum + val, 0) / allRatings.length
    : 0;

  await User.findByIdAndUpdate(providerId, { averageRating: avgRating });
};

// CREATE
export const createService = async (req, res) => {
  try {
    const { title, category, phoneNumber } = req.body;

    let serviceType = await ServiceType.findOne({ name: category });
    if (!serviceType) serviceType = await ServiceType.create({ name: category });

    const post = await ServicePost.create({
      title,
      phoneNumber,
      serviceType: serviceType._id,
      provider: req.user.userId,
      approved: false
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SEARCH
export const searchServices = async (req, res) => {
  const { q } = req.query;
  try {
    const results = await ServicePost.find({
      $text: { $search: q },
      approved: true
    }).populate('serviceType provider');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// EXPLORE
export const exploreServices = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  try {
    const posts = await ServicePost.find({ approved: true })
      .populate('serviceType provider')
      .skip(skip).limit(limit).sort({ createdAt: -1 });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET MINE
export const getMyServices = async (req, res) => {
  try {
    const posts = await ServicePost.find({ provider: req.user.userId })
      .populate('serviceType');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// RATE SERVICE
export const rateService = async (req, res) => {
  try {
    const { value } = req.body;
    const post = await ServicePost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Service not found' });

    const alreadyRated = post.ratings.find(r => r.user.toString() === req.user.userId);
    if (alreadyRated) return res.status(400).json({ error: 'You already rated this service' });

    post.ratings.push({ user: req.user.userId, value });
    await post.save();

    // Update provider average
    await updateProviderAverageRating(post.provider);

    // Build rating breakdown
    const breakdown = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    };

    post.ratings.forEach(r => {
      breakdown[r.value] += 1;
    });

    res.json({
      success: true,
      averageRating: post.averageRating,
      breakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET PENDING
export const getPending = async (req, res) => {
  const posts = await ServicePost.find({ approved: false }).populate('serviceType provider');
  res.json(posts);
};

// APPROVE
export const approveService = async (req, res) => {
  const post = await ServicePost.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  res.json(post);
};

// REJECT
export const rejectService = async (req, res) => {
  await ServicePost.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};
