const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a product name'],
      trim: true
    },
    title: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Please provide a product description'],
      trim: true
    },
    price: {
      type: Number,
      required: [true, 'Please provide a product price'],
      default: 0.0
    },
    discount: {
      type: Number,
      default: 0.0 // Discount percentage or amount. Let's make it percentage e.g., 10 for 10%
    },
    brand: {
      type: String,
      required: [true, 'Please specify a brand'],
      trim: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Please select a category']
    },
    image: {
      type: String,
      default: '' // Kept for backwards compatibility as the main image/thumbnail
    },
    images: {
      type: [String],
      default: [] // Array of image URLs/paths for gallery
    },
    stock: {
      type: Number,
      required: [true, 'Please specify stock quantity'],
      default: 0
    },
    rating: {
      type: Number,
      required: true,
      default: 0.0
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0
    },
    reviews: [reviewSchema],
    isFeatured: {
      type: Boolean,
      required: true,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Pre-save middleware to ensure name/title and image/images are synchronized
productSchema.pre('save', function(next) {
  if (this.name && !this.title) {
    this.title = this.name;
  } else if (this.title && !this.name) {
    this.name = this.title;
  }
  
  if (this.image && (!this.images || this.images.length === 0)) {
    this.images = [this.image];
  } else if ((!this.image || this.image === '') && this.images && this.images.length > 0) {
    this.image = this.images[0];
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);
