const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { verifyUserTokenOptional } = require('../middleware/authMiddleware');
const { validate, checkoutSchema } = require('../middleware/validate');

// Route to get all categories
router.get('/categories', storeController.getCategories);

// Route to get a lightweight product list for client-side search
router.get('/products/search-index', storeController.getSearchIndex);

// Route for latest orders (used by updateTrustTicker in script.js)
router.get('/products/latest-orders', storeController.getLatestOrders);

// Route for site-wide config (payment numbers, social links, stats)
router.get('/site-config', storeController.getSiteConfig);

// Route for guest order tracking by email
router.post('/track-order', storeController.trackOrder);

// Route to get best-selling products
router.get('/products/best-selling', storeController.getBestSellingProducts);

// Route to get newly added products
router.get('/products/newly-added', storeController.getNewlyAddedProducts);

// Route to get related products for a given product
router.get('/products/related/:productId', storeController.getRelatedProducts);

// Route to get products by category — MUST be last (catch-all with :categoryKey)
router.get('/products/:categoryKey', storeController.getProductsByCategory);

// Route for creating a new order (checkout)
router.post('/checkout', verifyUserTokenOptional, validate(checkoutSchema), storeController.createOrder);

// Route for smart search (autocomplete)
router.get('/search', storeController.searchAll);

module.exports = router;
