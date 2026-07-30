const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const rateLimit = require("express-rate-limit");
const Joi = require('joi');
const validate = require('../middleware/validate');

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "Requests many from this device, please try later."
});

const checkoutSchema = Joi.object({
    customerEmail: Joi.string().email().required(),
    cartItems: Joi.array().items(
        Joi.object({
            id: Joi.string().required(),
            name: Joi.string().required(),
        })
    ).min(1).required(),
    paymentMethod: Joi.string().optional(),
});

router.get('/products', generalLimiter, storeController.getProducts);
router.get('/products/:category', generalLimiter, storeController.getProducts);
router.post('/checkout', generalLimiter, validate(checkoutSchema), storeController.checkout);

module.exports = router;