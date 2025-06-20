const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// Login routes
router.get('/login', authController.loginPage);
router.post('/login', authController.loginPost);

// Register routes
router.get('/register', authController.registerPage);
router.post('/register', authController.registerPost);

// Forgot password routes
router.get('/forgot-password', authController.forgotPasswordPage);
router.post('/forgot-password', authController.forgotPasswordPost);

// Reset password routes
router.get('/reset-password', authController.resetPasswordPage);
router.post('/reset-password', authController.resetPasswordPost);

// Logout
router.get('/logout', authController.logout);

module.exports = router;