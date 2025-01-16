import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];  // Extract token from Authorization header
  console.log('Received Token:', token);  // Log the token for debugging

  if (!token) {
    console.log('No token provided');  // Log if no token is provided
    return res.status(401).json({ message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);  // Verify the token
    console.log('Decoded Token:', decoded);  // Log the decoded token for debugging

    req.user = decoded;  // Attach the decoded user to the request object
    next();  // Proceed to the next middleware/route handler
  } catch (error) {
    console.log('Token verification failed:', error);  // Log errors for debugging
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};

export default verifyToken;  // Default export as verifyToken
