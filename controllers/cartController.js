const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Helper to calculate cart totals
const getCartTotals = (cartItems) => {
  let subtotal = 0;
  cartItems.forEach((item) => {
    if (item.product) {
      const price = item.product.price;
      const discount = item.product.discount || 0;
      const finalPrice = price - (price * (discount / 100));
      subtotal += finalPrice * item.quantity;
    }
  });

  const shipping = subtotal > 100 || subtotal === 0 ? 0 : 15;
  const tax = subtotal * 0.08; // 8% sales tax
  const grandTotal = subtotal + shipping + tax;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    grandTotal: Number(grandTotal.toFixed(2))
  };
};

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    const totals = getCartTotals(cart.items);

    res.json({
      success: true,
      data: {
        _id: cart._id,
        user: cart.user,
        items: cart.items,
        ...totals
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Sync user cart from client localStorage
// @route   POST /api/cart/sync
// @access  Private
const syncCart = async (req, res) => {
  const { items } = req.body; // Expects array of { product: productId, quantity: number }

  try {
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Merge or overwrite items. Overwrite is safer for SPA syncing on login.
    const validatedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (product) {
        // Restrict quantity to stock limits
        const quantity = Math.min(item.quantity, product.stock);
        if (quantity > 0) {
          validatedItems.push({ product: product._id, quantity });
        }
      }
    }

    cart.items = validatedItems;
    await cart.save();

    // Fetch again with populated products
    const populatedCart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });

    const totals = getCartTotals(populatedCart.items);

    res.json({
      success: true,
      data: {
        _id: populatedCart._id,
        user: populatedCart.user,
        items: populatedCart.items,
        ...totals
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = Number(quantity) || 1;

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.stock === 0) {
      return res.status(400).json({ success: false, message: 'Product is out of stock' });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

    if (itemIndex > -1) {
      const newQty = cart.items[itemIndex].quantity + qty;
      cart.items[itemIndex].quantity = Math.min(newQty, product.stock);
    } else {
      cart.items.push({ product: productId, quantity: Math.min(qty, product.stock) });
    }

    await cart.save();

    // Fetch populated
    const populatedCart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });
    const totals = getCartTotals(populatedCart.items);

    res.json({
      success: true,
      data: {
        _id: populatedCart._id,
        user: populatedCart.user,
        items: populatedCart.items,
        ...totals
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart
// @access  Private
const updateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = Number(quantity);

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

    if (itemIndex > -1) {
      if (qty <= 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = Math.min(qty, product.stock);
      }
      await cart.save();
    }

    const populatedCart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });
    const totals = getCartTotals(populatedCart.items);

    res.json({
      success: true,
      data: {
        _id: populatedCart._id,
        user: populatedCart.user,
        items: populatedCart.items,
        ...totals
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
const removeFromCart = async (req, res) => {
  const { productId } = req.params;

  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = cart.items.filter(item => item.product.toString() !== productId);
      await cart.save();
    }

    const populatedCart = await Cart.findById(cart._id).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });
    const totals = getCartTotals(populatedCart.items);

    res.json({
      success: true,
      data: {
        _id: populatedCart._id,
        user: populatedCart.user,
        items: populatedCart.items,
        ...totals
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Clear user cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.json({
      success: true,
      data: {
        user: req.user._id,
        items: [],
        subtotal: 0,
        shipping: 0,
        tax: 0,
        grandTotal: 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCart,
  syncCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
