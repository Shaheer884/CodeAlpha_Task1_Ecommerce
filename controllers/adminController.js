const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');

// @desc    Get dashboard stats (Total Revenue, Orders, Products, Users)
// @route   GET /api/admin/stats
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({});
    const totalUsers = await User.countDocuments({});
    const totalOrders = await Order.countDocuments({});

    // Calculate total revenue from paid orders
    const paidOrders = await Order.find({ isPaid: true });
    const totalRevenue = paidOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Recent orders (last 5)
    const recentOrders = await Order.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    // Category breakdown
    const categoriesCount = await Category.countDocuments({});
    
    // Low stock warning (stock <= 5)
    const lowStockProducts = await Product.find({ stock: { $lte: 5 } }).limit(5);

    res.json({
      success: true,
      data: {
        totalProducts,
        totalUsers,
        totalOrders,
        totalRevenue,
        recentOrders,
        categoriesCount,
        lowStockProducts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update order status / payment status
// @route   PUT /api/admin/orders/:id
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  const { status, isPaid, isDelivered } = req.body;

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (status) order.status = status;
    
    if (isPaid !== undefined) {
      order.isPaid = isPaid;
      if (isPaid) order.paidAt = new Date();
    }

    if (isDelivered !== undefined) {
      order.isDelivered = isDelivered;
      if (isDelivered) {
        order.deliveredAt = new Date();
        order.status = 'Delivered';
      }
    }

    const updatedOrder = await order.save();
    res.json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Promote/demote user admin role
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
const updateUserAdminStatus = async (req, res) => {
  const { isAdmin } = req.body;

  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent demoting self
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot change your own admin status' });
    }

    user.isAdmin = isAdmin;
    const updatedUser = await user.save();
    res.json({
      success: true,
      data: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deleting self
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete yourself' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getOrders,
  updateOrderStatus,
  getUsers,
  updateUserAdminStatus,
  deleteUser
};
