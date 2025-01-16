import jwt from 'jsonwebtoken';

const adminAuth = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET); // Extract token after "Bearer"
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Not an admin' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export default adminAuth;
