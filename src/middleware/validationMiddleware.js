const { validationResult } = require('express-validator');
const { registerValidation, loginValidation } = require('../utils/validation');

// Middleware to handle validation errors
const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        const extractedErrors = [];
        errors.array().map(err => extractedErrors.push({ 
            field: err.param, 
            message: err.msg 
        }));

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: extractedErrors
        });
    };
};

// Custom validation middleware for registration
const validateRegistration = (req, res, next) => {
    const { error } = registerValidation(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

// Custom validation middleware for login
const validateLogin = (req, res, next) => {
    const { error } = loginValidation(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

// Middleware to validate ObjectId
const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];
        
        // Check if id is a valid MongoDB ObjectId
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${paramName} ID format`
            });
        }
        
        next();
    };
};

// Middleware to validate file uploads
const validateFileUpload = (allowedTypes, maxSizeInMB) => {
    return (req, res, next) => {
        if (!req.file) {
            return next();
        }

        const file = req.file;
        const maxSize = maxSizeInMB * 1024 * 1024; // Convert MB to bytes

        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
            });
        }

        // Check file size
        if (file.size > maxSize) {
            return res.status(400).json({
                success: false,
                message: `File too large. Maximum size: ${maxSizeInMB}MB`
            });
        }

        next();
    };
};

// Middleware to validate query parameters
const validateQueryParams = (requiredParams = [], optionalParams = []) => {
    return (req, res, next) => {
        const queryKeys = Object.keys(req.query);
        
        // Check required parameters
        for (const param of requiredParams) {
            if (!queryKeys.includes(param)) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required query parameter: ${param}`
                });
            }
        }

        // Check for invalid parameters
        const allAllowedParams = [...requiredParams, ...optionalParams];
        for (const param of queryKeys) {
            if (!allAllowedParams.includes(param)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid query parameter: ${param}`
                });
            }
        }

        next();
    };
};

// Middleware to validate request body has required fields
const validateRequiredFields = (requiredFields) => {
    return (req, res, next) => {
        const missingFields = [];
        
        for (const field of requiredFields) {
            if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        next();
    };
};

// Middleware to sanitize input
const sanitizeInput = (fields) => {
    return (req, res, next) => {
        for (const field of fields) {
            if (req.body[field] && typeof req.body[field] === 'string') {
                req.body[field] = req.body[field]
                    .trim()
                    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
                    .substring(0, 1000); // Limit length
            }
        }
        next();
    };
};

module.exports = {
    validate,
    validateRegistration,
    validateLogin,
    validateObjectId,
    validateFileUpload,
    validateQueryParams,
    validateRequiredFields,
    sanitizeInput
};