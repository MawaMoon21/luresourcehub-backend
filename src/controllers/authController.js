const User = require('../models/User');
const { registerValidation, loginValidation } = require('../utils/validation');
const generateToken = require('../utils/generateToken');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    console.log(req.body)
    try {
        // Validate request body
        const { error } = registerValidation(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        // Check if user already exists
        const userExists = await User.findOne({ email: req.body.email });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Prepare user data
        const userData = {
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            role: req.body.role,
            department: req.body.department
        };

        // Add semester only for students
        if (req.body.role === 'student') {
            if (!req.body.semester) {
                return res.status(400).json({
                    success: false,
                    message: 'Semester is required for students'
                });
            }
            userData.semester = req.body.semester;
        } else {
            // Ensure semester is not sent for faculty/admin
            userData.semester = undefined;
        }

        // Create user
        const user = await User.create(userData);

        // Update last login
        await user.updateLastLogin();

        // Generate token
        const token = generateToken(user._id, user.role);

        // Prepare response
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            isVerified: user.isVerified,
            createdAt: user.createdAt
        };

        // Add role-specific fields
        if (user.role === 'student') {
            userResponse.semester = user.semester;
            userResponse.studentId = user.studentId;
        } else if (user.role === 'faculty') {
            userResponse.facultyId = user.facultyId;
        }

        // Return response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: userResponse
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        // Validate request body
        const { error } = loginValidation(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const { email, password } = req.body;

        // Check if user exists with password
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact administrator.'
            });
        }

        // Check password
        const isPasswordMatch = await user.matchPassword(password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        await user.updateLastLogin();
        await user.save();

        // Generate token
        const token = generateToken(user._id, user.role);

        // Prepare response
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        };

        // Add role-specific fields
        if (user.role === 'student') {
            userResponse.semester = user.semester;
            userResponse.studentId = user.studentId;
        } else if (user.role === 'faculty') {
            userResponse.facultyId = user.facultyId;
        }

        // Return response
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: userResponse
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prepare response
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        };

        // Add role-specific fields
        if (user.role === 'student') {
            userResponse.semester = user.semester;
            userResponse.studentId = user.studentId;
        } else if (user.role === 'faculty') {
            userResponse.facultyId = user.facultyId;
        }

        res.status(200).json({
            success: true,
            user: userResponse
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
    try {
        // For JWT, we just need to clear token on client side
        // But we can update last activity if needed
        const user = await User.findById(req.user.id);
        if (user) {
            user.lastLogin = Date.now();
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, department, semester, phoneNumber } = req.body;
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update fields if provided
        if (name) user.name = name;
        if (department) user.department = department;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        
        // Only update semester for students
        if (semester !== undefined && user.role === 'student') {
            user.semester = semester;
        }

        await user.save();

        // Prepare response
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            phoneNumber: user.phoneNumber,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        };

        // Add role-specific fields
        if (user.role === 'student') {
            userResponse.semester = user.semester;
            userResponse.studentId = user.studentId;
        } else if (user.role === 'faculty') {
            userResponse.facultyId = user.facultyId;
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: userResponse
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check current password
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};