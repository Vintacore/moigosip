import { cloudinary } from '../../config/cloudinaryConfig.js';
import User from '../../models/User.js';
import { supabase } from '../../config/supabaseClient.js'; 


export const approveLinkMeUser = async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alreadyApproved = user.verificationStatus === 'approved';

    if (!alreadyApproved && user.verificationStatus !== 'pending') {
      return res.status(400).json({ message: 'User not in a valid state for approval' });
    }

    // Delete selfie from Cloudinary if exists
    const publicId = `link-me-verifications/selfie_${userId}`;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn(`Cloudinary deletion failed: ${err.message}`);
    }

    // Update MongoDB if not already approved
    if (!alreadyApproved) {
      user.isVerified = true;
      user.verificationStatus = 'approved';
      user.selfieUrl = null;
      await user.save();
    }

    // Insert into Supabase (if not already exists)
    const { data: existingProfile } = await supabase
      .from('linkme_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!existingProfile) {
      const { error } = await supabase.from('linkme_profiles').insert([
        {
          id: user._id.toString(),
          display_name: user.name || null,
          bio: null,
          gender: null,
          interested_in: null,
          dob: null,
          avatar_url: null,
          preferences: {},
          created_at: new Date()
        }
      ]);

      if (error) {
        console.error('Supabase insertion error:', error.message);
        return res.status(500).json({
          message: 'User verified, but Supabase profile creation failed',
          error: error.message
        });
      }
    }

    return res.status(200).json({
      message: alreadyApproved
        ? 'User already approved. Supabase profile ensured.'
        : 'User approved and Link-Me profile created successfully in Supabase'
    });
  } catch (err) {
    console.error('Approval error:', err);
    return res.status(500).json({ message: 'Server error during approval', error: err.message });
  }
};

export const getPendingLinkMeRequests = async (req, res) => {
  try {
    const pendingUsers = await User.find({ linkMeUser: true, verificationStatus: 'pending' })
      .select('_id name email selfieUrl createdAt');

    return res.status(200).json({ pending: pendingUsers });
  } catch (err) {
    console.error('Error fetching pending requests:', err);
    return res.status(500).json({ message: 'Failed to fetch pending requests', error: err.message });
  }
};
export const rejectLinkMeUser = async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user || user.verificationStatus !== 'pending') {
      return res.status(404).json({ message: 'User not found or already reviewed' });
    }

    // Delete selfie from Cloudinary
    const publicId = `link-me-verifications/selfie_${userId}`;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn(`Cloudinary deletion failed: ${err.message}`);
    }

    user.verificationStatus = 'rejected';
    user.selfieUrl = null;
    await user.save();

    return res.status(200).json({ message: 'User rejected successfully' });
  } catch (err) {
    console.error('Rejection error:', err);
    return res.status(500).json({ message: 'Server error during rejection', error: err.message });
  }
};
