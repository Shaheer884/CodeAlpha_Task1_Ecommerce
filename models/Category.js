const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a category name'],
      trim: true,
      unique: true
    },
    description: {
      type: String,
      trim: true
    },
    slug: {
      type: String,
      lowercase: true,
      unique: true
    }
  },
  {
    timestamps: true
  }
);

// Pre-save to generate slug from name
categorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
