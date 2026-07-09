# AlphaShop - Smart Shopping Starts Here

AlphaShop is a complete, premium, production-ready Full Stack E-Commerce platform built from scratch. It utilizes an **MVC architecture** in the backend powered by **Node.js**, **Express**, and **Mongoose/MongoDB Atlas**, paired with a highly responsive, custom-designed **Single-Page Application (SPA)** on the frontend.

Designed with a sleek green theme, the store supports complete light/dark theme switching, animated interactive UI elements, scroll animations, database-backed persistent shopping carts, user wishlists, order fulfillment status workflows, role-based JWT auth, product review checks, and multiple image uploads using Multer.

---

## Technical Stack

### Frontend (Client SPA)
* **HTML5 & Vanilla CSS3**: Designed with curated HSL color tokens, glassmorphic headers, rounded cards, floating micro-animations, and full dark-theme variables.
* **Vanilla JavaScript (ES6 Modules)**: SPA router intercepts link navigation, controls reactive states, feeds REST APIs, and binds element triggers.
* **Bootstrap 5 & Bootstrap Icons**: Embedded fallback templates, styling utilities, and typography iconography.
* **Visual Libraries**:
  * **Swiper.js**: Touch-enabled carousel slider for displaying multiple product images on details views.
  * **AOS (Animate on Scroll)**: Triggered scroll fade effects on cards, headers, and grids.
  * **SweetAlert2**: Beautiful styled popup alerts for deletions, reviews, and order successes.
  * **Animate.css**: Entrance and exit element transitions.

### Backend (Server REST API)
* **Node.js & Express.js**: Handles custom routing and API controllers.
* **MongoDB Atlas & Mongoose ODM**: Relational data modeling, pre-save hooks (password hashing, slug generation), and sub-document collections.
* **Security & Performance**:
  * `helmet`: HTTP headers security settings.
  * `express-mongo-sanitize`: NoSQL injection sanitization.
  * `compression`: Gzip file compression for quick server response payloads.
  * `morgan`: Logger middleware for dev environment debugging.
  * `multer`: Node middleware handling multipart image upload storage.
  * `bcryptjs`: Password cryptography hashing.
  * `jsonwebtoken`: Stateless Bearer API authorization.

---

## Folder Structure

```
├── controllers/            # REST API logic controllers
│   ├── adminController.js     # Analytics stats, user roles, order updates
│   ├── authController.js      # User registration, login, profile editing
│   ├── categoryController.js  # Category creation, updates, and deletes
│   ├── orderController.js     # Order placement and history queries
│   ├── productController.js   # Product querying, filters, and review submission
│   ├── cartController.js      # persistent database cart handlers [NEW]
│   └── wishlistController.js  # user wishlist array toggles [NEW]
├── middleware/             # Express server checks
│   └── authMiddleware.js      # Token verification and Admin rights validation
├── models/                 # MongoDB database schemas
│   ├── Category.js            # Category (name, slug, description)
│   ├── Order.js               # Order (user, items list, addresses, total, payment details)
│   ├── Product.js             # Product (brand, discount, rating, gallery list, reviews)
│   ├── User.js                # User (name, email, password, isAdmin, wishlist array)
│   └── Cart.js                # Shopping Cart (user, items array) [NEW]
├── public/                 # SPA static directory
│   ├── css/
│   │   └── style.css          # Green variable definitions, dark mode grids, card layouts
│   ├── js/
│   │   └── app.js             # SPA client router, state management, Swiper slider setups
│   └── index.html             # Boilerplate viewport, visual CDNs, drawer overlays
├── routes/                 # API route mapping
│   ├── adminRoutes.js         # /api/admin/*
│   ├── authRoutes.js          # /api/auth/*
│   ├── categoryRoutes.js      # /api/categories/*
│   ├── orderRoutes.js         # /api/orders/*
│   ├── productRoutes.js       # /api/products/*
│   ├── cartRoutes.js          # /api/cart/* [NEW]
│   ├── wishlistRoutes.js      # /api/wishlist/* [NEW]
│   └── uploadRoutes.js        # /api/upload/* [NEW]
├── uploads/                # Directory for product image files uploaded via Multer [NEW]
├── .env                    # System port and DB connection (DO NOT COMMIT)
├── package.json            # Scripts & project NPM dependencies
└── server.js               # Web entry point, Mongoose boot, static loaders, error handler
```

---

## API Endpoints

### Authentication & Profiles
* `POST /api/auth/register` - Create client account (First registered user is auto-Admin).
* `POST /api/auth/login` - Verify password and return JWT token.
* `GET /api/auth/profile` - Fetch authenticated user details.
* `PUT /api/auth/profile` - Update profile name, email, or change password.

### Categories
* `GET /api/categories` - Fetch all category list elements.
* `POST /api/categories` - Create category (*Private/Admin*).
* `PUT /api/categories/:id` - Edit category name/details (*Private/Admin*).
* `DELETE /api/categories/:id` - Delete category if no products assigned (*Private/Admin*).

### Products
* `GET /api/products` - Query products catalog (price, search, rating, brand, availability filters, pagination).
* `GET /api/products/:id` - Get details of a single product with populated reviews.
* `POST /api/products` - Create product with multiple images (*Private/Admin*).
* `PUT /api/products/:id` - Edit product details (*Private/Admin*).
* `DELETE /api/products/:id` - Delete product from database (*Private/Admin*).
* `POST /api/products/:id/reviews` - Submit a review. Restricts reviews to buyers who ordered that product.

### Cart Management
* `GET /api/cart` - Fetch user's persistent cart, returning subtotal, shipping fees, tax, and grand totals.
* `POST /api/cart` - Add product or increment item quantity.
* `PUT /api/cart` - Update quantity of item in cart.
* `DELETE /api/cart/:productId` - Remove item from cart.
* `DELETE /api/cart` - Empty current cart.
* `POST /api/cart/sync` - Synchronize localStorage guest cart items into user's DB account upon login.

### Wishlist
* `GET /api/wishlist` - Fetch all products saved in user's wishlist.
* `POST /api/wishlist/toggle/:productId` - Toggle wishlist status for a product.

### Orders
* `POST /api/orders` - Place new order (Cash on Delivery or mocked Credit Card). Decrements stock levels.
* `GET /api/orders/myorders` - Fetch authenticated customer order placement history.
* `GET /api/orders/:id` - Fetch details of an order (*Private: Customer owner or Admin*).

### Admin Dashboard
* `GET /api/admin/stats` - Fetch total revenue, orders volume, product metrics, and inventory alerts (*Private/Admin*).
* `GET /api/admin/users` - Fetch registered platform users (*Private/Admin*).
* `PUT /api/admin/users/:id/role` - Toggle Administrator status on a user (*Private/Admin*).
* `DELETE /api/admin/users/:id` - Remove user account (*Private/Admin*).
* `GET /api/admin/orders` - Fetch all customer orders site-wide (*Private/Admin*).
* `PUT /api/admin/orders/:id` - Modify order delivery stages or payment statuses (*Private/Admin*).

### Uploads
* `POST /api/upload` - Upload single product thumbnail image (*Private/Admin*).
* `POST /api/upload/multiple` - Upload multiple gallery images (*Private/Admin*).

---

## Installation & Setup

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v16.0.0 or higher).

### 2. Install dependencies
Run in the project directory:
```bash
npm install
```

### 3. Environment Variables
Create a file named `.env` in the root folder:
```env
PORT=5000
MONGO_URI=mongodb://your_mongodb_connection_string
JWT_SECRET=your_secret_key_for_jwt
NODE_ENV=development
```

### 4. Running the Project
Launch in developer mode with hot-reloading (`nodemon`):
```bash
npm run dev
```

Or start the server normally:
```bash
npm start
```

Open `http://localhost:5000` in your web browser.

---

## Security Features & Performance
* **Centralized Security**: Application mounts `helmet` headers, sanitizes inputs, handles passwords through `bcryptjs` salt rounds, and secures endpoints using Bearer `JWT` scopes.
* **Database Safety**: MongoDB transactions decrement stock levels upon order confirmation. Deleting categories checks for active product listings first. Deleting users protects against demoting or removing your own logged-in account.
* **Network Performance**: Bundled Express `compression` speeds up response payload delivery. Queries support skip-based database pagination. Search operations are debounced in the SPA frontend.
