const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        minlength: [3, 'Name must be at least 3 characters'],
        maxlength: [50, 'Name cannot be more than 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['student', 'faculty', 'admin', 'super_admin'],
        default: 'student'
    },
    department: {
        type: String,
        required: [true, 'Please specify your department'],
        enum: ['CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY']
    },
    semester: {
        type: Number,
        min: 1,
        max: 12,
        required: function() {
            return this.role === 'student';
        }
    },
    studentId: {
        type: String,
        unique: true,
        sparse: true
    },
    facultyId: {
        type: String,
        unique: true,
        sparse: true
    },
    profileImage: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        maxlength: 500,
        default: ''
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
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

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Generate student/faculty ID
userSchema.pre('save', function(next) {
    if (this.isNew) {
        const year = new Date().getFullYear().toString().slice(-2);
        if (this.role === 'student') {
            const random = Math.floor(1000 + Math.random() * 9000);
            this.studentId = `STU${year}${random}`;
        } else if (this.role === 'faculty') {
            const random = Math.floor(100 + Math.random() * 900);
            this.facultyId = `FAC${random}`;
        }
    }
    next();
});

// Compare password
userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);