const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');

// @desc    Get all products (with search, category, price, rating, availability filters, pagination)
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { search, category, minPrice, maxPrice, rating, availability, sort, isFeatured, page, limit } = req.query;
    
    // Pagination settings
    const currentPage = Number(page) || 1;
    const pageLimit = Number(limit) || 9;
    const skip = (currentPage - 1) * pageLimit;

    let query = {};

    // Search query (live/debounced search matching name or brand)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      // Find category by slug or by ID
      const categoryObj = await Category.findOne({
        $or: [
          { slug: category },
          { _id: category.match(/^[0-9a-fA-F]{24}$/) ? category : null }
        ]
      });

      if (categoryObj) {
        query.category = categoryObj._id;
      } else {
        // If category specified but doesn't exist, return empty
        return res.json({
          success: true,
          data: [],
          page: currentPage,
          pages: 0,
          totalProducts: 0
        });
      }
    }

    // Price range filters
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Rating filter (e.g. rating=4 matches products with rating >= 4)
    if (rating) {
      query.rating = { $gte: Number(rating) };
    }

    // Availability filter (in-stock or out-of-stock)
    if (availability) {
      if (availability === 'in-stock') {
        query.stock = { $gt: 0 };
      } else if (availability === 'out-of-stock') {
        query.stock = { $eq: 0 };
      }
    }

    // Featured Status filter
    if (isFeatured !== undefined) {
      query.isFeatured = isFeatured === 'true';
    }

    // Sorting
    let sortBy = { createdAt: -1 }; // Default: Newest first
    if (sort) {
      if (sort === 'price-asc') sortBy = { price: 1 };
      else if (sort === 'price-desc') sortBy = { price: -1 };
      else if (sort === 'name-asc') sortBy = { name: 1 };
      else if (sort === 'name-desc') sortBy = { name: -1 };
      else if (sort === 'rating-desc') sortBy = { rating: -1 };
      else if (sort === 'createdAt-asc') sortBy = { createdAt: 1 };
    }

    // Get count for pagination
    const totalProducts = await Product.countDocuments(query);

    // Fetch products
    const products = await Product.find(query)
      .populate('category')
      .sort(sortBy)
      .skip(skip)
      .limit(pageLimit);

    res.json({
      success: true,
      data: products,
      page: currentPage,
      pages: Math.ceil(totalProducts / pageLimit),
      totalProducts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('reviews.user', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  const { name, description, price, discount, brand, category, image, images, stock, isFeatured } = req.body;

  try {
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ success: false, message: 'Invalid category specified' });
    }

    // Build images array
    const imageList = Array.isArray(images) ? images : (image ? [image] : []);

    const product = await Product.create({
      name,
      description,
      price: Number(price),
      discount: Number(discount) || 0,
      brand: brand || 'Generic',
      category,
      image: image || (imageList[0] || ''),
      images: imageList,
      stock: Number(stock) || 0,
      isFeatured: isFeatured === true || isFeatured === 'true'
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  const { name, description, price, discount, brand, category, image, images, stock, isFeatured } = req.body;

  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ success: false, message: 'Invalid category specified' });
      }
      product.category = category;
    }

    // Update fields if provided
    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price !== undefined ? Number(price) : product.price;
    product.discount = discount !== undefined ? Number(discount) : product.discount;
    product.brand = brand || product.brand;
    product.stock = stock !== undefined ? Number(stock) : product.stock;
    product.isFeatured = isFeatured !== undefined ? (isFeatured === true || isFeatured === 'true') : product.isFeatured;

    if (image !== undefined) product.image = image;
    if (images !== undefined) product.images = Array.isArray(images) ? images : [images];

    // If images array is updated but image is empty, update main image
    if (product.images.length > 0 && !product.image) {
      product.image = product.images[0];
    }

    const updatedProduct = await product.save();
    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Product removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new product review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = async (req, res) => {
  const { rating, comment } = req.body;
  const productId = req.params.id;

  try {
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Verify if user bought the product
    const hasPurchased = await Order.findOne({
      user: req.user._id,
      'items.product': productId
    });

    if (!hasPurchased) {
      return res.status(400).json({
        success: false,
        message: 'You can only review products that you have purchased.'
      });
    }

    // Check if user already reviewed
    const alreadyReviewed = product.reviews.find(
      r => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    const review = {
      user: req.user._id,
      name: req.user.name,
      rating: Number(rating),
      comment
    };

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    
    // Calculate new average rating
    const totalRating = product.reviews.reduce((sum, item) => item.rating + sum, 0);
    product.rating = totalRating / product.reviews.length;

    await product.save();
    res.status(201).json({ success: true, message: 'Review added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview
};
