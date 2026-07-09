const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, createOrder);

router.route('/myorders')
  .get(protect, getMyOrders);

router.route('/:id')
  .get(protect, getOrderById);

module.exports = router;
