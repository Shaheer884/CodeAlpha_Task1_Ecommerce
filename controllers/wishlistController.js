const User = require('../models/User');

// @desc    Get logged in user's wishlist
// @route   GET /api/wishlist
// @access  Private
const getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user.wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle item in wishlist (add if not exists, remove if exists)
// @route   POST /api/wishlist/toggle/:productId
// @access  Private
const toggleWishlist = async (req, res) => {
  const { productId } = req.params;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isWishlisted = user.wishlist.includes(productId);

    if (isWishlisted) {
      user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    } else {
      user.wishlist.push(productId);
    }

    await user.save();
    
    // Fetch and return populated wishlist
    const updatedUser = await User.findById(req.user._id).populate('wishlist');

    res.json({
      success: true,
      message: isWishlisted ? 'Product removed from wishlist' : 'Product added to wishlist',
      data: updatedUser.wishlist
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getWishlist,
  toggleWishlist
};
