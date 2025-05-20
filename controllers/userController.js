// controllers/userController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import User from '../models/User.js';

// Fetch all users
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'username email _id role');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users', error: error.message });
    }
};

// Register user
export const registerUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const { username, email, password, role } = req.body;

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const userRole = role === 'writer' ? 'writer' : 'user';
        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = new User({ username, email, password: hashedPassword, role: userRole });
        await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            userId: newUser._id,
            role: userRole,
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
};

// Login user
export const loginUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const { emailOrUsername, password } = req.body;
        const isEmail = emailOrUsername.includes('@');
        const query = isEmail ? { email: emailOrUsername } : { username: emailOrUsername };

        const user = await User.findOne(query);
        if (!user) return res.status(400).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const jwtSecret = process.env.JWT_SECRET || 'fallbackSecret';
        const token = jwt.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: '1d' });

        // ✅ Include more user info in the response (especially username)
        res.status(200).json({
            token,
            userId: user._id,
            role: user.role,
            username: user.username,     // ✅ send this to frontend
            email: user.email,           // (optional)
            expiresIn: 86400
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};

