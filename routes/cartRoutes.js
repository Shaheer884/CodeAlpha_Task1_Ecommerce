const express = require('express');
const router = express.Router();
const {
  getCart,
  syncCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
} = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

// All cart routes require authentication
router.use(protect);

router.route('/')
  .get(getCart)
  .post(addToCart)
  .put(updateCartItem)
  .delete(clearCart);

router.post('/sync', syncCart);
router.delete('/:productId', removeFromCart);

module.exports = router;
