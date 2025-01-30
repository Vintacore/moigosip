import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header
  console.log('Received Token:', token);

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded Token:', decoded);

    // Attach the user ID from the decoded token
    req.user = { 
      userId: decoded.id // Use `id` instead of `userId` since the token uses `id`
    };
    
    console.log('User attached to req:', req.user);
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ 
      message: 'Token invalid or expired',
      error: error.message 
    });
  }
};

export default verifyToken;