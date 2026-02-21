const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a title'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Please provide a description']
    },
    department: {
        type: String,
        required: true,
        enum: ['CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY']
    },
    course: {
        type: String,
        required: true
    },
    semester: {
        type: Number,
        min: 1,
        max: 12
    },
    type: {
        type: String,
        enum: ['Notes', 'Question Paper', 'Assignment', 'Project Report', 'Thesis', 'Presentation', 'Lab Manual', 'Reference Book'],
        required: true
    },
    tags: [String],
    author: String,
    files: [{
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        mimeType: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedByName: String,
    uploadedByRole: String,
    downloads: {
        type: Number,
        default: 0
    },
    views: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    },
    verified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for search
resourceSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Resource', resourceSchema);