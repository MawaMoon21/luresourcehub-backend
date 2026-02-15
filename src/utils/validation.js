const Joi = require('joi');

const registerValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().min(3).max(50).required()
            .messages({
                'string.empty': 'Name is required',
                'string.min': 'Name must be at least 3 characters',
                'string.max': 'Name cannot exceed 50 characters'
            }),
        email: Joi.string().min(6).max(255).required().email()
            .messages({
                'string.empty': 'Email is required',
                'string.email': 'Please provide a valid email',
                'string.min': 'Email must be at least 6 characters',
                'string.max': 'Email cannot exceed 255 characters'
            }),
        password: Joi.string().min(6).max(1024).required()
            .messages({
                'string.empty': 'Password is required',
                'string.min': 'Password must be at least 6 characters',
                'string.max': 'Password cannot exceed 1024 characters'
            }),
        role: Joi.string().valid('student', 'faculty', 'admin').required()
            .messages({
                'any.only': 'Role must be one of: student, faculty, admin',
                'string.empty': 'Role is required'
            }),
        department: Joi.string().valid('CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY').required()
            .messages({
                'any.only': 'Please select a valid department',
                'string.empty': 'Department is required'
            }),
        semester: Joi.number().min(1).max(12).optional()
            .messages({
                'number.base': 'Semester must be a number',
                'number.min': 'Semester must be at least 1',
                'number.max': 'Semester cannot exceed 12'
            })
    }).custom((value, helpers) => {
        // Custom validation for semester based on role
        if (value.role === 'student' && !value.semester) {
            return helpers.error('any.required', {
                message: 'Semester is required for students'
            });
        }
        if (value.role !== 'student' && value.semester) {
            return helpers.error('any.invalid', {
                message: 'Semester should only be specified for students'
            });
        }
        return value;
    });

    return schema.validate(data, { abortEarly: false });
};

const loginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string().min(6).max(255).required().email()
            .messages({
                'string.empty': 'Email is required',
                'string.email': 'Please provide a valid email'
            }),
        password: Joi.string().min(6).max(1024).required()
            .messages({
                'string.empty': 'Password is required',
                'string.min': 'Password must be at least 6 characters'
            })
    });

    return schema.validate(data, { abortEarly: false });
};

module.exports = {
    registerValidation,
    loginValidation
};