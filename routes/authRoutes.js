import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for security
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.',
});

// ✅ Fetch All Users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username email _id role'); // Fetch only required fields
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users', error: error.message });
    }
});

// Registration Route
router.post(
    '/register',
    limiter,
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { username, email, password, role } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ $or: [{ email }, { username }] });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // Set default role
            const userRole = role === 'writer' ? 'writer' : 'user';

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Create and save the new user
            const newUser = new User({
                username,
                email,
                password: hashedPassword,
                role: userRole,
            });

            await newUser.save();

            // Respond with success
            res.status(201).json({
                message: 'User registered successfully',
                userId: newUser._id,
                role: userRole,
            });
        } catch (error) {
            console.error('Registration Error:', error);
            res.status(500).json({
                message: 'Registration failed',
                error: error.message,
            });
        }
    }
); 

// Login Route 
router.post(
    '/login',
    limiter,
    [
        body('emailOrUsername')
            .notEmpty()
            .withMessage('Email or Username is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { emailOrUsername, password } = req.body;

            // Check if input is an email or username
            const isEmail = emailOrUsername.includes('@');
            const query = isEmail
                ? { email: emailOrUsername }
                : { username: emailOrUsername };

            // Find user by email or username
            const user = await User.findOne(query);
            if (!user) {
                return res.status(400).json({ message: 'User not found' });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            // Generate JWT
            const jwtSecret = process.env.JWT_SECRET || 'fallbackSecret';
            const token = jwt.sign(
                { id: user._id, role: user.role },
                jwtSecret,
                { expiresIn: '1h' }
            );

            // Respond with token and role
            res.status(200).json({
                token,
                userId: user._id,
                role: user.role,
                expiresIn: 3600, // Token expiry in seconds
            });
        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({
                message: 'Login failed',
                error: error.message,
            });
        }
    }
);

export default router;
