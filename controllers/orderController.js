const Order = require('../models/Order');
const Product = require('../models/Product');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  const { items, shippingAddress, paymentMethod } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'No order items' });
  }

  try {
    let checkedItems = [];
    let totalAmount = 0;

    // Validate items and check stock
    for (const item of items) {
      const dbProduct = await Product.findById(item.product);
      if (!dbProduct) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.name}` });
      }

      if (dbProduct.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${dbProduct.name}. Only ${dbProduct.stock} left.`
        });
      }

      // Decrement stock
      dbProduct.stock -= item.quantity;
      await dbProduct.save();

      const itemTotal = dbProduct.price * item.quantity;
      totalAmount += itemTotal;

      checkedItems.push({
        product: dbProduct._id,
        name: dbProduct.name,
        quantity: item.quantity,
        price: dbProduct.price
      });
    }

    const order = await Order.create({
      user: req.user._id,
      items: checkedItems,
      shippingAddress,
      paymentMethod,
      totalAmount,
      isPaid: paymentMethod === 'Credit Card', // Mock automatic payment if credit card
      paidAt: paymentMethod === 'Credit Card' ? new Date() : null,
      status: 'Pending'
    });

    // Simulate sending order email
    console.log(`
=========================================
[AlphaShop EMAIL SIMULATOR]
To: ${req.user.email}
Subject: Order Confirmation - Order #${order._id}

Hello ${req.user.name},

Thank you for your purchase at AlphaShop!
We have received your order and are processing it.

Order ID: ${order._id}
Total Amount: $${order.totalAmount.toFixed(2)}
Payment Method: ${order.paymentMethod}
Shipping Address: ${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.postalCode}, ${shippingAddress.country}

Items:
${order.items.map(item => ` - ${item.name} x ${item.quantity} ($${item.price.toFixed(2)})`).join('\n')}

Smart Shopping Starts Here.
AlphaShop Team.
=========================================
    `);

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product', 'image');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization: must be user who placed it or an admin
    if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to order details' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById
};
