const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { verifyUserTokenOptional } = require('../middleware/authMiddleware'); // استيراد ميدل وير جديد

// Route to get products by category
router.get('/products/:categoryKey', storeController.getProductsByCategory);

// Route for latest orders (used by updateTrustTicker in script.js)
router.get('/products/latest-orders', storeController.getLatestOrders);

// Route for creating a new order (checkout)
router.post('/checkout', verifyUserTokenOptional, storeController.createOrder);

module.exports = router;