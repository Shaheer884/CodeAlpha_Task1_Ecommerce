const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

// Initialize express app
const app = express();

// Security Middlewares
// Disable Helmet Content Security Policy restrictions during local testing if it blocks CDN assets, 
// but enable the other helmet protections.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(cors());
app.use(mongoSanitize());

// Performance and Utility Middlewares
app.use(compression());
if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
  app.use(morgan('dev'));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads folder statically for product images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));

// Fallback for single page application client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack || err.message);
  
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Database connection
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('CRITICAL ERROR: MONGO_URI env variable is not set!');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

console.log('Connecting to MongoDB Atlas...');
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connection established successfully.');
    // Start listening only after DB connects successfully
    app.listen(PORT, () => {
      console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`Open http://localhost:${PORT} in your web browser`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
