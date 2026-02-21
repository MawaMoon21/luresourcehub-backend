const mongoose = require('mongoose');

const forumPostSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorName: String,
    authorRole: String,
    category: {
        type: String,
        enum: ['general', 'cse', 'eee', 'bba', 'law', 'exam', 'project', 'career'],
        required: true
    },
    tags: [String],
    views: {
        type: Number,
        default: 0
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    likeCount: {
        type: Number,
        default: 0
    },
    replies: [{
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        authorName: String,
        authorRole: String,
        content: String,
        likes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: Date
    }],
    replyCount: {
        type: Number,
        default: 0
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    isAnswered: {
        type: Boolean,
        default: false
    },
    isSolved: {
        type: Boolean,
        default: false
    },
    acceptedReply: {
        type: mongoose.Schema.Types.ObjectId
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

module.exports = mongoose.model('ForumPost', forumPostSchema);