const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    token: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['verification', 'passwordReset', 'refresh'],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: function() {
            switch (this.type) {
                case 'verification':
                    return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
                case 'passwordReset':
                    return new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
                case 'refresh':
                    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
                default:
                    return new Date(Date.now() + 24 * 60 * 60 * 1000);
            }
        }
    },
    used: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create index for automatic cleanup of expired tokens
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create compound index for userId and type
tokenSchema.index({ userId: 1, type: 1 });

// Create index for token field for faster lookups
tokenSchema.index({ token: 1 });

// Method to check if token is valid
tokenSchema.methods.isValid = function() {
    return !this.used && this.expiresAt > new Date();
};

// Static method to find valid token
tokenSchema.statics.findValidToken = async function(token, type) {
    const tokenDoc = await this.findOne({ 
        token, 
        type,
        used: false,
        expiresAt: { $gt: new Date() }
    });
    
    return tokenDoc;
};

// Static method to invalidate all tokens for a user of specific type
tokenSchema.statics.invalidateUserTokens = async function(userId, type) {
    await this.updateMany(
        { userId, type, used: false },
        { used: true }
    );
};

module.exports = mongoose.model('Token', tokenSchema);