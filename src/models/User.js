const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    // Personal Information
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        minlength: [3, 'Name must be at least 3 characters'],
        maxlength: [50, 'Name cannot be more than 50 characters']
    },
    
    // Contact Information
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ],
        index: true
    },
    
    // Security
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    
    // Role and Authorization
    role: {
        type: String,
        enum: {
            values: ['student', 'faculty', 'admin'],
            message: 'Role must be either student, faculty, or admin'
        },
        default: 'student',
        required: true
    },
    
    // Academic Information
    department: {
        type: String,
        required: [true, 'Please specify your department'],
        enum: {
            values: ['CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY'],
            message: 'Please select a valid department'
        },
        index: true
    },
    
    semester: {
        type: Number,
        min: [1, 'Semester must be at least 1'],
        max: [12, 'Semester cannot exceed 12'],
        required: function() {
            return this.role === 'student';
        },
        validate: {
            validator: function(value) {
                // Faculty shouldn't have semester
                if (this.role === 'faculty' && value) {
                    return false;
                }
                // Students must have semester
                if (this.role === 'student' && !value) {
                    return false;
                }
                return true;
            },
            message: 'Semester is required only for students'
        }
    },
    
    // University IDs
    studentId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    
    facultyId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    
    // Account Status
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Verification and Security Tokens
    verificationToken: String,
    verificationTokenExpires: Date,
    
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    
    // Profile Information
    profileImage: {
        type: String,
        default: ''
    },
    phoneNumber: {
        type: String,
        match: [/^\d{11}$/, 'Please provide a valid 11-digit phone number'],
        default: ''
    },
    
    // Academic Stats
    totalUploads: {
        type: Number,
        default: 0
    },
    totalDownloads: {
        type: Number,
        default: 0
    },
    forumPosts: {
        type: Number,
        default: 0
    },
    
    // Last Activity
    lastLogin: {
        type: Date,
        default: Date.now
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ======================
// MIDDLEWARE (HOOKS)
// ======================

// Update timestamp before saving
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Encrypt password using bcrypt before saving
userSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return next();
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Generate student or faculty ID based on role before saving
userSchema.pre('save', function(next) {
    if (this.isNew) {
        if (this.role === 'student' && !this.studentId) {
            const year = new Date().getFullYear().toString().slice(-2);
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            this.studentId = `STU${year}${randomNum}`;
        } else if (this.role === 'faculty' && !this.facultyId) {
            const randomNum = Math.floor(100 + Math.random() * 900);
            this.facultyId = `FAC${randomNum}`;
        }
    }
    next();
});

// ======================
// INSTANCE METHODS
// ======================

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        throw new Error('Error comparing passwords');
    }
};

// Generate email verification token
userSchema.methods.generateVerificationToken = function() {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    this.verificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');
    
    this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
    
    return verificationToken;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    
    return resetToken;
};

// Verify email
userSchema.methods.verifyEmail = function() {
    this.isVerified = true;
    this.verificationToken = undefined;
    this.verificationTokenExpires = undefined;
    
    return this;
};

// Clear password reset token
userSchema.methods.clearPasswordResetToken = function() {
    this.resetPasswordToken = undefined;
    this.resetPasswordExpire = undefined;
    
    return this;
};

// Update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = Date.now();
    
    return this;
};

// ======================
// STATIC METHODS
// ======================

// Find user by email (case-insensitive)
userSchema.statics.findByEmail = async function(email) {
    return await this.findOne({ email: email.toLowerCase() });
};

// Find active users only
userSchema.statics.findActiveUsers = async function(query = {}) {
    return await this.find({
        ...query,
        isActive: true
    });
};

// Check if email exists
userSchema.statics.emailExists = async function(email) {
    const user = await this.findOne({ email: email.toLowerCase() });
    return !!user;
};

// ======================
// INDEXES
// ======================

// Compound indexes for better query performance
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ department: 1, semester: 1 });
userSchema.index({ studentId: 1 }, { sparse: true });
userSchema.index({ facultyId: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);