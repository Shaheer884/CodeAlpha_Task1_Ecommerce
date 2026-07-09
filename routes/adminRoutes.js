const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getOrders,
  updateOrderStatus,
  getUsers,
  updateUserAdminStatus,
  deleteUser
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Group all paths with protect & adminOnly middleware
router.use(protect);
router.use(adminOnly);

router.get('/stats', getDashboardStats);
router.get('/orders', getOrders);
router.put('/orders/:id', updateOrderStatus);
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserAdminStatus);
router.delete('/users/:id', deleteUser);

module.exports = router;
