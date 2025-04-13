import express from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';

import {
    getAllUsers,
    registerUser,
    loginUser
} from '../controllers/userController.js';

const router = express.Router();

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.',
});

// @route   GET /users
router.get('/users', getAllUsers);

// @route   POST /register
router.post(
    '/register',
    limiter,
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    registerUser
);

// @route   POST /login
router.post(
    '/login',
    limiter,
    [
        body('emailOrUsername').notEmpty().withMessage('Email or Username is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    loginUser
);

export default router;
