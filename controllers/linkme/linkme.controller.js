import User from '../../models/User.js';
import { cloudinary } from '../../config/cloudinaryConfig.js';

// Helper for Cloudinary upload
const uploadImage = async (imageFile) => {
  try {
    const result = await cloudinary.uploader.upload(imageFile.tempFilePath, {
      folder: 'link-me-verifications',
      public_id: `selfie_${imageFile.name}_${Date.now()}`,
      overwrite: true,
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Image upload failed');
  }
};

// Upgrade user to Link-Me user with selfie
export const upgradeToLinkMeUser = async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!req.files || !req.files.selfie) {
      return res.status(400).json({ message: 'Selfie image is required' });
    }

    const selfieImage = req.files.selfie;
    const selfieUrl = await uploadImage(selfieImage);

    // Update user
    user.linkMeUser = true;
    user.isVerified = false;
    user.verificationStatus = 'pending';
    user.selfieUrl = selfieUrl;
    user.submissionDate = new Date();
    await user.save();

    return res.status(200).json({
      message: 'Link-Me upgrade request submitted successfully',
      selfieUrl: selfieUrl,
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {
    console.error('Upgrade error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
