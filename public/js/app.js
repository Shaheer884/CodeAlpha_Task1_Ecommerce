// AlphaShop SPA Core Logic
// Handling client-side state, API actions, custom routing, and visual rendering

// --- STATE MANAGEMENT ---
const AppState = {
  user: JSON.parse(localStorage.getItem('alpha_user')) || null,
  token: localStorage.getItem('alpha_token') || null,
  cart: [], // Cart state. If logged in, synced with MongoDB.
  wishlist: [], // Wishlist state. Synced with MongoDB.
  categories: [],
  currentQuery: {
    search: '',
    category: '',
    minPrice: '',
    maxPrice: '',
    rating: '',
    availability: '',
    sort: 'createdAt-desc',
    page: 1,
    limit: 6
  }
};

// --- BASE API UTILITY ---
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (AppState.token) {
    headers['Authorization'] = `Bearer ${AppState.token}`;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(endpoint, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'API request failed');
    }
    
    return result;
  } catch (error) {
    console.error('API Error details:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'error') icon = 'fa-exclamation-circle';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
    <span class="toast-close"><i class="fa-solid fa-xmark"></i></span>
  `;

  container.appendChild(toast);

  // Close toast on click
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s ease-out reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- CART LOGIC ---
async function fetchCart() {
  if (!AppState.user) {
    // Local storage cart for guest
    AppState.cart = JSON.parse(localStorage.getItem('alpha_cart')) || [];
    updateCartCount();
    return;
  }

  try {
    const result = await apiCall('/api/cart');
    AppState.cart = result.data.items;
    updateCartCount();
  } catch (err) {
    console.error('Failed to fetch cart from server:', err);
  }
}

function updateCartCount() {
  const badge = document.getElementById('cart-badge-count');
  const drawerCount = document.getElementById('cart-drawer-count');
  
  const count = AppState.cart.reduce((total, item) => total + item.quantity, 0);
  
  if (badge) badge.innerText = count;
  if (drawerCount) drawerCount.innerText = count;
  
  if (!AppState.user) {
    localStorage.setItem('alpha_cart', JSON.stringify(AppState.cart));
  }
}

async function addToCart(product, quantity = 1) {
  if (product.stock === 0) {
    showToast('This product is out of stock', 'warning');
    return;
  }

  if (AppState.user) {
    try {
      const result = await apiCall('/api/cart', 'POST', { productId: product._id, quantity });
      AppState.cart = result.data.items;
      updateCartCount();
      renderCartDrawer();
      showToast(`Added "${product.name}" to cart`, 'success');
    } catch (err) {}
  } else {
    // Guest cart in LocalStorage
    const existingItemIndex = AppState.cart.findIndex(item => item.product._id === product._id);
    
    if (existingItemIndex > -1) {
      const newQty = AppState.cart[existingItemIndex].quantity + quantity;
      if (newQty > product.stock) {
        showToast(`Cannot add more. Only ${product.stock} items in stock.`, 'warning');
        return;
      }
      AppState.cart[existingItemIndex].quantity = newQty;
    } else {
      AppState.cart.push({ product, quantity });
    }
    
    updateCartCount();
    renderCartDrawer();
    showToast(`Added "${product.name}" to cart`, 'success');
  }
}

async function updateCartQty(productId, newQty) {
  const index = AppState.cart.findIndex(item => (item.product._id || item.product) === productId);
  if (index === -1) return;

  const item = AppState.cart[index];
  const prodObj = item.product;

  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (newQty > prodObj.stock) {
    showToast(`Only ${prodObj.stock} items available in stock`, 'warning');
    newQty = prodObj.stock;
  }

  if (AppState.user) {
    try {
      const result = await apiCall('/api/cart', 'PUT', { productId, quantity: newQty });
      AppState.cart = result.data.items;
      updateCartCount();
      renderCartDrawer();
    } catch (err) {}
  } else {
    AppState.cart[index].quantity = newQty;
    updateCartCount();
    renderCartDrawer();
  }
}

async function removeFromCart(productId) {
  if (AppState.user) {
    try {
      const result = await apiCall(`/api/cart/${productId}`, 'DELETE');
      AppState.cart = result.data.items;
      updateCartCount();
      renderCartDrawer();
      showToast('Product removed from cart', 'info');
    } catch (err) {}
  } else {
    AppState.cart = AppState.cart.filter(item => item.product._id !== productId);
    updateCartCount();
    renderCartDrawer();
    showToast('Product removed from cart', 'info');
  }
}

async function clearCart() {
  if (AppState.user) {
    try {
      await apiCall('/api/cart', 'DELETE');
      AppState.cart = [];
      updateCartCount();
      renderCartDrawer();
    } catch (err) {}
  } else {
    AppState.cart = [];
    updateCartCount();
    renderCartDrawer();
  }
}

async function syncCartOnLogin() {
  const localCart = JSON.parse(localStorage.getItem('alpha_cart')) || [];
  if (localCart.length > 0) {
    try {
      const payload = localCart.map(item => ({
        product: item.product._id || item.product,
        quantity: item.quantity
      }));
      const result = await apiCall('/api/cart/sync', 'POST', { items: payload });
      AppState.cart = result.data.items;
      localStorage.removeItem('alpha_cart');
      updateCartCount();
    } catch (err) {
      console.error('Failed to sync cart:', err);
    }
  } else {
    await fetchCart();
  }
}

// --- WISHLIST LOGIC ---
async function fetchWishlist() {
  if (!AppState.user) {
    AppState.wishlist = [];
    return;
  }
  try {
    const result = await apiCall('/api/wishlist');
    AppState.wishlist = result.data;
  } catch (err) {
    console.error('Failed to fetch wishlist:', err);
  }
}

async function toggleWishlistState(productId) {
  if (!AppState.user) {
    Swal.fire({
      title: 'Sign In Required',
      text: 'Please log in to add products to your wishlist.',
      icon: 'info',
      confirmButtonText: 'Login Now',
      showCancelButton: true,
      confirmButtonColor: 'var(--primary)'
    }).then(result => {
      if (result.isConfirmed) {
        navigateTo('/login');
      }
    });
    return;
  }

  try {
    const result = await apiCall(`/api/wishlist/toggle/${productId}`, 'POST');
    AppState.wishlist = result.data;
    showToast(result.message, 'success');
    
    // Toggle active state in UI elements on storefront
    const heartBtns = document.querySelectorAll(`.wishlist-badge-btn[data-id="${productId}"]`);
    heartBtns.forEach(btn => {
      const isWishlisted = AppState.wishlist.some(p => p._id === productId);
      btn.classList.toggle('active', isWishlisted);
      btn.innerHTML = isWishlisted ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    });
  } catch (err) {}
}

function renderCartDrawer() {
  const container = document.getElementById('cart-items-container');
  const footerArea = document.getElementById('cart-footer-area');
  const totalAmount = document.getElementById('cart-total-amount');

  if (!container) return;

  if (AppState.cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <i class="fa-solid fa-basket-shopping"></i>
        <p>Your cart is empty</p>
        <button class="btn btn-secondary btn-sm" id="cart-start-shopping">Start Shopping</button>
      </div>
    `;
    if (footerArea) footerArea.style.display = 'none';
    
    const startShopBtn = document.getElementById('cart-start-shopping');
    if (startShopBtn) {
      startShopBtn.addEventListener('click', () => {
        closeCart();
        navigateTo('/');
      });
    }
    return;
  }

  if (footerArea) footerArea.style.display = 'block';

  let html = '';
  let subtotal = 0;

  AppState.cart.forEach(item => {
    const product = item.product;
    if (!product) return;

    const discount = product.discount || 0;
    const finalPrice = product.price - (product.price * (discount / 100));
    const itemTotal = finalPrice * item.quantity;
    subtotal += itemTotal;

    const imgTag = product.image 
      ? `<img src="${product.image}" alt="${product.name}">`
      : `<i class="fa-solid fa-image"></i>`;

    const priceHtml = discount > 0
      ? `<span class="price-original">$${(product.price * item.quantity).toFixed(2)}</span>$${itemTotal.toFixed(2)}`
      : `$${itemTotal.toFixed(2)}`;

    html += `
      <div class="cart-item">
        <div class="cart-item-image">
          ${imgTag}
        </div>
        <div class="cart-item-details">
          <div class="cart-item-name">${product.name}</div>
          <div class="cart-item-cat">${product.brand || 'Brand'}</div>
          <div class="cart-item-bottom">
            <div class="qty-selector">
              <button class="cart-qty-minus" data-id="${product._id}"><i class="fa-solid fa-minus"></i></button>
              <input type="text" value="${item.quantity}" readonly>
              <button class="cart-qty-plus" data-id="${product._id}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="cart-item-price">${priceHtml}</div>
          </div>
        </div>
        <button class="btn-icon cart-remove-item" data-id="${product._id}" style="color:var(--danger); font-size:1rem; align-self: flex-start;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
  
  // Calculate server-like totals client side for presentation
  const shipping = subtotal > 100 ? 0 : 15;
  const tax = subtotal * 0.08;
  const grandTotal = subtotal + shipping + tax;

  if (totalAmount) totalAmount.innerText = `$${grandTotal.toFixed(2)}`;

  // Bind change quantity/remove buttons
  container.querySelectorAll('.cart-qty-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = AppState.cart.find(i => (i.product._id || i.product) === id);
      if (item) updateCartQty(id, item.quantity - 1);
    });
  });

  container.querySelectorAll('.cart-qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = AppState.cart.find(i => (i.product._id || i.product) === id);
      if (item) updateCartQty(id, item.quantity + 1);
    });
  });

  container.querySelectorAll('.cart-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      removeFromCart(id);
    });
  });
}

function openCart() {
  document.getElementById('cart-overlay')?.classList.add('show');
  document.getElementById('cart-drawer')?.classList.add('show');
  renderCartDrawer();
}

function closeCart() {
  document.getElementById('cart-overlay')?.classList.remove('show');
  document.getElementById('cart-drawer')?.classList.remove('show');
}

// --- MODALS ---
function showModal(contentHtml) {
  const overlay = document.getElementById('global-modal-overlay');
  const modal = document.getElementById('global-modal');
  const body = document.getElementById('global-modal-body');

  if (!overlay || !modal || !body) return;

  body.innerHTML = contentHtml;
  overlay.classList.add('show');
  modal.classList.add('show');
}

function closeModal() {
  document.getElementById('global-modal-overlay')?.classList.remove('show');
  document.getElementById('global-modal')?.classList.remove('show');
}

// --- AUTH STATE & PROFILE ---
function renderUserNavbarArea() {
  const container = document.getElementById('user-menu-area');
  if (!container) return;

  if (AppState.user) {
    container.innerHTML = `
      <div class="profile-dropdown-btn" id="navbar-profile-btn">
        <i class="fa-solid fa-circle-user" style="font-size:1.3rem;"></i>
        <span>${AppState.user.name}</span>
        <i class="fa-solid fa-chevron-down" style="font-size:0.8rem;"></i>
      </div>
      <div class="dropdown-menu" id="navbar-profile-menu">
        <a href="/dashboard"><i class="fa-solid fa-table-columns"></i> Dashboard</a>
        ${
          AppState.user.isAdmin
            ? `<a href="/admin"><i class="fa-solid fa-lock"></i> Admin Panel</a>`
            : ''
        }
        <div class="dropdown-divider"></div>
        <button id="navbar-logout-btn"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
      </div>
    `;

    // Dropdown toggle
    const profileBtn = document.getElementById('navbar-profile-btn');
    const profileMenu = document.getElementById('navbar-profile-menu');
    
    if (profileBtn && profileMenu) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.classList.toggle('show');
      });
    }

    // Logout action
    const logoutBtn = document.getElementById('navbar-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        logoutUser();
      });
    }

    // Intercept navigation links
    bindSpaLinks(container);
  } else {
    container.innerHTML = `
      <a href="/login" class="btn btn-primary btn-sm login-nav-btn" id="login-link">
        <i class="fa-solid fa-user"></i> Login
      </a>
    `;
    
    const loginLink = document.getElementById('login-link');
    if (loginLink) {
      loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('/login');
      });
    }
  }
}

function logoutUser() {
  AppState.user = null;
  AppState.token = null;
  AppState.cart = [];
  AppState.wishlist = [];
  localStorage.removeItem('alpha_user');
  localStorage.removeItem('alpha_token');
  renderUserNavbarArea();
  updateCartCount();
  showToast('Logged out successfully', 'success');
  navigateTo('/');
}

// --- CLIENT ROUTER & PAGES ---
const Router = {
  routes: {},
  
  add(path, handler) {
    this.routes[path] = handler;
  },

  async handleRoute(path) {
    closeCart();
    
    // Clear dropdowns
    document.getElementById('navbar-profile-menu')?.classList.remove('show');
    
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
      appRoot.innerHTML = `
        <div class="loader-container">
          <div class="loader"></div>
        </div>
      `;
    }

    // Strip query parameters and trailing slashes for routing
    const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';

    // Parse path parameters e.g., /product/:id -> /product/123
    let matchedHandler = null;
    let params = {};

    for (const route in this.routes) {
      const routeParts = route.split('/');
      const pathParts = cleanPath.split('/');
      
      if (routeParts.length === pathParts.length) {
        let isMatch = true;
        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(':')) {
            params[routeParts[i].substring(1)] = pathParts[i];
          } else if (routeParts[i] !== pathParts[i]) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          matchedHandler = this.routes[route];
          break;
        }
      }
    }

    if (matchedHandler) {
      try {
        await matchedHandler(params);
        bindSpaLinks(appRoot);
        // Trigger AOS animations refresh
        if (window.AOS) AOS.refresh();
      } catch (err) {
        console.error('Routing Error:', err);
        appRoot.innerHTML = `
          <div style="text-align:center; padding: 4rem;">
            <h2>Page Load Error</h2>
            <p>${err.message}</p>
            <button class="btn btn-primary" onclick="navigateTo('/')" style="margin-top:1.5rem;">Go to Home</button>
          </div>
        `;
      }
    } else {
      appRoot.innerHTML = `
        <div style="text-align:center; padding: 4rem;">
          <h2>404 - Page Not Found</h2>
          <p>The page you are looking for does not exist.</p>
          <button class="btn btn-primary" onclick="navigateTo('/')" style="margin-top:1.5rem;">Go to Home</button>
        </div>
      `;
    }
  }
};

function navigateTo(url) {
  window.history.pushState(null, null, url);
  Router.handleRoute(url);
}

window.navigateTo = navigateTo; // expose globally for easy inline onclick access

function bindSpaLinks(parent) {
  const elements = parent ? parent.querySelectorAll('a') : document.querySelectorAll('a');
  elements.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/') && !link.classList.contains('footer-category-link')) {
      // replace normal behavior
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(href);
      });
    }
  });
}

// Helper to render rating stars
function renderStars(rating) {
  let starsHtml = '';
  const floor = Math.floor(rating);
  for (let i = 1; i <= 5; i++) {
    if (i <= floor) {
      starsHtml += '<i class="fa-solid fa-star"></i>';
    } else if (i - 0.5 <= rating) {
      starsHtml += '<i class="fa-solid fa-star-half-stroke"></i>';
    } else {
      starsHtml += '<i class="fa-regular fa-star"></i>';
    }
  }
  return starsHtml;
}

// --- DYNAMIC VIEWS AND CONTROLLERS ---

// 1. HOME / PRODUCT STOREFRONT PAGE
async function showStorePage() {
  const appRoot = document.getElementById('app-root');
  
  let products = [];
  let responseData = {};
  try {
    const categoriesResult = await apiCall('/api/categories');
    AppState.categories = categoriesResult.data;
    
    // Construct query parameters
    let q = `?sort=${AppState.currentQuery.sort}&page=${AppState.currentQuery.page}&limit=${AppState.currentQuery.limit}`;
    if (AppState.currentQuery.search) q += `&search=${encodeURIComponent(AppState.currentQuery.search)}`;
    if (AppState.currentQuery.category) q += `&category=${AppState.currentQuery.category}`;
    if (AppState.currentQuery.minPrice) q += `&minPrice=${AppState.currentQuery.minPrice}`;
    if (AppState.currentQuery.maxPrice) q += `&maxPrice=${AppState.currentQuery.maxPrice}`;
    if (AppState.currentQuery.rating) q += `&rating=${AppState.currentQuery.rating}`;
    if (AppState.currentQuery.availability) q += `&availability=${AppState.currentQuery.availability}`;

    const productsResult = await apiCall(`/api/products${q}`);
    products = productsResult.data;
    responseData = productsResult; // carries page & pages info
  } catch (error) {
    appRoot.innerHTML = `<p style="text-align:center; color:var(--danger)">Failed to fetch products: ${error.message}</p>`;
    return;
  }

  // Hero section template
  const heroHtml = `
    <section class="hero fade-in floating-element" data-aos="fade-up">
      <div class="hero-content">
        <p class="hero-tagline">Welcome to AlphaShop</p>
        <h1>Smart Shopping Starts Here</h1>
        <p>Explore our curated collection of premium products, with the fastest checkout experience, directly connected to our database.</p>
        <button class="btn btn-primary btn-ripple" id="hero-shop-now">Explore Collection <i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </section>
  `;

  // Categories template
  let categoriesHtml = `
    <div class="section-header" data-aos="fade-up">
      <h2>Browse Categories</h2>
    </div>
    <div class="categories-grid fade-in" data-aos="fade-up">
      <div class="category-card ${!AppState.currentQuery.category ? 'active' : ''}" data-cat="">
        <div class="icon-wrap"><i class="fa-solid fa-cubes"></i></div>
        <h3>All Products</h3>
        <p>View everything</p>
      </div>
  `;

  AppState.categories.forEach(cat => {
    let icon = 'fa-tag';
    const nameLower = cat.name.toLowerCase();
    if (nameLower.includes('electronic')) icon = 'fa-laptop';
    else if (nameLower.includes('cloth') || nameLower.includes('wear') || nameLower.includes('fashion')) icon = 'fa-shirt';
    else if (nameLower.includes('home') || nameLower.includes('kitchen') || nameLower.includes('living')) icon = 'fa-house-chimney';
    else if (nameLower.includes('book')) icon = 'fa-book';
    else if (nameLower.includes('sport')) icon = 'fa-volleyball';

    categoriesHtml += `
      <div class="category-card ${AppState.currentQuery.category === cat._id ? 'active' : ''}" data-cat="${cat._id}">
        <div class="icon-wrap"><i class="fa-solid ${icon}"></i></div>
        <h3>${cat.name}</h3>
        <p>${cat.description || 'Category'}</p>
      </div>
    `;
  });
  categoriesHtml += '</div>';

  // Filters Bar template
  const filtersHtml = `
    <div class="section-header" id="catalog-section" data-aos="fade-up">
      <h2>AlphaShop Catalog</h2>
    </div>
    <div class="filters-bar fade-in" data-aos="fade-up">
      <div class="filters-left" style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
        <select class="filter-select" id="filter-sort" style="padding:0.4rem 0.8rem;">
          <option value="createdAt-desc" ${AppState.currentQuery.sort === 'createdAt-desc' ? 'selected' : ''}>Newest First</option>
          <option value="price-asc" ${AppState.currentQuery.sort === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
          <option value="price-desc" ${AppState.currentQuery.sort === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
          <option value="name-asc" ${AppState.currentQuery.sort === 'name-asc' ? 'selected' : ''}>Name: A to Z</option>
          <option value="name-desc" ${AppState.currentQuery.sort === 'name-desc' ? 'selected' : ''}>Name: Z to A</option>
          <option value="rating-desc" ${AppState.currentQuery.sort === 'rating-desc' ? 'selected' : ''}>Top Rated</option>
        </select>
        
        <select class="filter-select" id="filter-rating" style="padding:0.4rem 0.8rem;">
          <option value="">-- Star Rating --</option>
          <option value="4" ${AppState.currentQuery.rating === '4' ? 'selected' : ''}>4★ & up</option>
          <option value="3" ${AppState.currentQuery.rating === '3' ? 'selected' : ''}>3★ & up</option>
          <option value="2" ${AppState.currentQuery.rating === '2' ? 'selected' : ''}>2★ & up</option>
        </select>

        <select class="filter-select" id="filter-availability" style="padding:0.4rem 0.8rem;">
          <option value="">-- Availability --</option>
          <option value="in-stock" ${AppState.currentQuery.availability === 'in-stock' ? 'selected' : ''}>In Stock Only</option>
          <option value="out-of-stock" ${AppState.currentQuery.availability === 'out-of-stock' ? 'selected' : ''}>Out of Stock</option>
        </select>

        <input type="number" class="filter-select" style="width:90px;" id="filter-min-price" placeholder="Min $" value="${AppState.currentQuery.minPrice}">
        <input type="number" class="filter-select" style="width:90px;" id="filter-max-price" placeholder="Max $" value="${AppState.currentQuery.maxPrice}">
        
        <button class="btn btn-secondary btn-sm" id="apply-filters-btn">Apply</button>
        ${
          AppState.currentQuery.search || AppState.currentQuery.category || AppState.currentQuery.minPrice || AppState.currentQuery.maxPrice || AppState.currentQuery.rating || AppState.currentQuery.availability
            ? '<button class="btn btn-danger btn-sm" id="clear-filters-btn"><i class="fa-solid fa-filter-circle-xmark"></i> Clear</button>'
            : ''
        }
      </div>
      <div>
        <strong>${responseData.totalProducts || 0}</strong> products found
      </div>
    </div>
  `;

  // Products List template
  let productsHtml = '<div class="products-grid fade-in" data-aos="fade-up">';
  if (products.length === 0) {
    productsHtml = `
      <div style="grid-column: 1/-1; text-align:center; padding: 4rem; background: var(--bg-secondary); border-radius: var(--radius-md); border:1px dashed var(--border-color)">
        <i class="fa-solid fa-box-open" style="font-size:3rem; color:var(--text-tertiary); margin-bottom:1rem;"></i>
        <h3>No Products Found</h3>
        <p>There are no products in the catalog matching your criteria.</p>
        ${
          AppState.user?.isAdmin 
            ? `<button class="btn btn-primary btn-sm" id="home-create-first-product" style="margin-top:1rem;"><i class="fa-solid fa-plus"></i> Add Product</button>`
            : ''
        }
      </div>
    `;
  } else {
    products.forEach(prod => {
      const stockBadge = prod.stock === 0 
        ? '<span class="stock-badge out">Out of stock</span>'
        : prod.stock <= 5 
          ? `<span class="stock-badge" style="background-color: var(--warning)">Only ${prod.stock} left</span>`
          : '';

      const discountBadge = prod.discount > 0
        ? `<span class="discount-badge">-${prod.discount}% OFF</span>`
        : '';

      const isWishlisted = AppState.wishlist.some(p => p._id === prod._id);
      const heartIcon = isWishlisted ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
      const heartClass = isWishlisted ? 'active' : '';

      const finalPrice = prod.price - (prod.price * ((prod.discount || 0) / 100));
      const priceHtml = prod.discount > 0
        ? `<span class="price-original">$${prod.price.toFixed(2)}</span> $${finalPrice.toFixed(2)}`
        : `$${prod.price.toFixed(2)}`;

      const ratingStars = prod.rating > 0 
        ? `<div class="review-stars" style="margin-top:0.25rem;">${renderStars(prod.rating)} <span style="font-size:0.75rem; color:var(--text-tertiary);">(${prod.numReviews})</span></div>`
        : '';

      const imgHtml = prod.image
        ? `<img src="${prod.image}" alt="${prod.name}" class="product-image-real">`
        : `<i class="fa-solid fa-cubes product-image-placeholder"></i>`;

      productsHtml += `
        <div class="product-card" style="position:relative;">
          ${discountBadge}
          <button class="wishlist-badge-btn ${heartClass}" data-id="${prod._id}" title="Add to Wishlist">
            <i class="${heartIcon}"></i>
          </button>
          <div class="product-image-container">
            ${stockBadge}
            ${imgHtml}
          </div>
          <div class="product-info">
            <span class="product-category">${prod.category?.name || 'Product'}</span>
            <a href="/product/${prod._id}" class="product-title">${prod.name}</a>
            <div style="font-size:0.8rem; color:var(--text-tertiary); margin-bottom: 0.25rem;">Brand: <strong>${prod.brand || 'Generic'}</strong></div>
            ${ratingStars}
            <div class="product-bottom">
              <span class="product-price">${priceHtml}</span>
              ${
                prod.stock > 0
                  ? `<button class="btn btn-primary btn-icon home-add-cart-btn btn-ripple" data-id="${prod._id}" title="Add to Cart"><i class="fa-solid fa-cart-plus"></i></button>`
                  : `<button class="btn btn-secondary btn-icon" disabled title="Out of Stock"><i class="fa-solid fa-slash"></i></button>`
              }
            </div>
          </div>
        </div>
      `;
    });
  }
  productsHtml += '</div>';

  // Pagination controls template
  let paginationHtml = '';
  if (responseData.pages > 1) {
    let pagesButtons = '';
    for (let i = 1; i <= responseData.pages; i++) {
      pagesButtons += `
        <button class="btn ${responseData.page === i ? 'btn-primary' : 'btn-secondary'} btn-sm pagination-page-btn" data-page="${i}">${i}</button>
      `;
    }
    paginationHtml = `
      <div class="pagination-container" style="display:flex; justify-content:center; gap:0.5rem; margin-top:2.5rem;" data-aos="fade-up">
        <button class="btn btn-secondary btn-sm" id="prev-page-btn" ${responseData.page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Prev</button>
        ${pagesButtons}
        <button class="btn btn-secondary btn-sm" id="next-page-btn" ${responseData.page === responseData.pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
      </div>
    `;
  }

  appRoot.innerHTML = `
    ${heroHtml}
    ${categoriesHtml}
    ${filtersHtml}
    ${productsHtml}
    ${paginationHtml}
  `;

  // Bind Interactions
  // Hero shop button
  document.getElementById('hero-shop-now')?.addEventListener('click', () => {
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Category selection cards
  appRoot.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      AppState.currentQuery.category = card.getAttribute('data-cat');
      AppState.currentQuery.page = 1; // reset page
      showStorePage();
      setTimeout(() => {
        document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
  });

  // Wishlist toggle buttons
  appRoot.querySelectorAll('.wishlist-badge-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      toggleWishlistState(id);
    });
  });

  // Add to cart buttons
  appRoot.querySelectorAll('.home-add-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      const prod = products.find(p => p._id === id);
      if (prod) addToCart(prod, 1);
    });
  });

  // Filters: Apply & Clear
  document.getElementById('apply-filters-btn')?.addEventListener('click', () => {
    AppState.currentQuery.sort = document.getElementById('filter-sort').value;
    AppState.currentQuery.rating = document.getElementById('filter-rating').value;
    AppState.currentQuery.availability = document.getElementById('filter-availability').value;
    AppState.currentQuery.minPrice = document.getElementById('filter-min-price').value;
    AppState.currentQuery.maxPrice = document.getElementById('filter-max-price').value;
    AppState.currentQuery.page = 1; // reset page
    showStorePage();
  });

  document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
    AppState.currentQuery.search = '';
    AppState.currentQuery.category = '';
    AppState.currentQuery.minPrice = '';
    AppState.currentQuery.maxPrice = '';
    AppState.currentQuery.rating = '';
    AppState.currentQuery.availability = '';
    AppState.currentQuery.sort = 'createdAt-desc';
    AppState.currentQuery.page = 1;
    
    const navSearch = document.getElementById('search-input');
    const mobileSearch = document.getElementById('mobile-search-input');
    if (navSearch) navSearch.value = '';
    if (mobileSearch) mobileSearch.value = '';
    
    showStorePage();
  });

  // Pagination clicks
  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    AppState.currentQuery.page -= 1;
    showStorePage();
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    AppState.currentQuery.page += 1;
    showStorePage();
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  appRoot.querySelectorAll('.pagination-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.currentQuery.page = Number(btn.getAttribute('data-page'));
      showStorePage();
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Admin first product helper
  document.getElementById('home-create-first-product')?.addEventListener('click', () => {
    navigateTo('/admin?tab=products');
  });
}

// 2. PRODUCT DETAILS PAGE
async function showProductDetailsPage(params) {
  const appRoot = document.getElementById('app-root');
  
  let product = null;
  try {
    const response = await apiCall(`/api/products/${params.id}`);
    product = response.data;
  } catch (error) {
    appRoot.innerHTML = `<p style="text-align:center; color:var(--danger)">Failed to fetch product details: ${error.message}</p>`;
    return;
  }

  // Generate Swiper Slide Gallery
  // Support single main image + images array
  const allImages = [];
  if (product.image) allImages.push(product.image);
  if (product.images && product.images.length > 0) {
    product.images.forEach(img => {
      if (img && img !== product.image) allImages.push(img);
    });
  }

  let galleryHtml = '';
  if (allImages.length === 0) {
    galleryHtml = `
      <div class="swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide">
            <i class="fa-solid fa-cubes detail-gallery-placeholder" style="font-size: 5rem; color: var(--text-tertiary);"></i>
          </div>
        </div>
      </div>
    `;
  } else {
    let slidesHtml = '';
    allImages.forEach(img => {
      slidesHtml += `
        <div class="swiper-slide">
          <img src="${img}" alt="${product.name}">
        </div>
      `;
    });
    
    galleryHtml = `
      <div class="swiper product-swiper">
        <div class="swiper-wrapper">
          ${slidesHtml}
        </div>
        <!-- Pagination & Navigation -->
        <div class="swiper-pagination"></div>
        <div class="swiper-button-prev" style="color:var(--primary)"></div>
        <div class="swiper-button-next" style="color:var(--primary)"></div>
      </div>
    `;
  }

  const stockBadgeHtml = product.stock === 0
    ? '<span class="badge bg-danger">Out of Stock</span>'
    : product.stock <= 5
      ? `<span class="badge bg-warning">Only ${product.stock} items left</span>`
      : '<span class="badge bg-success">In Stock</span>';

  // Calculate pricing
  const discount = product.discount || 0;
  const finalPrice = product.price - (product.price * (discount / 100));
  const priceHtml = discount > 0
    ? `<span class="price-original" style="font-size:1.3rem;">$${product.price.toFixed(2)}</span> $${finalPrice.toFixed(2)}`
    : `$${product.price.toFixed(2)}`;

  // Render rating display
  const ratingsHeaderHtml = product.rating > 0
    ? `
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom: 0.5rem;">
        <span class="review-stars">${renderStars(product.rating)}</span>
        <strong>${product.rating.toFixed(1)}</strong>
        <span style="color:var(--text-tertiary);">(${product.numReviews} Reviews)</span>
      </div>
    `
    : '<p style="color:var(--text-tertiary); font-size:0.9rem; margin-bottom: 0.5rem;">No reviews yet.</p>';

  // Render Reviews List
  let reviewsListHtml = '<p style="color:var(--text-tertiary);">No customer reviews available yet.</p>';
  if (product.reviews && product.reviews.length > 0) {
    reviewsListHtml = '';
    product.reviews.forEach(rev => {
      const revDate = new Date(rev.createdAt).toLocaleDateString();
      reviewsListHtml += `
        <div class="review-card">
          <div class="review-header">
            <span class="review-user">${rev.user?.name || rev.name}</span>
            <span class="review-date">${revDate}</span>
          </div>
          <div class="review-stars" style="margin-bottom:0.5rem;">${renderStars(rev.rating)}</div>
          <p class="review-comment">${rev.comment}</p>
        </div>
      `;
    });
  }

  // Render Write Review Form (conditional: logged in AND has purchased)
  let writeReviewFormHtml = '';
  
  if (AppState.user) {
    // We make a mock check or check order items to see if they bought it.
    // In our plan, we verify this in the backend, but we can do a helpful client check or directly fetch orders.
    // Let's assume the user is shown the review box if they are logged in, and the backend returns an error if they haven't purchased.
    // However, to make a premium experience, we will fetch orders from server or rely on backend return on submission.
    // Let's display the review box for all authenticated customers, handling purchase verification on the form submission.
    writeReviewFormHtml = `
      <div class="write-review-card">
        <h3>Write a Review</h3>
        <p style="font-size:0.85rem; color:var(--text-tertiary); margin-bottom: 1rem;">Note: You must have purchased this product from AlphaShop to submit a rating.</p>
        <form id="product-review-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label style="display:block; margin-bottom:0.25rem;">Your Rating</label>
            <div class="star-rating-selector">
              <input type="radio" name="review-rating-val" id="star5" value="5" required><label for="star5" title="5 stars"><i class="fa-solid fa-star"></i></label>
              <input type="radio" name="review-rating-val" id="star4" value="4"><label for="star4" title="4 stars"><i class="fa-solid fa-star"></i></label>
              <input type="radio" name="review-rating-val" id="star3" value="3"><label for="star3" title="3 stars"><i class="fa-solid fa-star"></i></label>
              <input type="radio" name="review-rating-val" id="star2" value="2"><label for="star2" title="2 stars"><i class="fa-solid fa-star"></i></label>
              <input type="radio" name="review-rating-val" id="star1" value="1"><label for="star1" title="1 star"><i class="fa-solid fa-star"></i></label>
            </div>
          </div>
          
          <div class="form-group">
            <label for="review-comment-val">Review Comments</label>
            <textarea id="review-comment-val" class="form-control" placeholder="Share your experience with this product..." style="height:100px;" required></textarea>
          </div>
          
          <button type="submit" class="btn btn-primary" style="margin-top:1.5rem; padding:0.6rem 2rem;">Submit Review</button>
        </form>
      </div>
    `;
  } else {
    writeReviewFormHtml = `
      <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); text-align:center; border: 1px solid var(--border-color); margin-top:2rem;">
        <p style="margin-bottom:0.5rem;">Want to write a review?</p>
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('/login')">Log In to Review</button>
      </div>
    `;
  }

  appRoot.innerHTML = `
    <div class="detail-container fade-in" data-aos="fade-up">
      <div class="detail-gallery">
        ${galleryHtml}
      </div>
      <div class="detail-info">
        <span class="detail-cat">${product.category?.name || 'Product'}</span>
        <h1 class="detail-title">${product.name}</h1>
        ${ratingsHeaderHtml}
        <div class="detail-price">${priceHtml}</div>
        <p class="detail-desc">${product.description}</p>
        
        <table class="detail-meta-table">
          <tr>
            <td>Availability</td>
            <td>${stockBadgeHtml}</td>
          </tr>
          <tr>
            <td>Brand Name</td>
            <td><strong>${product.brand || 'Generic'}</strong></td>
          </tr>
          <tr>
            <td>Discount Offer</td>
            <td>${discount > 0 ? `<span class="badge bg-danger">${discount}% Discount Active</span>` : 'None'}</td>
          </tr>
        </table>
        
        <div class="detail-actions">
          ${
            product.stock > 0
              ? `
                <div class="qty-selector">
                  <button id="detail-qty-minus"><i class="fa-solid fa-minus"></i></button>
                  <input type="text" id="detail-qty-input" value="1" readonly>
                  <button id="detail-qty-plus"><i class="fa-solid fa-plus"></i></button>
                </div>
                <button class="btn btn-primary btn-ripple" id="detail-add-cart-btn" style="flex:1;"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>
              `
              : `<button class="btn btn-secondary btn-block" disabled><i class="fa-solid fa-slash"></i> Out of Stock</button>`
          }
        </div>
      </div>
    </div>

    <!-- Reviews Section -->
    <div class="reviews-container fade-in" data-aos="fade-up">
      <h2 style="margin-bottom: 1.5rem;">Customer Reviews</h2>
      
      <div style="display:grid; grid-template-columns: 1fr; gap: 2rem;">
        <div class="reviews-list">
          ${reviewsListHtml}
        </div>
        
        ${writeReviewFormHtml}
      </div>
    </div>
  `;

  // Initialize Swiper carousel if multiple images loaded
  if (allImages.length > 0 && window.Swiper) {
    new Swiper('.product-swiper', {
      loop: true,
      pagination: {
        el: '.swiper-pagination',
        clickable: true,
      },
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
    });
  }

  // Bind Quantity Selection
  if (product.stock > 0) {
    const qtyInput = document.getElementById('detail-qty-input');
    const minusBtn = document.getElementById('detail-qty-minus');
    const plusBtn = document.getElementById('detail-qty-plus');
    const addBtn = document.getElementById('detail-add-cart-btn');

    minusBtn?.addEventListener('click', () => {
      let val = Number(qtyInput.value);
      if (val > 1) qtyInput.value = val - 1;
    });

    plusBtn?.addEventListener('click', () => {
      let val = Number(qtyInput.value);
      if (val < product.stock) qtyInput.value = val + 1;
      else showToast(`Cannot order more than ${product.stock} items`, 'warning');
    });

    addBtn?.addEventListener('click', () => {
      addToCart(product, Number(qtyInput.value));
    });
  }

  // Bind Submit Review Form
  const reviewForm = document.getElementById('product-review-form');
  reviewForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const ratingRadio = document.querySelector('input[name="review-rating-val"]:checked');
    if (!ratingRadio) {
      showToast('Please select a star rating', 'warning');
      return;
    }

    const payload = {
      rating: ratingRadio.value,
      comment: document.getElementById('review-comment-val').value
    };

    try {
      await apiCall(`/api/products/${product._id}/reviews`, 'POST', payload);
      Swal.fire({
        title: 'Review Posted',
        text: 'Thank you for your rating! Your review was successfully saved.',
        icon: 'success',
        confirmButtonColor: 'var(--primary)'
      });
      showProductDetailsPage(params); // reload details
    } catch (err) {
      // apiCall logs error toast
    }
  });
}

// 3. LOGIN & REGISTER FORM PAGE
async function showLoginPage() {
  if (AppState.user) {
    navigateTo('/dashboard');
    return;
  }

  const appRoot = document.getElementById('app-root');
  appRoot.innerHTML = `
    <div class="auth-page fade-in" data-aos="zoom-in">
      <div class="auth-card">
        <div class="auth-tabs">
          <div class="auth-tab active" id="tab-login">Login</div>
          <div class="auth-tab" id="tab-register">Register</div>
        </div>
        
        <!-- Login Form -->
        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input type="email" id="login-email" class="form-control" required placeholder="you@example.com">
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" class="form-control" required placeholder="••••••••">
          </div>
          <div class="form-group form-check" style="margin-top: 1rem;">
            <input type="checkbox" class="form-check-input" id="login-remember-me" checked>
            <label class="form-check-label" for="login-remember-me">Remember Me</label>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-ripple" style="margin-top:1.5rem;">Sign In</button>
        </form>

        <!-- Register Form -->
        <form id="register-form" style="display:none;">
          <div class="form-group">
            <label for="register-name">Full Name</label>
            <input type="text" id="register-name" class="form-control" required placeholder="John Doe">
          </div>
          <div class="form-group">
            <label for="register-email">Email Address</label>
            <input type="email" id="register-email" class="form-control" required placeholder="john@example.com">
          </div>
          <div class="form-group">
            <label for="register-password">Password</label>
            <input type="password" id="register-password" class="form-control" required minlength="6" placeholder="At least 6 characters">
          </div>
          <div class="form-group">
            <label for="register-confirm-password">Confirm Password</label>
            <input type="password" id="register-confirm-password" class="form-control" required placeholder="Repeat password">
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-ripple" style="margin-top:1.5rem;">Sign Up</button>
          
          <div style="margin-top: 1rem; font-size:0.85rem; color:var(--text-tertiary); text-align:center;">
            <i class="fa-solid fa-circle-info"></i> Note: The very first account registered will automatically become an <strong>Administrator</strong>.
          </div>
        </form>
      </div>
    </div>
  `;

  // Bind Form Switch tabs
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });

  tabRegister?.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  });

  // Bind Form Submissions
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('login-remember-me').checked;

    try {
      const response = await apiCall('/api/auth/login', 'POST', { email, password });
      AppState.user = response.data;
      AppState.token = response.data.token;
      
      if (rememberMe) {
        localStorage.setItem('alpha_user', JSON.stringify(response.data));
        localStorage.setItem('alpha_token', response.data.token);
      } else {
        localStorage.removeItem('alpha_user');
        localStorage.removeItem('alpha_token');
        sessionStorage.setItem('alpha_user', JSON.stringify(response.data));
        sessionStorage.setItem('alpha_token', response.data.token);
      }
      
      renderUserNavbarArea();
      showToast(`Welcome back, ${response.data.name}!`, 'success');
      
      // Load user specifics
      await syncCartOnLogin();
      await fetchWishlist();
      
      if (AppState.cart.length > 0) navigateTo('/checkout');
      else navigateTo('/');
    } catch (err) {}
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const response = await apiCall('/api/auth/register', 'POST', { name, email, password });
      AppState.user = response.data;
      AppState.token = response.data.token;
      
      localStorage.setItem('alpha_user', JSON.stringify(response.data));
      localStorage.setItem('alpha_token', response.data.token);
      
      renderUserNavbarArea();
      
      const adminNotice = response.data.isAdmin ? ' (Administrator account created)' : '';
      showToast(`Account created successfully${adminNotice}. Welcome, ${response.data.name}!`, 'success');
      
      // Load user specifics
      await syncCartOnLogin();
      await fetchWishlist();

      if (AppState.cart.length > 0) navigateTo('/checkout');
      else navigateTo('/');
    } catch (err) {}
  });
}

// 4. CHECKOUT PAGE
async function showCheckoutPage() {
  if (!AppState.user) {
    showToast('Please login to continue to checkout', 'warning');
    navigateTo('/login');
    return;
  }

  if (AppState.cart.length === 0) {
    showToast('Your cart is empty', 'warning');
    navigateTo('/');
    return;
  }

  const appRoot = document.getElementById('app-root');
  
  // Calculate Totals based on server side parameters
  let subtotal = 0;
  AppState.cart.forEach(item => {
    const product = item.product;
    if (product) {
      const finalPrice = product.price - (product.price * ((product.discount || 0) / 100));
      subtotal += finalPrice * item.quantity;
    }
  });

  let shipping = subtotal > 100 ? 0 : 15;
  let tax = subtotal * 0.08;
  let grandTotal = subtotal + shipping + tax;

  let itemsSummaryHtml = '';
  AppState.cart.forEach(item => {
    const product = item.product;
    if (!product) return;
    const finalPrice = product.price - (product.price * ((product.discount || 0) / 100));
    itemsSummaryHtml += `
      <div class="checkout-summary-item" style="border-bottom:1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
        <span>${product.name} x ${item.quantity}</span>
        <span>$${(finalPrice * item.quantity).toFixed(2)}</span>
      </div>
    `;
  });

  appRoot.innerHTML = `
    <div class="section-header" data-aos="fade-up">
      <h2>Secure Checkout</h2>
    </div>
    
    <div class="checkout-layout fade-in" data-aos="fade-up">
      <!-- Shipping Address Form -->
      <div class="checkout-form-column">
        <form id="checkout-form">
          <div class="checkout-card">
            <h3>Shipping Details</h3>
            
            <div class="form-group">
              <label for="ship-phone">Contact Phone Number</label>
              <input type="text" id="ship-phone" class="form-control" required placeholder="+1 (555) 000-0000">
            </div>

            <div class="form-group" style="margin-top:0.75rem;">
              <label for="ship-address">Street Address</label>
              <input type="text" id="ship-address" class="form-control" required placeholder="123 Main St">
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top:0.75rem;">
              <div class="form-group">
                <label for="ship-city">City</label>
                <input type="text" id="ship-city" class="form-control" required placeholder="New York">
              </div>
              <div class="form-group">
                <label for="ship-postal">Postal Code</label>
                <input type="text" id="ship-postal" class="form-control" required placeholder="10001">
              </div>
            </div>
            
            <div class="form-group" style="margin-top:0.75rem;">
              <label for="ship-country">Country</label>
              <input type="text" id="ship-country" class="form-control" required placeholder="United States" value="United States">
            </div>
          </div>
          
          <div class="checkout-card" style="margin-top:1.5rem;">
            <h3>Payment Method</h3>
            <div class="payment-options">
              <div class="payment-option-card active" data-method="Credit Card">
                <i class="fa-solid fa-credit-card"></i>
                <span>Credit Card</span>
              </div>
              <div class="payment-option-card" data-method="Cash On Delivery">
                <i class="fa-solid fa-truck-ramp-box"></i>
                <span>Cash on Delivery</span>
              </div>
            </div>
            
            <!-- Credit Card Form Fields (Mocked) -->
            <div id="credit-card-fields" style="margin-top:1rem;">
              <div class="form-group">
                <label for="cc-number">Card Number</label>
                <input type="text" id="cc-number" class="form-control" placeholder="4111 2222 3333 4444" value="4111 2222 3333 4444" required>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top:0.75rem;">
                <div class="form-group">
                  <label for="cc-expiry">Expiration</label>
                  <input type="text" id="cc-expiry" class="form-control" placeholder="12/28" value="12/28" required>
                </div>
                <div class="form-group">
                  <label for="cc-cvv">CVV</label>
                  <input type="text" id="cc-cvv" class="form-control" placeholder="123" value="123" required>
                </div>
              </div>
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary btn-block btn-lg btn-ripple" style="margin-top:1.5rem;"><i class="fa-solid fa-lock"></i> Place Order ($${grandTotal.toFixed(2)})</button>
        </form>
      </div>
      
      <!-- Order Items Summary Column -->
      <div class="checkout-summary-column">
        <div class="checkout-card" style="position: sticky; top: 100px;">
          <h3>Order Summary</h3>
          
          <div style="max-height: 250px; overflow-y:auto; margin-bottom: 1.5rem;">
            ${itemsSummaryHtml}
          </div>
          
          <div class="checkout-summary-item">
            <span>Subtotal</span>
            <span>$${subtotal.toFixed(2)}</span>
          </div>
          <div class="checkout-summary-item">
            <span>Shipping</span>
            <span>${shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
          </div>
          <div class="checkout-summary-item">
            <span>Taxes (8%)</span>
            <span>$${tax.toFixed(2)}</span>
          </div>
          
          <!-- Coupon Box -->
          <div style="margin: 1rem 0; padding:0.75rem; background:var(--bg-tertiary); border-radius: var(--radius-sm); border:1px solid var(--border-color); display:flex; gap:0.5rem;">
            <input type="text" class="form-control" placeholder="Promo Coupon" style="padding:0.25rem 0.5rem; font-size:0.85rem;" id="checkout-coupon-code">
            <button class="btn btn-secondary btn-sm" id="checkout-apply-coupon" type="button">Apply</button>
          </div>

          <div class="checkout-summary-item total">
            <span>Total</span>
            <span>$${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind payment options switcher
  let selectedPaymentMethod = 'Credit Card';
  const ccFields = document.getElementById('credit-card-fields');
  const ccInputs = ccFields.querySelectorAll('input');
  
  appRoot.querySelectorAll('.payment-option-card').forEach(card => {
    card.addEventListener('click', () => {
      appRoot.querySelectorAll('.payment-option-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedPaymentMethod = card.getAttribute('data-method');
      
      if (selectedPaymentMethod === 'Credit Card') {
        if (ccFields) ccFields.style.display = 'block';
        ccInputs.forEach(i => i.setAttribute('required', 'true'));
      } else {
        if (ccFields) ccFields.style.display = 'none';
        ccInputs.forEach(i => i.removeAttribute('required'));
      }
    });
  });

  // Apply Coupon (visual feedback)
  document.getElementById('checkout-apply-coupon')?.addEventListener('click', () => {
    const code = document.getElementById('checkout-coupon-code').value;
    if (code) {
      showToast(`Coupon "${code}" is invalid or expired.`, 'warning');
    } else {
      showToast('Please type a coupon code', 'info');
    }
  });

  // Bind Submit Order
  document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const orderPayload = {
      items: AppState.cart.map(item => ({
        product: item.product._id || item.product,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price - (item.product.price * ((item.product.discount || 0) / 100))
      })),
      shippingAddress: {
        address: document.getElementById('ship-address').value,
        city: document.getElementById('ship-city').value,
        postalCode: document.getElementById('ship-postal').value,
        country: document.getElementById('ship-country').value
      },
      paymentMethod: selectedPaymentMethod
    };

    try {
      const response = await apiCall('/api/orders', 'POST', orderPayload);
      clearCart();
      
      Swal.fire({
        title: 'Order Placed!',
        text: `Your order #${response.data._id.substring(18)} has been placed successfully.`,
        icon: 'success',
        confirmButtonColor: 'var(--primary)'
      });

      navigateTo(`/dashboard?order=${response.data._id}`);
    } catch (err) {}
  });
}

// 5. ROLE-BASED DASHBOARD ROUTING
function handleRoleBasedDashboardRedirect() {
  if (!AppState.user) {
    navigateTo('/login');
    return;
  }
  if (AppState.user.isAdmin) {
    navigateTo('/admin/dashboard');
  } else {
    navigateTo('/customer/dashboard');
  }
}

// 5a. CUSTOMER DASHBOARD
async function showCustomerDashboardPage() {
  if (!AppState.user) {
    navigateTo('/login');
    return;
  }

  const appRoot = document.getElementById('app-root');
  const queryParams = new URLSearchParams(window.location.search);
  const activeTab = queryParams.get('tab') || 'orders';
  const showOrderId = queryParams.get('order');

  // Render Layout with Skeleton Loader immediately
  appRoot.innerHTML = `
    <div class="dashboard-layout fade-in">
      <aside class="dashboard-sidebar" data-aos="fade-right">
        <a href="/customer/dashboard?tab=orders" class="sidebar-link ${activeTab === 'orders' ? 'active' : ''}"><i class="fa-solid fa-receipt"></i> My Orders</a>
        <a href="/customer/dashboard?tab=wishlist" class="sidebar-link ${activeTab === 'wishlist' ? 'active' : ''}"><i class="fa-solid fa-heart"></i> Wishlist</a>
        <a href="/customer/dashboard?tab=addresses" class="sidebar-link ${activeTab === 'addresses' ? 'active' : ''}"><i class="fa-solid fa-map-location-dot"></i> Addresses</a>
        <a href="/customer/dashboard?tab=payments" class="sidebar-link ${activeTab === 'payments' ? 'active' : ''}"><i class="fa-solid fa-credit-card"></i> Payment Methods</a>
        <a href="/customer/dashboard?tab=profile" class="sidebar-link ${activeTab === 'profile' ? 'active' : ''}"><i class="fa-solid fa-user-gear"></i> Account Settings</a>
      </aside>
      
      <div class="dashboard-view" id="customer-view-content" data-aos="fade-left">
        <div class="skeleton-loader">
          <div class="skeleton-title"></div>
          <div class="skeleton-text" style="width: 80%;"></div>
          <div class="skeleton-text" style="width: 60%;"></div>
          <div class="skeleton-card" style="margin-top: 2rem; height: 200px;"></div>
        </div>
      </div>
    </div>
  `;

  // Bind Sidebar routing immediately
  appRoot.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.getAttribute('href'));
    });
  });

  const viewContent = document.getElementById('customer-view-content');

  // Asynchronously fetch client details & orders
  try {
    let orders = [];
    try {
      const ordersResult = await apiCall('/api/orders/myorders');
      orders = ordersResult.data || [];
    } catch (err) {
      console.error('Failed to load orders', err);
    }

    // Load wishlist
    await fetchWishlist();

    const totalSpent = orders.filter(o => o.isPaid).reduce((sum, o) => sum + o.totalAmount, 0);
    const loyaltyPoints = Math.round(totalSpent * 10);

    let activeViewHtml = '';

    // Welcome Banner Header
    const bannerHtml = `
      <div class="welcome-banner">
        <div class="welcome-info">
          <h1>Welcome back, ${AppState.user.name}!</h1>
          <p>Manage your orders, save items to your wishlist, and update account shipping details.</p>
        </div>
        <div class="loyalty-badge">
          <div class="loyalty-icon"><i class="fa-solid fa-gem"></i></div>
          <div class="loyalty-details">
            <h4>Loyalty Points</h4>
            <div class="points">${loyaltyPoints} pts</div>
          </div>
        </div>
      </div>
    `;

    // --- TAB CONTROLLER ---
    if (activeTab === 'profile') {
      activeViewHtml = `
        ${bannerHtml}
        <h2>Account Settings</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Update your profile credentials or change your security password.</p>
        
        <form id="profile-update-form" class="checkout-card" style="margin-bottom:1.5rem;">
          <h3 style="font-size:1.15rem; margin-bottom:1rem;">General Information</h3>
          <div class="form-group">
            <label for="profile-name">Full Name</label>
            <input type="text" id="profile-name" class="form-control" value="${AppState.user.name}" required>
          </div>
          <div class="form-group" style="margin-top:1rem;">
            <label for="profile-email">Email Address</label>
            <input type="email" id="profile-email" class="form-control" value="${AppState.user.email}" required>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:1.5rem; padding:0.6rem 2rem;">Save Changes</button>
        </form>

        <form id="profile-password-form" class="checkout-card">
          <h3 style="font-size:1.15rem; margin-bottom:1rem;">Change Password</h3>
          <div class="form-group">
            <label for="profile-new-password">New Password</label>
            <input type="password" id="profile-new-password" class="form-control" placeholder="At least 6 characters" minlength="6" required>
          </div>
          <div class="form-group" style="margin-top:1rem;">
            <label for="profile-confirm-password">Confirm Password</label>
            <input type="password" id="profile-confirm-password" class="form-control" placeholder="Repeat new password" required>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:1.5rem; padding:0.6rem 2rem;">Update Password</button>
        </form>
      `;
    } else if (activeTab === 'wishlist') {
      let wishlistItemsHtml = '';
      if (AppState.wishlist.length === 0) {
        wishlistItemsHtml = `
          <div style="text-align:center; padding:3rem; color:var(--text-secondary);">
            <i class="fa-regular fa-heart" style="font-size:3rem; margin-bottom:1rem;"></i>
            <p>Your wishlist is empty</p>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('/')" style="margin-top:1rem;">Add Products</button>
          </div>
        `;
      } else {
        wishlistItemsHtml = '<div class="products-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:1.5rem;">';
        AppState.wishlist.forEach(p => {
          const imgHtml = p.image
            ? `<img src="${p.image}" alt="${p.name}" class="product-image-real">`
            : `<i class="fa-solid fa-cubes product-image-placeholder"></i>`;

          wishlistItemsHtml += `
            <div class="product-card" style="padding:1rem;">
              <div class="product-image-container" style="height:120px;">
                ${imgHtml}
              </div>
              <div class="product-info" style="padding-top:0.5rem;">
                <a href="/product/${p._id}" class="product-title" style="font-size:0.9rem;">${p.name}</a>
                <div class="product-bottom" style="margin-top:0.5rem;">
                  <span class="product-price" style="font-size:1rem;">$${p.price.toFixed(2)}</span>
                  <button class="btn btn-danger btn-icon remove-wishlist-tab-btn" data-id="${p._id}" title="Remove from Wishlist"><i class="fa-solid fa-heart-crack"></i></button>
                </div>
              </div>
            </div>
          `;
        });
        wishlistItemsHtml += '</div>';
      }

      activeViewHtml = `
        ${bannerHtml}
        <h2>My Wishlist</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Products you've saved to buy later.</p>
        ${wishlistItemsHtml}
      `;
    } else if (activeTab === 'addresses') {
      const savedAddress = localStorage.getItem('alpha_profile_address') || '';
      const savedCity = localStorage.getItem('alpha_profile_city') || '';
      const savedPostal = localStorage.getItem('alpha_profile_postal') || '';
      const savedCountry = localStorage.getItem('alpha_profile_country') || '';
      const savedPhone = localStorage.getItem('alpha_profile_phone') || '';

      activeViewHtml = `
        ${bannerHtml}
        <h2>My Addresses</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Manage your shipping addresses for quick checkout.</p>
        
        <div class="row">
          <div class="col-md-6" style="margin-bottom:1.5rem;">
            <div class="checkout-card" style="height:100%;">
              <h3 style="font-size:1.1rem; margin-bottom:1rem;"><i class="fa-solid fa-location-dot" style="color:var(--primary)"></i> Saved Shipping Address</h3>
              ${savedAddress ? `
                <p style="margin-bottom:0.5rem;"><strong>Street:</strong> ${savedAddress}</p>
                <p style="margin-bottom:0.5rem;"><strong>City:</strong> ${savedCity}</p>
                <p style="margin-bottom:0.5rem;"><strong>Postal Code:</strong> ${savedPostal}</p>
                <p style="margin-bottom:0.5rem;"><strong>Country:</strong> ${savedCountry}</p>
                <p style="margin-bottom:0;"><strong>Phone:</strong> ${savedPhone}</p>
              ` : `
                <p style="color:var(--text-secondary); font-style:italic;">No address saved yet. Fill out the form to add one.</p>
              `}
            </div>
          </div>
          <div class="col-md-6">
            <form id="address-update-form" class="checkout-card">
              <h3 style="font-size:1.1rem; margin-bottom:1rem;">Add / Edit Address</h3>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="address-street">Street Address</label>
                <input type="text" id="address-street" class="form-control" value="${savedAddress}" required placeholder="123 Main St">
              </div>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="address-city">City</label>
                <input type="text" id="address-city" class="form-control" value="${savedCity}" required placeholder="New York">
              </div>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="address-postal">Postal Code</label>
                <input type="text" id="address-postal" class="form-control" value="${savedPostal}" required placeholder="10001">
              </div>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="address-country">Country</label>
                <input type="text" id="address-country" class="form-control" value="${savedCountry}" required placeholder="United States">
              </div>
              <div class="form-group" style="margin-bottom:1rem;">
                <label for="address-phone">Phone Number</label>
                <input type="text" id="address-phone" class="form-control" value="${savedPhone}" required placeholder="+1 (555) 123-4567">
              </div>
              <button type="submit" class="btn btn-primary btn-sm btn-block">Save Address</button>
            </form>
          </div>
        </div>
      `;
    } else if (activeTab === 'payments') {
      const cardName = localStorage.getItem('alpha_profile_card_name') || '';
      const cardNum = localStorage.getItem('alpha_profile_card_num') || '';
      const cardExpiry = localStorage.getItem('alpha_profile_card_expiry') || '';
      const maskedCardNum = cardNum ? `•••• •••• •••• ${cardNum.replace(/\s+/g, '').slice(-4)}` : '';

      activeViewHtml = `
        ${bannerHtml}
        <h2>Payment Methods</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Save credit or debit cards to your profile for faster payments.</p>
        
        <div class="row">
          <div class="col-md-6" style="margin-bottom:1.5rem;">
            <div class="checkout-card" style="height:100%; min-height:180px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden;">
              <div style="position:absolute; right:-20px; top:-20px; font-size:8rem; opacity:0.05; color:#fff;"><i class="fa-solid fa-credit-card"></i></div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:1.1rem; color:#fff;">AlphaCard</div>
                <div style="font-size:1.5rem; color:var(--primary);"><i class="fa-brands fa-cc-visa"></i></div>
              </div>
              
              ${cardNum ? `
                <div style="font-size:1.2rem; font-family:monospace; color:#fff; letter-spacing:2px; margin: 1.5rem 0;">${maskedCardNum}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <small style="color:var(--text-secondary); display:block; text-transform:uppercase; font-size:0.6rem;">Cardholder</small>
                    <span style="color:#fff; font-size:0.85rem; font-weight:600;">${cardName}</span>
                  </div>
                  <div>
                    <small style="color:var(--text-secondary); display:block; text-transform:uppercase; font-size:0.6rem;">Expires</small>
                    <span style="color:#fff; font-size:0.85rem; font-weight:600;">${cardExpiry}</span>
                  </div>
                </div>
              ` : `
                <div style="color:var(--text-secondary); font-style:italic; margin: 1.5rem 0;">No card saved on file.</div>
              `}
            </div>
          </div>
          <div class="col-md-6">
            <form id="payment-update-form" class="checkout-card">
              <h3 style="font-size:1.1rem; margin-bottom:1rem;">Add / Edit Card</h3>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="card-holder-name">Cardholder Name</label>
                <input type="text" id="card-holder-name" class="form-control" value="${cardName}" required placeholder="John Doe">
              </div>
              <div class="form-group" style="margin-bottom:0.75rem;">
                <label for="card-number">Card Number</label>
                <input type="text" id="card-number" class="form-control" value="${cardNum}" required minlength="16" maxlength="19" placeholder="4111 2222 3333 4444">
              </div>
              <div class="form-group" style="margin-bottom:1rem;">
                <label for="card-expiry-date">Expiry Date</label>
                <input type="text" id="card-expiry-date" class="form-control" value="${cardExpiry}" required placeholder="MM/YY" maxlength="5">
              </div>
              <button type="submit" class="btn btn-primary btn-sm btn-block">Save Card Details</button>
            </form>
          </div>
        </div>
      `;
    } else {
      let stepperHtml = '';
      let ordersRows = '';
      
      if (orders.length === 0) {
        ordersRows = `
          <tr>
            <td colspan="6" style="text-align:center; padding: 3rem; color:var(--text-secondary)">
              <i class="fa-solid fa-receipt" style="font-size:2.5rem; margin-bottom:1rem;"></i>
              <p>You have not placed any orders yet.</p>
              <button class="btn btn-primary btn-sm" onclick="navigateTo('/')" style="margin-top:1rem;">Shop Now</button>
            </td>
          </tr>
        `;
      } else {
        const recentOrder = orders[0];
        const dateStr = new Date(recentOrder.createdAt).toLocaleDateString();
        let trackerStatus = recentOrder.status;
        let isCancelled = trackerStatus === 'Cancelled';
        
        let percentage = 0;
        let stepsActive = [false, false, false, false];
        let stepsCompleted = [false, false, false, false];
        
        if (!isCancelled) {
          if (trackerStatus === 'Pending') {
            percentage = 0;
            stepsActive = [true, false, false, false];
          } else if (trackerStatus === 'Processing') {
            percentage = 33.3;
            stepsActive = [false, true, false, false];
            stepsCompleted = [true, false, false, false];
          } else if (trackerStatus === 'Shipped') {
            percentage = 66.6;
            stepsActive = [false, false, true, false];
            stepsCompleted = [true, true, false, false];
          } else if (trackerStatus === 'Delivered') {
            percentage = 100;
            stepsActive = [false, false, false, true];
            stepsCompleted = [true, true, true, true];
          }
        }
        
        stepperHtml = `
          <div class="checkout-card" style="padding:1.5rem; margin-bottom:2rem;" data-aos="fade-up">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem; margin-bottom:1rem;">
              <div>
                <h3 style="font-size:1.1rem; margin:0;">Track Recent Order: <strong>#${recentOrder._id.substring(18)}</strong></h3>
                <small style="color:var(--text-secondary)">Placed on ${dateStr} for $${recentOrder.totalAmount.toFixed(2)}</small>
              </div>
              <span class="badge ${isCancelled ? 'bg-danger' : trackerStatus === 'Delivered' ? 'bg-success' : 'bg-info'}">${trackerStatus}</span>
            </div>
            
            ${isCancelled ? `
              <div style="text-align:center; padding:1rem; color:var(--danger)">
                <i class="fa-solid fa-circle-xmark" style="font-size:2rem; margin-bottom:0.5rem;"></i>
                <p style="margin:0; font-weight:600;">This order has been cancelled.</p>
              </div>
            ` : `
              <div class="order-tracker-stepper">
                <div class="stepper-progress-bar" style="width: ${percentage}%"></div>
                
                <div class="tracker-step ${stepsCompleted[0] ? 'completed' : ''} ${stepsActive[0] ? 'active' : ''}">
                  <div class="step-bubble"><i class="fa-solid fa-receipt"></i></div>
                  <div class="step-label">Placed</div>
                </div>
                <div class="tracker-step ${stepsCompleted[1] ? 'completed' : ''} ${stepsActive[1] ? 'active' : ''}">
                  <div class="step-bubble"><i class="fa-solid fa-box-open"></i></div>
                  <div class="step-label">Packed</div>
                </div>
                <div class="tracker-step ${stepsCompleted[2] ? 'completed' : ''} ${stepsActive[2] ? 'active' : ''}">
                  <div class="step-bubble"><i class="fa-solid fa-truck-fast"></i></div>
                  <div class="step-label">Shipped</div>
                </div>
                <div class="tracker-step ${stepsCompleted[3] ? 'completed' : ''} ${stepsActive[3] ? 'active' : ''}">
                  <div class="step-bubble"><i class="fa-solid fa-circle-check"></i></div>
                  <div class="step-label">Delivered</div>
                </div>
              </div>
            `}
            
            <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.5rem;">
              <button class="btn btn-secondary btn-sm view-order-btn" data-id="${recentOrder._id}"><i class="fa-solid fa-receipt"></i> View Details</button>
            </div>
          </div>
        `;

        orders.forEach(order => {
          const orderDate = new Date(order.createdAt).toLocaleDateString();
          const paidBadge = order.isPaid 
            ? `<span class="badge bg-success">Paid</span>`
            : '<span class="badge bg-warning text-dark">Unpaid</span>';
          
          let statusBadge = `<span class="badge bg-info">${order.status}</span>`;
          if (order.status === 'Delivered') statusBadge = `<span class="badge bg-success">Delivered</span>`;
          else if (order.status === 'Cancelled') statusBadge = `<span class="badge bg-danger">Cancelled</span>`;

          ordersRows += `
            <tr>
              <td><strong>#${order._id.substring(18)}</strong></td>
              <td>${orderDate}</td>
              <td><strong>$${order.totalAmount.toFixed(2)}</strong></td>
              <td>${paidBadge}</td>
              <td>${statusBadge}</td>
              <td>
                <button class="btn btn-secondary btn-sm view-order-btn" data-id="${order._id}"><i class="fa-solid fa-eye"></i> View</button>
              </td>
            </tr>
          `;
        });
      }

      // Query recommended products dynamically
      let recommendationsHtml = '';
      let recommendedProducts = [];
      try {
        const prodRes = await apiCall('/api/products?limit=100');
        const allProducts = prodRes.data || [];
        const purchasedCatIds = new Set();
        
        orders.forEach(o => {
          o.items.forEach(item => {
            const p = allProducts.find(prod => prod._id === item.product);
            if (p && p.category) {
              purchasedCatIds.add(p.category._id || p.category);
            }
          });
        });
        
        if (purchasedCatIds.size > 0) {
          recommendedProducts = allProducts.filter(p => {
            const catId = p.category?._id || p.category;
            return purchasedCatIds.has(catId) && !orders.some(o => o.items.some(item => item.product === p._id));
          });
        }
        
        if (recommendedProducts.length === 0) {
          recommendedProducts = allProducts.filter(p => p.rating >= 4).slice(0, 8);
        } else {
          recommendedProducts = recommendedProducts.slice(0, 8);
        }

        if (recommendedProducts.length > 0) {
          let slidesHtml = '';
          recommendedProducts.forEach(p => {
            const imgHtml = p.image
              ? `<img src="${p.image}" alt="${p.name}" class="product-image-real" style="height:100px; object-fit:contain;">`
              : `<i class="fa-solid fa-cubes product-image-placeholder" style="font-size:2rem;"></i>`;
            
            slidesHtml += `
              <div class="swiper-slide product-card" style="padding:1rem; min-height:220px; display:flex; flex-direction:column; justify-content:space-between; background-color:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md);">
                <div class="product-image-container" style="height:100px; display:flex; align-items:center; justify-content:center;">
                  ${imgHtml}
                </div>
                <div class="product-info" style="padding-top:0.5rem; text-align:center; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                  <a href="/product/${p._id}" class="product-title" style="font-size:0.85rem; height:2.4rem; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; font-weight:600; text-decoration:none; color:var(--text-primary);">${p.name}</a>
                  <div style="margin-top:0.5rem; font-weight:700; color:var(--primary);">$${p.price.toFixed(2)}</div>
                </div>
              </div>
            `;
          });

          recommendationsHtml = `
            <div class="dashboard-carousel-section" data-aos="fade-up" style="margin-top: 3rem;">
              <h3 style="font-size:1.25rem; font-weight:600; margin-bottom:1rem; font-family:var(--font-display);"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary)"></i> Recommended For You</h3>
              <div class="swiper recommendations-swiper" style="padding-bottom: 2rem;">
                <div class="swiper-wrapper">
                  ${slidesHtml}
                </div>
                <div class="swiper-pagination"></div>
              </div>
            </div>
          `;
        }
      } catch (err) {
        console.error('Failed to prepare recommendations', err);
      }

      activeViewHtml = `
        ${bannerHtml}
        ${stepperHtml}
        <h2>Order History</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Check statuses or track details of your orders.</p>
        <div class="table-responsive" style="margin-bottom: 2rem;">
          <table class="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${ordersRows}
            </tbody>
          </table>
        </div>
        ${recommendationsHtml}
      `;
    }

    viewContent.innerHTML = activeViewHtml;

    // --- BIND TRIGGERS ---
    if (activeTab === 'orders' && document.querySelector('.recommendations-swiper')) {
      new Swiper('.recommendations-swiper', {
        slidesPerView: 1,
        spaceBetween: 20,
        pagination: {
          el: '.swiper-pagination',
          clickable: true
        },
        breakpoints: {
          576: { slidesPerView: 2 },
          768: { slidesPerView: 3 },
          992: { slidesPerView: 4 }
        }
      });
    }

    bindSpaLinks(viewContent);

    viewContent.querySelectorAll('.view-order-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        viewOrderDetail(btn.getAttribute('data-id'));
      });
    });

    viewContent.querySelectorAll('.remove-wishlist-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await toggleWishlistState(id);
        showCustomerDashboardPage();
      });
    });

    // Forms triggers
    const addressForm = document.getElementById('address-update-form');
    addressForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const street = document.getElementById('address-street').value;
      const city = document.getElementById('address-city').value;
      const postal = document.getElementById('address-postal').value;
      const country = document.getElementById('address-country').value;
      const phone = document.getElementById('address-phone').value;

      localStorage.setItem('alpha_profile_address', street);
      localStorage.setItem('alpha_profile_city', city);
      localStorage.setItem('alpha_profile_postal', postal);
      localStorage.setItem('alpha_profile_country', country);
      localStorage.setItem('alpha_profile_phone', phone);

      Swal.fire({
        title: 'Address Updated',
        text: 'Your shipping details have been saved successfully.',
        icon: 'success',
        confirmButtonColor: 'var(--primary)'
      });
      showCustomerDashboardPage();
    });

    const paymentForm = document.getElementById('payment-update-form');
    paymentForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const holder = document.getElementById('card-holder-name').value;
      const num = document.getElementById('card-number').value;
      const expiry = document.getElementById('card-expiry-date').value;

      localStorage.setItem('alpha_profile_card_name', holder);
      localStorage.setItem('alpha_profile_card_num', num);
      localStorage.setItem('alpha_profile_card_expiry', expiry);

      Swal.fire({
        title: 'Card Saved',
        text: 'Your payment card was stored securely in local profile.',
        icon: 'success',
        confirmButtonColor: 'var(--primary)'
      });
      showCustomerDashboardPage();
    });

    const profileForm = document.getElementById('profile-update-form');
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profile-name').value;
      const email = document.getElementById('profile-email').value;

      try {
        const res = await apiCall('/api/auth/profile', 'PUT', { name, email });
        AppState.user = res.data;
        localStorage.setItem('alpha_user', JSON.stringify(res.data));
        renderUserNavbarArea();
        
        Swal.fire({
          title: 'Profile Updated',
          text: 'Your account credentials have been saved successfully.',
          icon: 'success',
          confirmButtonColor: 'var(--primary)'
        });
        showCustomerDashboardPage();
      } catch (err) {}
    });

    const passwordForm = document.getElementById('profile-password-form');
    passwordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('profile-new-password').value;
      const confirmPass = document.getElementById('profile-confirm-password').value;

      if (newPass !== confirmPass) {
        showToast('Passwords do not match', 'error');
        return;
      }

      try {
        await apiCall('/api/auth/profile', 'PUT', { password: newPass });
        document.getElementById('profile-new-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        
        Swal.fire({
          title: 'Password Changed',
          text: 'Your security password was updated successfully.',
          icon: 'success',
          confirmButtonColor: 'var(--primary)'
        });
      } catch (err) {}
    });

    if (showOrderId) {
      viewOrderDetail(showOrderId);
    }

  } catch (err) {
    console.error('Customer dashboard load error', err);
    viewContent.innerHTML = `<div style="text-align:center; padding:3rem;"><i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i><p style="color:var(--danger)">Failed to load dashboard: ${err.message}</p></div>`;
  }
}

async function viewOrderDetail(orderId) {
  showModal(`
    <div class="loader-container" style="min-height:200px;">
      <div class="loader"></div>
    </div>
  `);

  try {
    const response = await apiCall(`/api/orders/${orderId}`);
    const order = response.data;
    
    const dateStr = new Date(order.createdAt).toLocaleString();
    const paidHtml = order.isPaid 
      ? `<span class="badge bg-success">Paid on ${new Date(order.paidAt).toLocaleString()}</span>`
      : '<span class="badge bg-warning text-dark">Pending Payment</span>';
    
    const deliveredHtml = order.isDelivered
      ? `<span class="badge bg-success">Delivered on ${new Date(order.deliveredAt).toLocaleString()}</span>`
      : `<span class="badge bg-info">Status: ${order.status}</span>`;

    let itemsRows = '';
    order.items.forEach(item => {
      itemsRows += `
        <div class="checkout-summary-item" style="border-bottom:1px solid var(--border-color); padding: 0.5rem 0;">
          <span>${item.name} x ${item.quantity}</span>
          <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      `;
    });

    const modalHtml = `
      <h3 class="modal-title">Order Details</h3>
      <p style="font-size: 0.85rem; color:var(--text-tertiary); margin-bottom: 1.5rem;">ID: #${order._id}</p>
      
      <div style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div>
          <p><strong>Placed On:</strong> ${dateStr}</p>
          <p><strong>Customer:</strong> ${order.user.name}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        </div>
        <div>
          <p><strong>Payment Status:</strong> ${paidHtml}</p>
          <p><strong>Delivery Status:</strong> ${deliveredHtml}</p>
          <p><strong>Shipping Address:</strong> ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}, ${order.shippingAddress.country}</p>
        </div>
      </div>
      
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding:1rem; margin-bottom:1.5rem;">
        <h4 style="margin-bottom:0.75rem;">Items Ordered</h4>
        ${itemsRows}
        <div class="checkout-summary-item total" style="margin-top:0.75rem; border-top:1px solid var(--border-color); padding-top:0.5rem; font-weight:800; font-size:1.1rem;">
          <span>Total Paid</span>
          <span>$${order.totalAmount.toFixed(2)}</span>
        </div>
      </div>
      
      <button class="btn btn-secondary btn-block btn-sm" onclick="closeModal()">Close</button>
    `;

    showModal(modalHtml);
  } catch (error) {
    showModal(`
      <p style="text-align:center; color:var(--danger)">Error loading order: ${error.message}</p>
      <button class="btn btn-secondary btn-block btn-sm" onclick="closeModal()" style="margin-top:1rem;">Close</button>
    `);
  }
}

async function showAdminPage() {
  if (window.location.pathname === '/admin/dashboard') {
    showAdminDashboardPage();
  } else {
    navigateTo('/admin/dashboard');
  }
}

// 6a. ADMIN DASHBOARD PANEL
async function showAdminDashboardPage() {
  if (!AppState.user || !AppState.user.isAdmin) {
    navigateTo('/login');
    return;
  }

  const appRoot = document.getElementById('app-root');
  const queryParams = new URLSearchParams(window.location.search);
  const activeTab = queryParams.get('tab') || 'stats';

  // Render Layout with Skeleton Loader immediately
  appRoot.innerHTML = `
    <div class="dashboard-layout fade-in">
      <aside class="dashboard-sidebar" data-aos="fade-right">
        <h4 style="padding:0.75rem; text-transform:uppercase; font-size:0.75rem; color:var(--text-tertiary);">Admin Navigation</h4>
        <a href="/admin/dashboard?tab=stats" class="sidebar-link ${activeTab === 'stats' ? 'active' : ''}"><i class="fa-solid fa-chart-line"></i> Dashboard</a>
        <a href="/admin/dashboard?tab=products" class="sidebar-link ${activeTab === 'products' ? 'active' : ''}"><i class="fa-solid fa-boxes-stacked"></i> Products</a>
        <a href="/admin/dashboard?tab=categories" class="sidebar-link ${activeTab === 'categories' ? 'active' : ''}"><i class="fa-solid fa-layer-group"></i> Categories</a>
        <a href="/admin/dashboard?tab=orders" class="sidebar-link ${activeTab === 'orders' ? 'active' : ''}"><i class="fa-solid fa-truck-fast"></i> Orders</a>
        <a href="/admin/dashboard?tab=users" class="sidebar-link ${activeTab === 'users' ? 'active' : ''}"><i class="fa-solid fa-users-gear"></i> Customers</a>
        <a href="/admin/dashboard?tab=reports" class="sidebar-link ${activeTab === 'reports' ? 'active' : ''}"><i class="fa-solid fa-chart-pie"></i> Reports</a>
        <a href="/admin/dashboard?tab=settings" class="sidebar-link ${activeTab === 'settings' ? 'active' : ''}"><i class="fa-solid fa-gears"></i> Settings</a>
      </aside>
      
      <div class="dashboard-view" id="admin-view-content" data-aos="fade-left">
        <!-- Skeleton Loader -->
        <div class="skeleton-loader">
          <div class="skeleton-title"></div>
          <div class="skeleton-text" style="width: 80%;"></div>
          <div class="skeleton-text" style="width: 60%;"></div>
          <div class="stats-grid" style="margin-top: 2rem;">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind Sidebar routing immediately
  appRoot.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.getAttribute('href'));
    });
  });

  const viewContent = document.getElementById('admin-view-content');

  // Asynchronously fetch stats and load views
  try {
    let stats = null;
    try {
      const statsRes = await apiCall('/api/admin/stats');
      stats = statsRes.data;
    } catch (err) {
      console.error('Failed to load stats', err);
      viewContent.innerHTML = `<div style="text-align:center; padding:3rem;"><i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i><p style="color:var(--danger)">Error loading stats: ${err.message}</p></div>`;
      return;
    }

    let activeViewHtml = '';

    if (activeTab === 'stats') {
      let recentOrdersHtml = '';
      if (!stats.recentOrders || stats.recentOrders.length === 0) {
        recentOrdersHtml = '<tr><td colspan="5" style="text-align:center; color:var(--text-tertiary)">No orders placed yet.</td></tr>';
      } else {
        stats.recentOrders.forEach(o => {
          recentOrdersHtml += `
            <tr>
              <td><strong>#${o._id.substring(18)}</strong></td>
              <td>${o.user?.name || 'Customer'}</td>
              <td>${new Date(o.createdAt).toLocaleDateString()}</td>
              <td><span class="badge ${o.status === 'Delivered' ? 'bg-success' : o.status === 'Cancelled' ? 'bg-danger' : 'bg-info'}">${o.status}</span></td>
              <td><strong>$${o.totalAmount.toFixed(2)}</strong></td>
            </tr>
          `;
        });
      }

      let lowStockHtml = '';
      if (!stats.lowStockProducts || stats.lowStockProducts.length === 0) {
        lowStockHtml = '<li style="color:var(--success); list-style:none; padding:1.25rem; text-align:center;"><i class="fa-solid fa-circle-check" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i> All products have sufficient stock.</li>';
      } else {
        stats.lowStockProducts.forEach(p => {
          lowStockHtml += `
            <li style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
              <span style="font-size:0.85rem; font-weight:500;">${p.name}</span>
              <span class="badge bg-danger" style="font-size:0.75rem;">${p.stock} left</span>
            </li>
          `;
        });
      }

      let topSellingHtml = '';
      try {
        const prodRes = await apiCall('/api/products?limit=100');
        const allProducts = prodRes.data || [];
        const allOrdersRes = await apiCall('/api/admin/orders');
        const allOrders = allOrdersRes.data || [];
        
        const productSales = {};
        allOrders.forEach(order => {
          if (order.status !== 'Cancelled') {
            order.items.forEach(item => {
              productSales[item.product] = (productSales[item.product] || 0) + item.quantity;
            });
          }
        });

        const topSellingList = Object.entries(productSales)
          .map(([id, qty]) => {
            const prod = allProducts.find(p => p._id === id);
            return {
              id,
              qty,
              name: prod ? prod.name : 'Unknown Product',
              image: prod ? prod.image : ''
            };
          })
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);

        if (topSellingList.length === 0) {
          topSellingHtml = '<li style="color:var(--text-tertiary); list-style:none; text-align:center; padding:1.25rem;">No items sold yet.</li>';
        } else {
          topSellingList.forEach(item => {
            const imgHtml = item.image 
              ? `<img src="${item.image}" alt="${item.name}" style="width:40px; height:40px; border-radius:var(--radius-sm); object-fit:cover;">`
              : `<div style="width:40px; height:40px; border-radius:var(--radius-sm); background-color:var(--border-color); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-image" style="color:var(--text-tertiary)"></i></div>`;
            topSellingHtml += `
              <li style="display:flex; align-items:center; gap:0.75rem; margin-bottom: 0.75rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                ${imgHtml}
                <div style="flex:1; min-width:0;">
                  <h5 style="font-size:0.85rem; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</h5>
                  <small style="color:var(--text-secondary);">${item.qty} units sold</small>
                </div>
              </li>
            `;
          });
        }
      } catch (err) {
        console.error('Failed to compute top selling products', err);
        topSellingHtml = '<li style="color:var(--danger); list-style:none;">Error loading top selling products.</li>';
      }

      let svgChartHtml = '';
      try {
        const allOrdersRes = await apiCall('/api/admin/orders');
        const allOrders = allOrdersRes.data || [];
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          last7Days.push({
            dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            dateObj: d,
            revenue: 0
          });
        }

        allOrders.forEach(o => {
          if (o.isPaid) {
            const oDate = new Date(o.createdAt);
            const matchingDay = last7Days.find(d => d.dateObj.toDateString() === oDate.toDateString());
            if (matchingDay) {
              matchingDay.revenue += o.totalAmount;
            }
          }
        });

        const chartWidth = 500;
        const chartHeight = 150;
        const padding = 30;
        const maxRevenue = Math.max(...last7Days.map(d => d.revenue), 100);
        const points = last7Days.map((d, index) => {
          const x = padding + (index * (chartWidth - padding * 2) / (last7Days.length - 1));
          const y = chartHeight - padding - (d.revenue * (chartHeight - padding * 2) / maxRevenue);
          return { x, y, revenue: d.revenue, label: d.dateStr };
        });

        const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');

        svgChartHtml = `
          <div class="chart-container">
            <div class="chart-header">
              <h3>Revenue Trend (Last 7 Days)</h3>
              <div style="font-size:0.8rem; color:var(--text-secondary)">Max: $${maxRevenue.toFixed(2)}</div>
            </div>
            <div class="chart-svg-wrapper">
              <svg viewBox="0 0 ${chartWidth} ${chartHeight}">
                <line x1="${padding}" y1="${padding}" x2="${chartWidth - padding}" y2="${padding}" stroke="var(--border-color)" stroke-dasharray="4" />
                <line x1="${padding}" y1="${chartHeight / 2}" x2="${chartWidth - padding}" y2="${chartHeight / 2}" stroke="var(--border-color)" stroke-dasharray="4" />
                <line x1="${padding}" y1="${chartHeight - padding}" x2="${chartWidth - padding}" y2="${chartHeight - padding}" stroke="var(--border-color)" />
                
                <polyline fill="none" stroke="var(--primary)" stroke-width="3" points="${pointsStr}" />
                
                ${points.map(p => `
                  <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--bg-secondary)" stroke="var(--primary)" stroke-width="2" style="cursor:pointer;" class="chart-point" data-revenue="$${p.revenue.toFixed(2)}" data-date="${p.label}" />
                `).join('')}
                
                ${points.map(p => `
                  <text x="${p.x}" y="${chartHeight - 10}" fill="var(--text-secondary)" font-size="8" text-anchor="middle">${p.label}</text>
                `).join('')}
              </svg>
              <div class="chart-tooltip" id="admin-chart-tooltip"></div>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Failed to render sales chart', err);
        svgChartHtml = '<p style="color:var(--danger)">Error rendering sales chart</p>';
      }

      activeViewHtml = `
        <h2>Admin Overview</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">Platform health checks and metrics.</p>
        
        <div class="stats-grid">
          <div class="stat-widget" data-aos="fade-up">
            <div class="stat-icon"><i class="fa-solid fa-sack-dollar"></i></div>
            <div class="stat-details">
              <h4>Total Revenue</h4>
              <div class="value">$${stats.totalRevenue.toFixed(2)}</div>
              <div class="stat-trend positive"><i class="fa-solid fa-arrow-trend-up"></i> +12.4% this week</div>
            </div>
          </div>
          <div class="stat-widget" data-aos="fade-up" data-aos-delay="50">
            <div class="stat-icon blue"><i class="fa-solid fa-cart-shopping"></i></div>
            <div class="stat-details">
              <h4>Total Sales</h4>
              <div class="value">${stats.totalOrders}</div>
              <div class="stat-trend positive"><i class="fa-solid fa-arrow-trend-up"></i> +8.2% this week</div>
            </div>
          </div>
          <div class="stat-widget" data-aos="fade-up" data-aos-delay="100">
            <div class="stat-icon amber"><i class="fa-solid fa-box"></i></div>
            <div class="stat-details">
              <h4>Products</h4>
              <div class="value">${stats.totalProducts}</div>
              <div class="stat-trend positive"><i class="fa-solid fa-circle-check"></i> Stock healthy</div>
            </div>
          </div>
          <div class="stat-widget" data-aos="fade-up" data-aos-delay="150">
            <div class="stat-icon red"><i class="fa-solid fa-users"></i></div>
            <div class="stat-details">
              <h4>Total Customers</h4>
              <div class="value">${stats.totalUsers}</div>
              <div class="stat-trend positive"><i class="fa-solid fa-arrow-trend-up"></i> +4.5% this week</div>
            </div>
          </div>
        </div>

        <div class="quick-actions-card" data-aos="fade-up">
          <h3 style="font-size:1.1rem; margin-bottom:0.75rem;">Quick Actions</h3>
          <div class="quick-actions-grid">
            <div class="quick-action-btn" id="qa-add-product"><i class="fa-solid fa-plus-circle"></i><span>Add Product</span></div>
            <div class="quick-action-btn" id="qa-manage-orders"><i class="fa-solid fa-receipt"></i><span>Manage Orders</span></div>
            <div class="quick-action-btn" id="qa-manage-users"><i class="fa-solid fa-users-gear"></i><span>Manage Users</span></div>
            <div class="quick-action-btn" id="qa-view-reports"><i class="fa-solid fa-chart-pie"></i><span>View Reports</span></div>
          </div>
        </div>

        ${svgChartHtml}
        
        <div class="admin-columns" style="margin-top: 1.5rem; display:grid; grid-template-columns: 2fr 1fr; gap:1.5rem;">
          <div class="checkout-card" style="padding:1.5rem; margin-bottom:0;" data-aos="fade-right">
            <h3 style="font-size:1.15rem; margin-bottom:1rem;">Recent Orders</h3>
            <div class="table-responsive">
              <table class="table" style="font-size:0.85rem; margin:0;">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentOrdersHtml}
                </tbody>
              </table>
            </div>
          </div>
          
          <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <div class="checkout-card" style="padding:1.5rem; margin-bottom:0;" data-aos="fade-left">
              <h3 style="font-size:1.15rem; margin-bottom:1rem; color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Stock Warnings</h3>
              <ul style="padding-left:0; font-size:0.9rem; margin:0;">
                ${lowStockHtml}
              </ul>
            </div>

            <div class="checkout-card" style="padding:1.5rem; margin-bottom:0;" data-aos="fade-left" data-aos-delay="50">
              <h3 style="font-size:1.15rem; margin-bottom:1rem; color:var(--primary);"><i class="fa-solid fa-crown"></i> Top Products</h3>
              <ul style="padding-left:0; font-size:0.9rem; margin:0;">
                ${topSellingHtml}
              </ul>
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === 'categories') {
      const catRes = await apiCall('/api/categories');
      const cats = catRes.data || [];
      let catRows = '';
      if (cats.length === 0) {
        catRows = '<tr><td colspan="4" style="text-align:center; color:var(--text-tertiary)">No categories created yet. Click "Create Category".</td></tr>';
      } else {
        cats.forEach(c => {
          catRows += `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.description || '-'}</td>
              <td><code>${c.slug}</code></td>
              <td>
                <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${c._id}" data-name="${c.name}" data-desc="${c.description}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm delete-cat-btn" data-id="${c._id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
          `;
        });
      }
      activeViewHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
          <div>
            <h2>Manage Categories</h2>
            <p style="font-size:0.9rem; color:var(--text-secondary); margin:0;">Create categories to assign to your products.</p>
          </div>
          <button class="btn btn-primary btn-sm btn-ripple" id="admin-create-cat-btn"><i class="fa-solid fa-plus"></i> Create Category</button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Category Name</th>
                <th>Description</th>
                <th>Slug Link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${catRows}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'products') {
      const prodRes = await apiCall('/api/products?limit=100');
      const prods = prodRes.data || [];
      const catRes = await apiCall('/api/categories');
      AppState.categories = catRes.data || [];

      let prodRows = '';
      if (prods.length === 0) {
        prodRows = '<tr><td colspan="7" style="text-align:center; color:var(--text-tertiary)">No products created yet. Click "Add Product".</td></tr>';
      } else {
        prods.forEach(p => {
          const catName = p.category?.name || p.category || '-';
          prodRows += `
            <tr>
              <td>
                ${p.image ? `<img src="${p.image}" alt="${p.name}" style="width:40px; height:40px; border-radius:var(--radius-sm); object-fit:cover;">` : '<i class="fa-solid fa-cube" style="font-size:1.5rem; color:var(--text-tertiary)"></i>'}
              </td>
              <td><strong>${p.name}</strong></td>
              <td>${p.brand || 'Generic'}</td>
              <td>${catName}</td>
              <td>$${p.price.toFixed(2)}</td>
              <td>${p.stock}</td>
              <td>
                <button class="btn btn-secondary btn-sm edit-prod-btn" 
                  data-id="${p._id}" 
                  data-name="${p.name}" 
                  data-desc="${p.description}" 
                  data-price="${p.price}" 
                  data-discount="${p.discount}" 
                  data-brand="${p.brand}" 
                  data-cat="${p.category?._id || p.category}" 
                  data-image="${p.image}" 
                  data-images="${p.images?.join(',') || ''}" 
                  data-stock="${p.stock}" 
                  data-featured="${p.isFeatured}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm delete-prod-btn" data-id="${p._id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
          `;
        });
      }

      activeViewHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
          <div>
            <h2>Manage Products</h2>
            <p style="font-size:0.9rem; color:var(--text-secondary); margin:0;">Create, edit, or delete platform inventory products.</p>
          </div>
          <button class="btn btn-primary btn-sm btn-ripple" id="admin-create-prod-btn"><i class="fa-solid fa-plus"></i> Add Product</button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${prodRows}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'orders') {
      const ordersRes = await apiCall('/api/admin/orders');
      const orders = ordersRes.data || [];

      let orderRows = '';
      if (orders.length === 0) {
        orderRows = '<tr><td colspan="7" style="text-align:center; color:var(--text-tertiary)">No orders placed yet.</td></tr>';
      } else {
        orders.forEach(o => {
          const dateStr = new Date(o.createdAt).toLocaleDateString();
          orderRows += `
            <tr>
              <td><strong>#${o._id.substring(18)}</strong></td>
              <td>${o.user?.name || 'Customer'}</td>
              <td>${dateStr}</td>
              <td>
                <select class="filter-select admin-order-pay-status" data-id="${o._id}" style="padding: 0.2rem 0.4rem; font-size:0.85rem;">
                  <option value="false" ${!o.isPaid ? 'selected' : ''}>Unpaid</option>
                  <option value="true" ${o.isPaid ? 'selected' : ''}>Paid</option>
                </select>
              </td>
              <td>
                <select class="filter-select admin-order-status" data-id="${o._id}" style="padding: 0.2rem 0.4rem; font-size:0.85rem;">
                  <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                  <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                  <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </td>
              <td><strong>$${o.totalAmount.toFixed(2)}</strong></td>
              <td>
                <button class="btn btn-secondary btn-sm admin-view-order" data-id="${o._id}"><i class="fa-solid fa-eye"></i> View</button>
              </td>
            </tr>
          `;
        });
      }

      activeViewHtml = `
        <h2>Manage Orders</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom: 1.5rem;">Update order delivery stages and payment status.</p>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Delivery Status</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${orderRows}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'users') {
      const usersRes = await apiCall('/api/admin/users');
      const usersList = usersRes.data || [];

      let userRows = '';
      usersList.forEach(u => {
        const isSelf = u._id === AppState.user._id;
        userRows += `
          <tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.email}</td>
            <td>
              <select class="filter-select admin-user-role" data-id="${u._id}" ${isSelf ? 'disabled' : ''} style="padding: 0.2rem 0.4rem; font-size:0.85rem;">
                <option value="false" ${!u.isAdmin ? 'selected' : ''}>Customer</option>
                <option value="true" ${u.isAdmin ? 'selected' : ''}>Administrator</option>
              </select>
            </td>
            <td>
              ${isSelf ? '<span class="badge bg-info">Logged In</span>' : `<button class="btn btn-danger btn-sm admin-delete-user" data-id="${u._id}"><i class="fa-solid fa-trash"></i></button>`}
            </td>
          </tr>
        `;
      });

      activeViewHtml = `
        <h2>Manage Users</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom: 1.5rem;">Modify access roles or delete platform accounts.</p>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${userRows}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'reports') {
      const allOrdersRes = await apiCall('/api/admin/orders');
      const allOrders = allOrdersRes.data || [];
      const prodRes = await apiCall('/api/products?limit=100');
      const allProducts = prodRes.data || [];
      
      const totalRev = stats.totalRevenue;
      const totalSales = stats.totalOrders;
      const cancelledSales = allOrders.filter(o => o.status === 'Cancelled').length;
      
      const categorySales = {};
      allOrders.forEach(order => {
        if (order.status !== 'Cancelled') {
          order.items.forEach(item => {
            const prod = allProducts.find(p => p._id === item.product);
            const catName = prod?.category?.name || 'Other';
            categorySales[catName] = (categorySales[catName] || 0) + (item.price * item.quantity);
          });
        }
      });

      let categoryRows = '';
      Object.entries(categorySales).forEach(([cat, val]) => {
        categoryRows += `
          <tr>
            <td><strong>${cat}</strong></td>
            <td>$${val.toFixed(2)}</td>
            <td>${((val / (totalRev || 1)) * 100).toFixed(1)}% of total</td>
          </tr>
        `;
      });
      if (categoryRows === '') {
        categoryRows = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary);">No sales reports available.</td></tr>';
      }

      activeViewHtml = `
        <h2>View Reports</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom: 1.5rem;">Business metrics and sales breakdowns.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
          <div class="checkout-card" style="padding:1.5rem; text-align:center;">
            <h4>Active Sales</h4>
            <div style="font-size:2rem; font-weight:700; color:var(--primary);">${totalSales - cancelledSales}</div>
          </div>
          <div class="checkout-card" style="padding:1.5rem; text-align:center;">
            <h4>Cancelled Orders</h4>
            <div style="font-size:2rem; font-weight:700; color:var(--danger);">${cancelledSales}</div>
          </div>
          <div class="checkout-card" style="padding:1.5rem; text-align:center;">
            <h4>Avg. Order Value</h4>
            <div style="font-size:2rem; font-weight:700; color:#3b82f6;">$${(totalRev / (totalSales - cancelledSales || 1)).toFixed(2)}</div>
          </div>
        </div>

        <div class="checkout-card" style="padding:1.5rem;">
          <h3 style="font-size:1.15rem; margin-bottom:1rem;">Sales by Category</h3>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Revenue</th>
                  <th>Contribution</th>
                </tr>
              </thead>
              <tbody>
                ${categoryRows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeTab === 'settings') {
      activeViewHtml = `
        <h2>Platform Settings</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom: 1.5rem;">Manage store details and parameters.</p>
        
        <form class="checkout-card" id="admin-settings-form">
          <div class="form-group" style="margin-bottom:1rem;">
            <label for="store-name">Store Name</label>
            <input type="text" id="store-name" class="form-control" value="AlphaShop" readonly>
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label for="admin-email">Support Contact Email</label>
            <input type="email" id="admin-email" class="form-control" value="support@alphashop.com" readonly>
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label for="store-currency">Currency Code</label>
            <input type="text" id="store-currency" class="form-control" value="USD ($)" readonly>
          </div>
          <div class="form-group" style="margin-bottom:1.5rem;">
            <label for="loyalty-rate">Loyalty Reward Points Rate</label>
            <input type="text" id="loyalty-rate" class="form-control" value="10 Points per $1 spent" readonly>
          </div>
          <button type="button" class="btn btn-primary" onclick="showToast('Settings saved (mocked)', 'success')">Save Settings</button>
        </form>
      `;
    }

    viewContent.innerHTML = activeViewHtml;

    // --- BIND EVENT TRIGGERS ---
    if (activeTab === 'stats') {
      const points = viewContent.querySelectorAll('.chart-point');
      const tooltip = document.getElementById('admin-chart-tooltip');
      points.forEach(pt => {
        pt.addEventListener('mouseover', (e) => {
          const rev = pt.getAttribute('data-revenue');
          const dt = pt.getAttribute('data-date');
          tooltip.innerHTML = `<strong>${dt}</strong>: ${rev}`;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${e.offsetX + 10}px`;
          tooltip.style.top = `${e.offsetY - 25}px`;
        });
        pt.addEventListener('mousemove', (e) => {
          tooltip.style.left = `${e.offsetX + 10}px`;
          tooltip.style.top = `${e.offsetY - 25}px`;
        });
        pt.addEventListener('mouseout', () => {
          tooltip.style.opacity = '0';
        });
      });

      document.getElementById('qa-add-product')?.addEventListener('click', () => {
        openProductModal();
      });
      document.getElementById('qa-manage-orders')?.addEventListener('click', () => {
        navigateTo('/admin/dashboard?tab=orders');
      });
      document.getElementById('qa-manage-users')?.addEventListener('click', () => {
        navigateTo('/admin/dashboard?tab=users');
      });
      document.getElementById('qa-view-reports')?.addEventListener('click', () => {
        navigateTo('/admin/dashboard?tab=reports');
      });
    }

    document.getElementById('admin-create-cat-btn')?.addEventListener('click', () => {
      openCategoryModal();
    });

    viewContent.querySelectorAll('.edit-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openCategoryModal({
          id: btn.getAttribute('data-id'),
          name: btn.getAttribute('data-name'),
          description: btn.getAttribute('data-desc')
        });
      });
    });

    viewContent.querySelectorAll('.delete-cat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        Swal.fire({
          title: 'Delete Category?',
          text: 'Are you sure you want to permanently delete this category? Products belonging to this category will block deletion.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: 'var(--danger)',
          confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
          if (result.isConfirmed) {
            try {
              await apiCall(`/api/categories/${id}`, 'DELETE');
              showToast('Category deleted successfully', 'success');
              showAdminDashboardPage();
            } catch (err) {}
          }
        });
      });
    });

    document.getElementById('admin-create-prod-btn')?.addEventListener('click', () => {
      openProductModal();
    });

    viewContent.querySelectorAll('.edit-prod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const imagesStr = btn.getAttribute('data-images');
        openProductModal({
          id: btn.getAttribute('data-id'),
          name: btn.getAttribute('data-name'),
          description: btn.getAttribute('data-desc'),
          price: btn.getAttribute('data-price'),
          discount: btn.getAttribute('data-discount') || 0,
          brand: btn.getAttribute('data-brand') || 'Generic',
          category: btn.getAttribute('data-cat'),
          image: btn.getAttribute('data-image'),
          images: imagesStr ? imagesStr.split(',') : [],
          stock: btn.getAttribute('data-stock'),
          featured: btn.getAttribute('data-featured') === 'true'
        });
      });
    });

    viewContent.querySelectorAll('.delete-prod-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        Swal.fire({
          title: 'Delete Product?',
          text: 'Are you sure you want to permanently delete this product from the inventory?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: 'var(--danger)',
          confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
          if (result.isConfirmed) {
            try {
              await apiCall(`/api/products/${id}`, 'DELETE');
              showToast('Product deleted successfully', 'success');
              showAdminDashboardPage();
            } catch (err) {}
          }
        });
      });
    });

    viewContent.querySelectorAll('.admin-order-pay-status').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.getAttribute('data-id');
        const isPaid = select.value === 'true';
        try {
          await apiCall(`/api/admin/orders/${id}`, 'PUT', { isPaid });
          showToast('Payment status updated', 'success');
          showAdminDashboardPage();
        } catch (err) {}
      });
    });

    viewContent.querySelectorAll('.admin-order-status').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.getAttribute('data-id');
        const status = select.value;
        try {
          await apiCall(`/api/admin/orders/${id}`, 'PUT', { status, isDelivered: status === 'Delivered' });
          showToast('Delivery status updated', 'success');
          showAdminDashboardPage();
        } catch (err) {}
      });
    });

    viewContent.querySelectorAll('.admin-view-order').forEach(btn => {
      btn.addEventListener('click', () => {
        viewOrderDetail(btn.getAttribute('data-id'));
      });
    });

    viewContent.querySelectorAll('.admin-user-role').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.getAttribute('data-id');
        const isAdmin = select.value === 'true';
        try {
          await apiCall(`/api/admin/users/${id}/role`, 'PUT', { isAdmin });
          showToast('User permissions role updated', 'success');
          showAdminDashboardPage();
        } catch (err) {}
      });
    });

    viewContent.querySelectorAll('.admin-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        Swal.fire({
          title: 'Delete User account?',
          text: 'Are you sure you want to permanently delete this user profile? This action is irreversible.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: 'var(--danger)',
          confirmButtonText: 'Yes, delete!'
        }).then(async (result) => {
          if (result.isConfirmed) {
            try {
              await apiCall(`/api/admin/users/${id}`, 'DELETE');
              showToast('User deleted successfully', 'success');
              showAdminDashboardPage();
            } catch (err) {}
          }
        });
      });
    });

  } catch (err) {
    console.error('Admin dashboard load error', err);
    viewContent.innerHTML = `<div style="text-align:center; padding:3rem;"><i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i><p style="color:var(--danger)">Failed to load dashboard data: ${err.message}</p></div>`;
  }
}

function openCategoryModal(cat = null) {
  const title = cat ? 'Edit Category' : 'Create Category';
  const nameVal = cat ? cat.name : '';
  const descVal = cat ? cat.description : '';

  const html = `
    <h3 class="modal-title">${title}</h3>
    <form id="modal-cat-form">
      <div class="form-group" style="margin-bottom:1rem;">
        <label for="modal-cat-name">Category Name</label>
        <input type="text" id="modal-cat-name" class="form-control" required value="${nameVal}" placeholder="e.g. Electronics">
      </div>
      <div class="form-group">
        <label for="modal-cat-desc">Description</label>
        <textarea id="modal-cat-desc" class="form-control" placeholder="Optional description..." style="height:100px;">${descVal}</textarea>
      </div>
      
      <div style="display:flex; gap:1rem; margin-top:2rem;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()" style="flex:1;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">Save Category</button>
      </div>
    </form>
  `;

  showModal(html);

  document.getElementById('modal-cat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('modal-cat-name').value,
      description: document.getElementById('modal-cat-desc').value
    };

    try {
      if (cat) {
        await apiCall(`/api/categories/${cat.id}`, 'PUT', payload);
        showToast('Category updated successfully', 'success');
      } else {
        await apiCall('/api/categories', 'POST', payload);
        showToast('Category created successfully', 'success');
      }
      closeModal();
      showAdminPage();
    } catch (err) {}
  });
}

function openProductModal(prod = null) {
  const title = prod ? 'Edit Product' : 'Create Product';
  const nameVal = prod ? prod.name : '';
  const descVal = prod ? prod.description : '';
  const priceVal = prod ? prod.price : '';
  const discountVal = prod ? prod.discount : 0;
  const brandVal = prod ? prod.brand : '';
  const catVal = prod ? prod.category : '';
  const imageVal = prod ? prod.image : '';
  const stockVal = prod ? prod.stock : '0';
  const isFeatured = prod ? prod.featured : false;
  
  let uploadedImages = prod && prod.images ? [...prod.images] : [];

  let catOptionsHtml = '<option value="">-- Select Category --</option>';
  AppState.categories.forEach(c => {
    catOptionsHtml += `<option value="${c._id}" ${c._id === catVal ? 'selected' : ''}>${c.name}</option>`;
  });

  const renderUploadedImagesList = () => {
    const previewContainer = document.getElementById('product-images-preview-list');
    if (!previewContainer) return;
    
    if (uploadedImages.length === 0) {
      previewContainer.innerHTML = '<span style="color:var(--text-tertiary); font-size:0.85rem;">No files uploaded yet.</span>';
      return;
    }
    
    let html = '';
    uploadedImages.forEach((img, idx) => {
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.25rem; background:var(--bg-tertiary); padding:0.25rem 0.5rem; border-radius: var(--radius-sm); border:1px solid var(--border-color); font-size:0.8rem;">
          <a href="${img}" target="_blank" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:80%;">${img}</a>
          <button type="button" class="btn-icon delete-uploaded-img-btn" data-index="${idx}" style="color:var(--danger)"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;
    });
    previewContainer.innerHTML = html;

    // Bind deletes
    previewContainer.querySelectorAll('.delete-uploaded-img-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = Number(btn.getAttribute('data-index'));
        uploadedImages.splice(index, 1);
        renderUploadedImagesList();
      });
    });
  };

  const html = `
    <h3 class="modal-title">${title}</h3>
    <form id="modal-prod-form">
      <div class="form-group" style="margin-bottom:0.75rem;">
        <label for="modal-prod-name">Product Name</label>
        <input type="text" id="modal-prod-name" class="form-control" required value="${nameVal}" placeholder="e.g. Wireless Mouse">
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
        <div class="form-group">
          <label for="modal-prod-price">Price ($)</label>
          <input type="number" step="0.01" id="modal-prod-price" class="form-control" required value="${priceVal}" placeholder="19.99">
        </div>
        <div class="form-group">
          <label for="modal-prod-discount">Discount (%)</label>
          <input type="number" id="modal-prod-discount" class="form-control" value="${discountVal}" placeholder="0" min="0" max="99">
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
        <div class="form-group">
          <label for="modal-prod-brand">Brand</label>
          <input type="text" id="modal-prod-brand" class="form-control" value="${brandVal}" required placeholder="e.g. Logitech">
        </div>
        <div class="form-group">
          <label for="modal-prod-stock">Stock Quantity</label>
          <input type="number" id="modal-prod-stock" class="form-control" required value="${stockVal}" placeholder="10">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0.75rem;">
        <label for="modal-prod-cat">Category</label>
        <select id="modal-prod-cat" class="form-control" required>
          ${catOptionsHtml}
        </select>
      </div>

      <!-- File upload area (Multer backend check) -->
      <div class="form-group" style="margin-bottom:0.75rem; border:1px dashed var(--border-color); padding: 0.75rem; border-radius: var(--radius-sm); background:var(--bg-primary);">
        <label style="font-weight:600; margin-bottom:0.25rem;">Product Gallery Images (Multer Upload)</label>
        <div style="display:flex; gap:0.5rem; margin-bottom: 0.5rem;">
          <input type="file" id="modal-prod-file-input" multiple accept="image/*" class="form-control" style="font-size:0.85rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="upload-prod-images-btn" style="white-space:nowrap;">Upload Files</button>
        </div>
        <div id="product-images-preview-list"></div>
      </div>

      <div class="form-group form-check" style="margin-bottom:0.75rem;">
        <input type="checkbox" class="form-check-input" id="modal-prod-featured" ${isFeatured ? 'checked' : ''}>
        <label class="form-check-label" for="modal-prod-featured">Featured Product</label>
      </div>

      <div class="form-group">
        <label for="modal-prod-desc">Description</label>
        <textarea id="modal-prod-desc" class="form-control" required placeholder="Detailed specifications..." style="height:100px;">${descVal}</textarea>
      </div>
      
      <div style="display:flex; gap:1rem; margin-top:2rem;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()" style="flex:1;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">Save Product</button>
      </div>
    </form>
  `;

  showModal(html);
  renderUploadedImagesList();

  // Bind Image Upload button
  document.getElementById('upload-prod-images-btn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('modal-prod-file-input');
    if (!fileInput || fileInput.files.length === 0) {
      showToast('Please select image files first', 'warning');
      return;
    }

    const formData = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) {
      formData.append('images', fileInput.files[i]);
    }

    try {
      showToast('Uploading images to server...', 'info');
      const response = await fetch('/api/upload/multiple', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AppState.token}`
        },
        body: formData
      });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'File upload failed');
      }

      uploadedImages = [...uploadedImages, ...result.data.urls];
      showToast('Images uploaded successfully', 'success');
      renderUploadedImagesList();
      fileInput.value = ''; // clear input
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bind Form Save Submission
  document.getElementById('modal-prod-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
      name: document.getElementById('modal-prod-name').value,
      description: document.getElementById('modal-prod-desc').value,
      price: document.getElementById('modal-prod-price').value,
      discount: document.getElementById('modal-prod-discount').value,
      brand: document.getElementById('modal-prod-brand').value,
      stock: document.getElementById('modal-prod-stock').value,
      category: document.getElementById('modal-prod-cat').value,
      images: uploadedImages,
      image: uploadedImages[0] || '', // default main image to first uploaded image
      isFeatured: document.getElementById('modal-prod-featured').checked
    };

    try {
      if (prod) {
        await apiCall(`/api/products/${prod.id}`, 'PUT', payload);
        showToast('Product updated successfully', 'success');
      } else {
        await apiCall('/api/products', 'POST', payload);
        showToast('Product created successfully', 'success');
      }
      closeModal();
      showAdminPage();
    } catch (err) {}
  });
}

// --- INITIALIZE & ROUTE BINDINGS ---

// Setup client routes
Router.add('/', showStorePage);
Router.add('/product/:id', showProductDetailsPage);
Router.add('/login', showLoginPage);
Router.add('/checkout', showCheckoutPage);
Router.add('/dashboard', handleRoleBasedDashboardRedirect);
Router.add('/admin', showAdminPage);
Router.add('/admin/dashboard', showAdminDashboardPage);
Router.add('/customer/dashboard', showCustomerDashboardPage);

// Document ready bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial UI Setup & Session Checking
  const sessionUser = sessionStorage.getItem('alpha_user') || localStorage.getItem('alpha_user');
  const sessionToken = sessionStorage.getItem('alpha_token') || localStorage.getItem('alpha_token');
  if (sessionUser && sessionToken) {
    AppState.user = JSON.parse(sessionUser);
    AppState.token = sessionToken;
  }

  // Synchronously verify and sync the user profile with the server
  if (AppState.token) {
    try {
      const profileRes = await apiCall('/api/auth/profile');
      AppState.user = profileRes.data;
      if (sessionStorage.getItem('alpha_token')) {
        sessionStorage.setItem('alpha_user', JSON.stringify(profileRes.data));
      }
      if (localStorage.getItem('alpha_token')) {
        localStorage.setItem('alpha_user', JSON.stringify(profileRes.data));
      }
    } catch (err) {
      console.error('Failed to sync profile status from server:', err);
    }
  }

  renderUserNavbarArea();

  // 2. Fetch Wishlist and Cart (sync with server)
  await fetchWishlist();
  if (AppState.user) {
    await syncCartOnLogin();
  } else {
    await fetchCart();
  }
  
  // Initialize AOS
  if (window.AOS) {
    AOS.init({
      duration: 800,
      easing: 'ease-out-cubic',
      once: true
    });
  }

  // 3. Light / Dark theme toggler
  const themeToggleBtn = document.getElementById('theme-toggle');
  const storedTheme = localStorage.getItem('alpha_theme');
  
  if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    document.body.classList.remove('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('alpha_theme', isDark ? 'dark' : 'light');
    themeToggleBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    showToast(`${isDark ? 'Dark' : 'Light'} theme activated`, 'info');
  });

  // 4. Search inputs binding
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  
  const handleSearchSubmit = (inputEl) => {
    AppState.currentQuery.search = inputEl.value;
    AppState.currentQuery.page = 1; // reset page
    navigateTo('/');
  };

  searchForm?.addEventListener('submit', () => handleSearchSubmit(searchInput));
  
  const mobSearchForm = document.getElementById('mobile-search-form');
  const mobSearchInput = document.getElementById('mobile-search-input');
  
  mobSearchForm?.addEventListener('submit', () => handleSearchSubmit(mobSearchInput));

  // 5. Cart drawer overlay clicks
  document.getElementById('cart-toggle-btn')?.addEventListener('click', openCart);
  document.getElementById('cart-close-btn')?.addEventListener('click', closeCart);
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('cart-checkout-btn')?.addEventListener('click', () => {
    closeCart();
    navigateTo('/checkout');
  });

  // 6. Global Modal clicks
  document.getElementById('global-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('global-modal-overlay')?.addEventListener('click', closeModal);

  // 7. Navbar brand click router
  const brandLogo = document.getElementById('nav-brand-logo');
  brandLogo?.addEventListener('click', (e) => {
    e.preventDefault();
    // Reset filters
    AppState.currentQuery.search = '';
    AppState.currentQuery.category = '';
    AppState.currentQuery.minPrice = '';
    AppState.currentQuery.maxPrice = '';
    AppState.currentQuery.rating = '';
    AppState.currentQuery.availability = '';
    AppState.currentQuery.sort = 'createdAt-desc';
    AppState.currentQuery.page = 1;
    if (searchInput) searchInput.value = '';
    if (mobSearchInput) mobSearchInput.value = '';
    navigateTo('/');
  });

  // 8. Footer category links mapping
  document.querySelectorAll('.footer-category-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const catSlug = link.getAttribute('data-cat');
      
      if (!catSlug) {
        AppState.currentQuery.category = '';
        AppState.currentQuery.page = 1;
        navigateTo('/');
        return;
      }

      // Find Category ID from slug
      try {
        const response = await apiCall('/api/categories');
        const found = response.data.find(c => c.slug === catSlug);
        if (found) {
          AppState.currentQuery.category = found._id;
          AppState.currentQuery.page = 1;
          navigateTo('/');
          setTimeout(() => {
            document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        } else {
          navigateTo('/');
        }
      } catch (err) {
        navigateTo('/');
      }
    });
  });

  // 9. Back-to-Top Button
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.className = 'scroll-top-btn';
  scrollTopBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
  document.body.appendChild(scrollTopBtn);

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      scrollTopBtn.classList.add('show');
    } else {
      scrollTopBtn.classList.remove('show');
    }
  });

  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 10. Close dropdown menus on outer click
  window.addEventListener('click', () => {
    document.getElementById('navbar-profile-menu')?.classList.remove('show');
  });

  // 11. Process initial route path
  Router.handleRoute(window.location.pathname);
});

// Intercept popstate to handle browser back/forward buttons
window.addEventListener('popstate', () => {
  Router.handleRoute(window.location.pathname);
});
