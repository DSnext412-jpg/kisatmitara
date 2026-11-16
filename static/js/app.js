
let currentUser = null;
let products = [];
let farmerProducts = [];
let cart = [];
let currentCategory = "All";
let lang = "en";
let authMode = "login";
let selectedRole = "customer";
let editingProductId = null;
let toastTimer = null;

const ROLE_LABELS = {
  customer: "Customer",
  farmer: "Farmer",
  delivery_agent: "Delivery agent",
};

const CATEGORY_EMOJI = {
  Vegetables: "🥬",
  Fruits: "🍎",
  Grains: "🌾",
  Dairy: "🥛",
  Other: "🌱",
};

const NEXT_ORDER_STATUSES = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Dispatched", "Cancelled"],
  Dispatched: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

function money(value) {
  return "₹" + Number(value || 0).toFixed(2);
}

function statusClass(status) {
  return "status-" + String(status || "").replace(/[^a-zA-Z]/g, "");
}

function parseRole(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .trim();

  if (text === "customer") return "customer";
  if (text === "farmer") return "farmer";
  if (text === "delivery agent" || text === "deliveryagent" || text === "delivery") {
    return "delivery_agent";
  }
  return null;
}

async function api(url, options) {
  const settings = Object.assign({ credentials: "same-origin" }, options || {});
  const response = await fetch(url, settings);

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

function postJson(url, body) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 4000);
}


document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  clearAuthForm();
  loadCart();
  await checkLogin();
  await loadProducts();
  if (currentUser) {
    await showDashboard();
  }
  updateNav();
}

function bindEvents() {
  const language = $("language");
  if (language) {
    language.addEventListener("change", function (event) {
      lang = event.target.value;
      applyLanguage();
    });
  }

  const search = $("search");
  if (search) {
    let searchTimer = null;
    search.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        loadProducts();
      }
    });
    search.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadProducts, 400);
    });
  }

  const categories = $("categories");
  if (categories) {
    categories.addEventListener("click", function (event) {
      const button = event.target.closest("[data-cat]");
      if (!button) return;
      currentCategory = button.dataset.cat;
      categories.querySelectorAll(".chip").forEach(function (chip) {
        chip.classList.toggle("active", chip === button);
      });
      loadProducts();
    });
  }

  const authForm = $("authForm");
  if (authForm) {
    authForm.addEventListener("submit", handleAuthSubmit);
  }

  const authTabs = $("authTabs");
  if (authTabs) {
    authTabs.addEventListener("click", function (event) {
      const button = event.target.closest("[data-auth-mode]");
      if (button) switchAuthMode(button.dataset.authMode);
    });
  }

  const roleSwitch = $("roleSwitch");
  if (roleSwitch) {
    roleSwitch.addEventListener("click", function (event) {
      const button = event.target.closest("[data-role]");
      if (button) selectRole(button.dataset.role);
    });
  }

  const chatInput = $("chatInput");
  if (chatInput) {
    chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        sendChat();
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-back.show").forEach(function (modal) {
        if (modal.id === "authModal") {
          closeAuth();
          return;
        }
        modal.classList.remove("show");
      });
    }
  });
}

function applyLanguage() {
  document.querySelectorAll("[data-en]").forEach(function (element) {
    if (element.id === "authButton" && currentUser) return;
    const value = element.getAttribute("data-" + lang);
    if (!value) return;
    if (value.indexOf("<em>") !== -1) {
      element.innerHTML = value;
    } else {
      element.textContent = value;
    }
  });
}


async function checkLogin() {
  try {
    const data = await api("/api/me");
    currentUser = data.user;
  } catch (error) {
    currentUser = null;
  }
  updateNav();
}

function updateNav() {
  const authButton = $("authButton");
  const logoutButton = $("logoutButton");
  const dashboardNav = $("dashboardNav");

  if (authButton) {
    if (currentUser) {
      authButton.textContent = currentUser.name;
      authButton.onclick = scrollToDashboard;
    } else {
      authButton.textContent = "Sign in";
      authButton.onclick = function () {
        openAuth();
      };
    }
  }

  if (logoutButton) {
    logoutButton.style.display = currentUser ? "inline-block" : "none";
  }
  if (dashboardNav) {
    dashboardNav.style.display = currentUser ? "inline-block" : "none";
  }

  updateCartCount();
}

async function scrollToDashboard() {
  if (!currentUser) {
    openAuth();
    return;
  }
  const dashboard = $("dashboard");
  if (dashboard && !dashboard.classList.contains("show")) {
    await showDashboard();
  }
  if (dashboard) dashboard.scrollIntoView({ behavior: "smooth" });
}

function scrollToMarket() {
  const market = $("market");
  if (market) market.scrollIntoView({ behavior: "smooth" });
}


function openAuth(role) {
  if (currentUser) {
    scrollToDashboard();
    return;
  }

  let mode = "login";
  const parsedRole = role ? parseRole(role) : null;
  if (parsedRole) {
    selectedRole = parsedRole;
    mode = "register";
  }

  switchAuthMode(mode);
  clearAuthForm();
  const modal = $("authModal");
  if (modal) modal.classList.add("show");
}

function closeAuth() {
  const modal = $("authModal");
  if (modal) modal.classList.remove("show");
  clearAuthForm();
}

function clearAuthForm() {
  const form = $("authForm");
  if (form) form.reset();

  ["name", "email", "phone", "password"].forEach(function (id) {
    const input = $(id);
    if (input) input.value = "";
  });

  clearAuthError();
}

function switchAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const registering = authMode === "register";

  document.querySelectorAll("#authTabs [data-auth-mode]").forEach(function (button) {
    button.classList.toggle("active", button.dataset.authMode === authMode);
  });

  if ($("nameRow")) $("nameRow").style.display = registering ? "block" : "none";
  if ($("phoneRow")) $("phoneRow").style.display = registering ? "block" : "none";
  if ($("roleSwitch")) $("roleSwitch").style.display = registering ? "flex" : "none";
  if ($("name")) $("name").required = registering;
  if ($("phone")) $("phone").required = registering;
  if ($("authTitle")) {
    $("authTitle").textContent = registering
      ? "Create your account"
      : "Welcome back";
  }
  if ($("authSubmit")) {
    $("authSubmit").innerHTML = registering ? "Register &rarr;" : "Login &rarr;";
  }
  if ($("authNotice")) {
    $("authNotice").textContent = registering
      ? "Already have an account? Choose Login."
      : "New to KisanMitra? Choose Register to create an account.";
  }

  selectRole(selectedRole);
  clearAuthError();
}

function selectRole(role) {
  selectedRole = parseRole(role) || "customer";
  document.querySelectorAll("#roleSwitch [data-role]").forEach(function (button) {
    button.classList.toggle("active", button.dataset.role === selectedRole);
  });
}

function setAuthError(message) {
  const box = $("authError");
  if (!box) return;
  box.textContent = message;
  box.style.display = message ? "block" : "none";
}

function clearAuthError() {
  setAuthError("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAuthError();

  const email = ($("email") ? $("email").value.trim() : "");
  const password = $("password") ? $("password").value : "";
  const button = $("authSubmit");
  const oldText = button ? button.innerHTML : "";
  const registering = authMode === "register";

  if (!email || !password) {
    setAuthError("Please enter your email and password.");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Please wait...";
  }

  try {
    let data;
    if (registering) {
      const name = $("name") ? $("name").value.trim() : "";
      const phone = $("phone") ? $("phone").value.trim() : "";
      if (!name || !phone) {
        throw new Error("Please fill in your name and mobile number.");
      }
      data = await postJson("/api/register", {
        name: name,
        email: email,
        phone: phone,
        password: password,
        role: selectedRole,
      });
    } else {
      data = await postJson("/api/login", { email: email, password: password });
    }

    currentUser = data.user;
    closeAuth();
    updateNav();
    await loadProducts();
    await scrollToDashboard();
    showToast(registering ? "Account created successfully." : "Logged in successfully.");
  } catch (error) {
    setAuthError(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = oldText;
    }
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST" });
  } catch (error) {
  }

  currentUser = null;
  authMode = "login";
  selectedRole = "customer";
  cart = [];
  saveCart();
  clearAuthForm();
  const dashboard = $("dashboard");
  if (dashboard) dashboard.classList.remove("show");
  updateNav();
  applyLanguage();
  await loadProducts();
  showToast("You have been logged out.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}


async function loadProducts() {
  const root = $("products");
  if (root) root.innerHTML = '<div class="empty">Loading produce...</div>';

  const params = new URLSearchParams();
  const searchBox = $("search");
  const search = searchBox ? searchBox.value.trim() : "";
  if (search) params.set("search", search);
  if (currentCategory && currentCategory !== "All") {
    params.set("category", currentCategory);
  }

  try {
    products = await api("/api/products?" + params.toString());
    displayProducts();
  } catch (error) {
    if (root) root.innerHTML = '<div class="empty">' + esc(error.message) + "</div>";
  }
}

function renderProducts() {
  loadProducts();
}

function displayProducts() {
  const root = $("products");
  if (!root) return;

  if (!products.length) {
    root.innerHTML =
      '<div class="empty">No matching produce found. Try another search or category.</div>';
    return;
  }

  root.innerHTML = products.map(productCard).join("");
}

function productCard(product) {
  const emoji = CATEGORY_EMOJI[product.category] || "🌱";
  const image = product.image_url
    ? '<img src="' + esc(product.image_url) + '" alt="' + esc(product.name) + '" loading="lazy">'
    : "<span>" + emoji + "</span>";

  return (
    '<article class="product">' +
    '<div class="prod-img km-click" onclick="kmPD(' + product.id + ')" role="button" tabindex="0" ' +
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();kmPD(' + product.id + ')}" ' +
    'title="View product details">' + image + "</div>" +
    '<div class="prod-body">' +
    '<div class="prod-top"><h3>' + esc(product.name) + "</h3>" +
    '<span class="badge">' + esc(product.quantity) + " " + esc(product.unit) + " left</span></div>" +
    '<div class="farmer">👨‍🌾 ' + esc(product.farmer_name) + " · " + esc(product.category) + "</div>" +
    '<div class="price-row"><span class="price">' + money(product.price) + "/" + esc(product.unit) + "</span></div>" +
    '<div class="saving">Fresh from the farm</div>' +
    '<div class="prod-footer">' +
    '<input type="number" min="1" step="0.5" max="' + product.quantity + '" value="1" id="qty-' + product.id + '" aria-label="Quantity">' +
    '<button class="btn small" onclick="addToCart(' + product.id + ')">Add to cart</button>' +
    "</div></div></article>"
  );
}


function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("kisanmitra_cart") || "[]");
    cart = Array.isArray(saved) ? saved : [];
  } catch (error) {
    cart = [];
  }
  updateCartCount();
}

function saveCart() {
  try {
    localStorage.setItem("kisanmitra_cart", JSON.stringify(cart));
  } catch (error) {
  }
  updateCartCount();
}

function updateCartCount() {
  const count = cart.reduce(function (total, item) {
    return total + Number(item.quantity || 0);
  }, 0);
  const badge = $("cartCount");
  if (badge) badge.textContent = count;
}

async function addToCart(productId, quantityFromModal) {
  if (!currentUser) {
    openAuth();
    showToast("Please log in as a customer to place an order.");
    return;
  }
  if (currentUser.role !== "customer") {
    showToast("Only customer accounts can place orders.");
    return;
  }

  let product = products.find(function (item) {
    return item.id === productId;
  });

  if (!product) {
    try {
      product = await api("/api/products/" + productId);
    } catch (error) {
      showToast(error.message);
      return;
    }
  }

  if (product.quantity <= 0) {
    showToast("This product is out of stock.");
    return;
  }

  const quantityBox = $("qty-" + productId);
  const quantity = Number(
    quantityFromModal != null
      ? quantityFromModal
      : quantityBox
      ? quantityBox.value
      : 1
  );

  if (!quantity || quantity <= 0) {
    showToast("Please enter a valid quantity.");
    return;
  }

  const existing = cart.find(function (item) {
    return item.id === productId;
  });
  const newQuantity = (existing ? Number(existing.quantity) : 0) + quantity;

  if (newQuantity > product.quantity) {
    showToast("Only " + product.quantity + " " + product.unit + " available.");
    return;
  }

  if (existing) {
    existing.quantity = newQuantity;
    existing.price = product.price;
    existing.stock = product.quantity;
    existing.name = product.name;
    existing.unit = product.unit;
    existing.category = product.category;
    existing.farmer_id = product.farmer_id;
    existing.farmer_name = product.farmer_name;
    existing.image_url = product.image_url;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      quantity: quantity,
      stock: product.quantity,
      category: product.category,
      farmer_id: product.farmer_id,
      farmer_name: product.farmer_name,
      image_url: product.image_url,
    });
  }

  saveCart();
  showToast(product.name + " added to cart.");
}

function removeFromCart(productId) {
  cart = cart.filter(function (item) {
    return item.id !== productId;
  });
  saveCart();
  renderCheckout();
}

function updateCartQty(productId, value) {
  const item = cart.find(function (entry) {
    return entry.id === productId;
  });
  if (!item) return;

  const quantity = Number(value);
  if (!quantity || quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  if (quantity > item.stock) {
    item.quantity = item.stock;
    showToast("Only " + item.stock + " " + item.unit + " available.");
  } else {
    item.quantity = quantity;
  }

  saveCart();
  renderCheckout();
}

function openCheckout() {
  if (!currentUser) {
    openAuth();
    showToast("Please log in as a customer to place an order.");
    return;
  }
  if (currentUser.role !== "customer") {
    showToast("Only customer accounts can place orders.");
    return;
  }
  if (!cart.length) {
    showToast("Your cart is empty. Add some produce first.");
    return;
  }

  if ($("checkoutError")) $("checkoutError").style.display = "none";
  renderCheckout();
  const modal = $("checkoutModal");
  if (modal) modal.classList.add("show");
}

function closeCheckout() {
  const modal = $("checkoutModal");
  if (modal) modal.classList.remove("show");
}

function renderCheckout() {
  const itemsBox = $("checkoutItems");
  const totalBox = $("checkoutTotal");
  const button = $("placeOrderButton");
  if (!itemsBox || !totalBox || !button) return;

  if (!cart.length) {
    itemsBox.innerHTML = '<p class="sub">Your cart is empty.</p>';
    totalBox.innerHTML = "";
    button.disabled = true;
    return;
  }

  itemsBox.innerHTML = cart
    .map(function (item) {
      const image = item.image_url
        ? '<img class="product-thumb" src="' + esc(item.image_url) + '" alt="">'
        : '<div class="product-thumb-emoji">' + (CATEGORY_EMOJI[item.category] || "🌱") + "</div>";

      return (
        '<div class="cart-line">' +
        image +
        '<div class="cart-main"><div class="cart-name">' + esc(item.name) + "</div>" +
        '<div class="farmer">' + money(item.price) + " / " + esc(item.unit) +
        (item.farmer_name ? " · " + esc(item.farmer_name) : "") + "</div></div>" +
        '<input class="cart-qty" type="number" min="1" step="0.5" max="' + esc(item.stock) + '" value="' + esc(item.quantity) + '" ' +
        'onchange="updateCartQty(' + item.id + ', this.value)" aria-label="Quantity">' +
        '<button class="btn light small" onclick="removeFromCart(' + item.id + ')" title="Remove">&times;</button>' +
        "<b>" + money(item.price * item.quantity) + "</b>" +
        "</div>"
      );
    })
    .join("");

  const total = cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);

  totalBox.innerHTML = "<span>Estimated total</span><strong>" + money(total) + "</strong>";
  button.disabled = false;
}

function showCheckoutError(message) {
  const box = $("checkoutError");
  if (!box) return;
  box.textContent = message;
  box.style.display = message ? "block" : "none";
}

async function placeOrder() {
  const addressBox = $("deliveryAddress");
  const address = addressBox ? addressBox.value.trim() : "";
  const button = $("placeOrderButton");

  showCheckoutError("");

  if (!address) {
    showCheckoutError("Please enter a delivery address.");
    return;
  }
  if (!cart.length) {
    showCheckoutError("Your cart is empty.");
    return;
  }

  const farmerIds = cart
    .map(function (item) {
      return item.farmer_id;
    })
    .filter(function (farmerId) {
      return farmerId !== null && farmerId !== undefined;
    });

  if (new Set(farmerIds).size > 1) {
    showCheckoutError(
      "Your cart contains products from more than one farmer. Please order from one farmer at a time."
    );
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Placing order...";
  }

  try {
    const data = await postJson("/api/orders", {
      delivery_address: address,
      items: cart.map(function (item) {
        return { product_id: item.id, quantity: item.quantity };
      }),
    });

    cart = [];
    saveCart();
    closeCheckout();
    if (addressBox) addressBox.value = "";
    showToast("Order placed successfully.");
    await loadProducts();
    await showDashboard();
    await scrollToDashboard();
    viewOrder(data.order.id);
  } catch (error) {
    showCheckoutError(error.message);
    await loadProducts();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Place order";
    }
  }
}


async function showDashboard() {
  const dashboard = $("dashboard");
  const content = $("dashContent");
  if (!dashboard || !content) return;

  if (!currentUser) {
    dashboard.classList.remove("show");
    return;
  }

  dashboard.classList.add("show");
  if ($("dashTitle")) $("dashTitle").textContent = "Welcome, " + currentUser.name;
  if ($("dashSub")) {
    $("dashSub").textContent =
      ROLE_LABELS[currentUser.role] + " dashboard · " + currentUser.email;
  }

  content.innerHTML = '<div class="empty">Loading dashboard...</div>';

  if (currentUser.role === "customer") {
    await showCustomerDashboard(content);
  } else if (currentUser.role === "farmer") {
    await showFarmerDashboard(content);
  } else {
    await showDeliveryDashboard(content);
  }
}

function profilePanelHtml() {
  return (
    '<div class="panel"><div class="dash-head"><div><h3>My profile</h3>' +
    '<p class="sub">Account information used for orders and delivery.</p></div>' +
    '<span class="badge">' + esc(ROLE_LABELS[currentUser.role] || currentUser.role) + "</span></div>" +
    '<div class="dash-row"><div><b>' + esc(currentUser.name) + "</b>" +
    '<div class="farmer">' + esc(currentUser.email) + " · " + esc(currentUser.phone) + "</div></div></div></div>"
  );
}

function notificationsPanelHtml(notifications) {
  const unread = notifications.filter(function (notification) {
    return !notification.is_read;
  }).length;

  const rows = notifications.length
    ? notifications
        .slice(0, 5)
        .map(function (notification) {
          return (
            '<div class="dash-row"><div><b>' +
            (notification.is_read ? "" : '<span class="badge">New</span> ') +
            esc(notification.message) +
            '</b><div class="farmer">' + esc(notification.created_at) +
            "</div></div></div>"
          );
        })
        .join("")
    : '<p class="sub">No notifications yet.</p>';

  return (
    '<div class="panel"><div class="dash-head"><h3>Notifications</h3>' +
    (unread
      ? '<button class="btn light small" onclick="markAllNotificationsRead()">Mark all read (' + unread + ")</button>"
      : "") +
    "</div>" + rows + "</div>"
  );
}

function cartSummaryHtml() {
  if (!cart.length) {
    return (
      '<div class="panel"><h3>My cart</h3>' +
      '<p class="sub">Your cart is empty. Add produce from the marketplace.</p></div>'
    );
  }

  const rows = cart
    .map(function (item) {
      return (
        '<div class="dash-row"><div><b>' + esc(item.name) + "</b>" +
        '<div class="farmer">' + esc(item.quantity) + " " + esc(item.unit) +
        " · " + money(item.price) + "/" + esc(item.unit) +
        (item.farmer_name ? " · " + esc(item.farmer_name) : "") +
        "</div></div><b>" + money(item.price * item.quantity) + "</b></div>"
      );
    })
    .join("");

  const total = cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);

  return (
    '<div class="panel"><div class="dash-head"><h3>My cart</h3>' +
    '<button class="btn small" onclick="openCheckout()">Open checkout</button></div>' +
    rows +
    '<div class="cart-total"><span>Estimated total</span><strong>' +
    money(total) + "</strong></div></div>"
  );
}

function dashboardProductRow(product) {
  const emoji = CATEGORY_EMOJI[product.category] || "🌱";
  const image = product.image_url
    ? '<img class="product-thumb" src="' + esc(product.image_url) + '" alt="">'
    : '<div class="product-thumb-emoji">' + emoji + "</div>";

  return (
    '<div class="dash-row" style="flex-wrap:wrap">' +
    '<div style="display:flex;gap:10px;align-items:center">' + image +
    "<div><b>" + esc(product.name) + "</b>" +
    '<div class="farmer">' + esc(product.farmer_name) + " · " +
    esc(product.category) + " · " + money(product.price) + "/" +
    esc(product.unit) + "</div></div></div>" +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<span class="badge">' + esc(product.quantity) + " " + esc(product.unit) +
    " left</span>" +
    '<button class="btn small" onclick="addToCart(' + product.id + ', 1)">Add to cart</button>' +
    '<button class="btn light small" onclick="kmPD(' + product.id + ')">View</button>' +
    "</div></div>"
  );
}

async function showCustomerDashboard(content) {
  let orders = [];
  let availableProducts = [];
  let notifications = [];

  try {
    const results = await Promise.all([
      api("/api/orders"),
      api("/api/products"),
      api("/api/notifications"),
    ]);
    orders = results[0];
    availableProducts = results[1];
    notifications = results[2];
  } catch (error) {
    content.innerHTML = '<div class="empty">' + esc(error.message) + "</div>";
    return;
  }

  const pending = orders.filter(function (order) {
    return order.status === "Pending";
  }).length;
  const spent = orders
    .filter(function (order) {
      return order.status !== "Cancelled";
    })
    .reduce(function (sum, order) {
      return sum + Number(order.total_amount || 0);
    }, 0);

  const rows = orders.length
    ? orders.map(customerOrderRow).join("")
    : '<p class="sub">No orders yet. Browse today\'s farm picks and add produce to your cart.</p>';

  const productRows = availableProducts.length
    ? availableProducts.slice(0, 8).map(dashboardProductRow).join("")
    : '<p class="sub">No products are available right now.</p>';

  content.innerHTML =
    profilePanelHtml() +
    '<div class="dash-grid">' +
    '<div class="stat"><small>Total orders</small><strong>' + orders.length + "</strong></div>" +
    '<div class="stat"><small>Pending orders</small><strong>' + pending + "</strong></div>" +
    '<div class="stat"><small>Total spent</small><strong>' + money(spent) + "</strong></div>" +
    "</div>" +
    cartSummaryHtml() +
    '<div class="panel"><div class="dash-head"><h3>Available products</h3>' +
    '<button class="btn light small" onclick="scrollToMarket()">Open marketplace</button></div>' +
    productRows + "</div>" +
    '<div class="panel"><div class="dash-head"><h3>My orders</h3>' +
    '<button class="btn light small" onclick="openCheckout()">View cart (' + cart.length + ")</button></div>" +
    rows + "</div>" +
    notificationsPanelHtml(notifications);
}

function customerOrderRow(order) {
  const itemText = order.items
    .map(function (item) {
      return item.quantity + " " + item.unit + " " + item.product_name;
    })
    .join(", ");

  const cancelButton =
    order.status === "Pending"
      ? '<button class="btn light small" onclick="cancelOrder(' + order.id + ')">Cancel</button>'
      : "";

  return (
    '<div class="dash-row" style="flex-wrap:wrap">' +
    "<div><b>Order #" + order.id + "</b>" +
    '<div class="farmer">' + esc(order.order_date) + " · " + esc(itemText) + "</div>" +
    '<div class="farmer">' + esc(order.delivery_address) + "</div>" +
    '<div class="farmer">Delivery: ' + esc(order.delivery_status || "") +
    (order.delivery_agent_name ? " · " + esc(order.delivery_agent_name) : "") +
    "</div></div>" +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<span class="status ' + statusClass(order.status) + '">' + esc(order.status) + "</span>" +
    "<b>" + money(order.total_amount) + "</b>" +
    '<button class="btn light small" onclick="viewOrder(' + order.id + ')">View</button>' +
    cancelButton +
    "</div></div>"
  );
}

async function showFarmerDashboard(content) {
  let myProducts = [];
  let orders = [];
  let notifications = [];

  try {
    const results = await Promise.all([
      api("/api/farmer/products"),
      api("/api/farmer/orders"),
      api("/api/notifications"),
    ]);
    myProducts = results[0];
    orders = results[1];
    notifications = results[2];
  } catch (error) {
    content.innerHTML = '<div class="empty">' + esc(error.message) + "</div>";
    return;
  }

  farmerProducts = myProducts;
  editingProductId = null;

  const pending = orders.filter(function (order) {
    return order.status === "Pending";
  }).length;

  content.innerHTML =
    profilePanelHtml() +
    '<div class="dash-grid">' +
    '<div class="stat"><small>Products listed</small><strong>' + myProducts.length + "</strong></div>" +
    '<div class="stat"><small>Orders received</small><strong>' + orders.length + "</strong></div>" +
    '<div class="stat"><small>Pending orders</small><strong>' + pending + "</strong></div>" +
    "</div>" +
    '<div class="panel"><div class="dash-head"><div><h3>Add / edit product</h3>' +
    '<p class="sub" id="productFormHint">Add a new product to your farm listing.</p></div>' +
    '<button class="btn light small" id="cancelEditButton" onclick="cancelProductEdit()" style="display:none">Cancel edit</button></div>' +
    '<form id="productForm" enctype="multipart/form-data">' +
    '<div class="form-grid">' +
    '<div class="form-row"><label>Product name</label><input id="productName" required maxlength="100" placeholder="e.g. Fresh tomatoes"></div>' +
    '<div class="form-row"><label>Category</label><select id="productCategory">' +
    '<option>Vegetables</option><option>Fruits</option><option>Grains</option><option>Dairy</option><option>Other</option>' +
    "</select></div></div>" +
    '<div class="form-row"><label>Description</label><textarea id="productDescription" rows="2" maxlength="5000" placeholder="Short description of your produce"></textarea></div>' +
    '<div class="form-grid">' +
    '<div class="form-row"><label>Price (₹ per unit)</label><input id="productPrice" type="number" min="0.01" step="0.01" required placeholder="e.g. 18"></div>' +
    '<div class="form-row"><label>Available quantity</label><input id="productQuantity" type="number" min="0" step="0.5" required placeholder="e.g. 100"></div>' +
    '<div class="form-row"><label>Unit</label><input id="productUnit" maxlength="20" value="kg" required></div>' +
    '<div class="form-row"><label>Product image</label><input id="productImage" type="file" accept="image/*"></div>' +
    "</div>" +
    '<div class="form-error" id="productError" style="display:none"></div>' +
    '<button class="btn" type="submit" id="productSubmitButton">Add product</button>' +
    "</form></div>" +
    '<div class="panel"><h3>My products</h3>' +
    (myProducts.length ? myProducts.map(farmerProductRow).join("") : '<p class="sub">No products yet. Add your first listing above.</p>') +
    "</div>" +
    '<div class="panel"><h3>Orders containing my products</h3>' +
    '<p class="sub" style="margin-bottom:10px">Order status is shared for the whole order.</p>' +
    (orders.length ? orders.map(farmerOrderRow).join("") : '<p class="sub">No orders yet.</p>') +
    "</div>" +
    notificationsPanelHtml(notifications);

  const form = $("productForm");
  if (form) form.addEventListener("submit", handleProductSubmit);
}

function farmerProductRow(product) {
  const emoji = CATEGORY_EMOJI[product.category] || "🌱";
  const image = product.image_url
    ? '<img class="product-thumb" src="' + esc(product.image_url) + '" alt="">'
    : '<div class="product-thumb-emoji">' + emoji + "</div>";

  return (
    '<div class="dash-row" style="flex-wrap:wrap">' +
    '<div style="display:flex;gap:10px;align-items:center">' +
    image +
    "<div><b>" + esc(product.name) + "</b>" +
    '<div class="farmer">' + esc(product.category) + " · " + money(product.price) + "/" + esc(product.unit) +
    " · " + esc(product.quantity) + " " + esc(product.unit) + " in stock</div></div></div>" +
    '<div style="display:flex;gap:6px">' +
    '<button class="btn light small" onclick="editProduct(' + product.id + ')">Edit</button>' +
    '<button class="btn light small" onclick="deleteProduct(' + product.id + ')">Delete</button>' +
    "</div></div>"
  );
}

function farmerOrderRow(order) {
  const itemText = order.items
    .map(function (item) {
      return item.quantity + " " + item.unit + " " + item.product_name;
    })
    .join(", ");

  const nextStatuses = NEXT_ORDER_STATUSES[order.status] || [];
  const options = nextStatuses.map(function (status) {
    return '<option value="' + status + '">' + status + "</option>";
  }).join("");

  const controls = nextStatuses.length
    ? '<span class="status ' + statusClass(order.status) + '">' + esc(order.status) + "</span> " +
      '<select class="status-select" id="status-' + order.id + '">' + options + "</select> " +
      '<button class="btn small" onclick="updateOrderStatus(' + order.id + ')">Update</button>'
    : '<span class="status ' + statusClass(order.status) + '">' + esc(order.status) + "</span>";

  const agentText = order.delivery_agent_name
    ? "Delivery agent: " + esc(order.delivery_agent_name) + " · " + esc(order.delivery_agent_phone)
    : "Delivery agent: not assigned";

  return (
    '<div class="dash-row" style="flex-wrap:wrap">' +
    "<div><b>Order #" + order.id + "</b>" +
    '<div class="farmer">Customer: ' + esc(order.customer_name) + " · " + esc(order.customer_phone) + "</div>" +
    '<div class="farmer">' + esc(itemText) + "</div>" +
    '<div class="farmer">Deliver to: ' + esc(order.delivery_address) + "</div>" +
    '<div class="farmer">' + agentText + "</div>" +
    '<div class="farmer">Delivery: ' + esc(order.delivery_status || "") + "</div>" +
    '<div class="farmer">' + esc(order.order_date) + " · " + money(order.total_amount) + "</div></div>" +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + controls + "</div>" +
    "</div>"
  );
}

async function showDeliveryDashboard(content) {
  let data = { available: [], assigned: [], completed: [] };
  let notifications = [];

  try {
    const results = await Promise.all([
      api("/api/agent/deliveries"),
      api("/api/notifications"),
    ]);
    data = results[0];
    notifications = results[1];
  } catch (error) {
    content.innerHTML = '<div class="empty">' + esc(error.message) + "</div>";
    return;
  }

  const availableRows = data.available.length
    ? data.available.map(function (order) {
        return agentDeliveryRow(order, "available");
      }).join("")
    : '<p class="sub">No dispatched orders are waiting for an agent.</p>';

  const assignedRows = data.assigned.length
    ? data.assigned.map(function (order) {
        return agentDeliveryRow(order, "assigned");
      }).join("")
    : '<p class="sub">No deliveries are assigned to you right now.</p>';

  const completedRows = data.completed.length
    ? data.completed.map(function (order) {
        return agentDeliveryRow(order, "completed");
      }).join("")
    : '<p class="sub">You have not completed any deliveries yet.</p>';

  content.innerHTML =
    profilePanelHtml() +
    '<div class="dash-grid">' +
    '<div class="stat"><small>Available</small><strong>' + data.available.length + "</strong></div>" +
    '<div class="stat"><small>Assigned to me</small><strong>' + data.assigned.length + "</strong></div>" +
    '<div class="stat"><small>Completed</small><strong>' + data.completed.length + "</strong></div>" +
    "</div>" +
    '<div class="panel"><h3>Available deliveries</h3>' +
    '<p class="sub" style="margin-bottom:10px">Dispatched orders waiting for a delivery agent.</p>' +
    availableRows + "</div>" +
    '<div class="panel"><h3>My assigned deliveries</h3>' +
    '<p class="sub" style="margin-bottom:10px">Orders you have accepted and still need to deliver.</p>' +
    assignedRows + "</div>" +
    '<div class="panel"><h3>Completed deliveries</h3>' + completedRows + "</div>" +
    notificationsPanelHtml(notifications);
}

function agentDeliveryRow(order, section) {
  const itemText = order.items
    .map(function (item) {
      return item.quantity + " " + item.unit + " " + item.product_name;
    })
    .join(", ");

  let actions = "";
  if (section === "available") {
    actions =
      '<button class="btn small" onclick="acceptDelivery(' + order.id + ')">Accept delivery</button>';
  } else if (section === "assigned") {
    actions =
      '<button class="btn small" onclick="completeDelivery(' + order.id + ')">Mark delivered</button>' +
      '<button class="btn light small" onclick="viewAgentDelivery(' + order.id + ')">Details</button>';
  } else {
    actions =
      '<button class="btn light small" onclick="viewAgentDelivery(' + order.id + ')">Details</button>';
  }

  return (
    '<div class="dash-row" style="flex-wrap:wrap">' +
    "<div><b>Order #" + order.id + "</b>" +
    '<div class="farmer">' + esc(order.customer_name) + " · " + esc(order.customer_phone) + "</div>" +
    '<div class="farmer">' + esc(itemText) + "</div>" +
    '<div class="farmer">Deliver to: ' + esc(order.delivery_address) + "</div>" +
    '<div class="farmer">' + esc(order.order_date) + " · " + money(order.total_amount) + "</div>" +
    '<div class="farmer">Delivery: ' + esc(order.delivery_status || "") + "</div></div>" +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<span class="status ' + statusClass(order.status) + '">' + esc(order.status) + "</span>" +
    actions + "</div></div>"
  );
}

async function acceptDelivery(orderId) {
  if (!confirm("Accept this delivery?")) return;

  try {
    await api("/api/agent/deliveries/" + orderId + "/accept", {
      method: "POST",
    });
    showToast("Delivery accepted.");
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function completeDelivery(orderId) {
  if (!confirm("Mark this delivery as delivered?")) return;

  try {
    await api("/api/agent/deliveries/" + orderId + "/deliver", {
      method: "POST",
    });
    showToast("Order marked as delivered.");
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function viewAgentDelivery(orderId) {
  try {
    const order = await api("/api/agent/deliveries/" + orderId);
    renderOrderDetails(order);
    const modal = $("orderModal");
    if (modal) modal.classList.add("show");
  } catch (error) {
    showToast(error.message);
  }
}

async function markAllNotificationsRead() {
  try {
    await api("/api/notifications/read-all", { method: "POST" });
    showToast("Notifications marked as read.");
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}


async function viewOrder(orderId) {
  try {
    const order = await api("/api/orders/" + orderId);
    renderOrderDetails(order);
    const modal = $("orderModal");
    if (modal) modal.classList.add("show");
  } catch (error) {
    showToast(error.message);
  }
}

function renderOrderDetails(order) {
  const canCancel =
    currentUser && currentUser.role === "customer" && order.status === "Pending";
  const totalLabel =
    currentUser && currentUser.role === "farmer" ? "Total for your items" : "Total";

  const items = order.items.length
    ? order.items
        .map(function (item) {
          return (
            '<div class="dash-row"><div><b>' + esc(item.product_name) + "</b>" +
            '<div class="farmer">' + esc(item.quantity) + " " + esc(item.unit) + " × " + money(item.price) + "</div></div>" +
            "<b>" + money(item.subtotal) + "</b></div>"
          );
        })
        .join("")
    : '<p class="sub">No items found.</p>';

  if ($("orderModalTitle")) $("orderModalTitle").textContent = "Order #" + order.id;
  if ($("orderModalBody")) {
    $("orderModalBody").innerHTML =
      '<div class="notice"><b>Status:</b> <span class="status ' + statusClass(order.status) + '">' + esc(order.status) + "</span></div>" +
      "<p><b>Customer:</b> " + esc(order.customer_name) + " · " + esc(order.customer_phone) + "</p>" +
      "<p><b>Delivery address:</b><br>" + esc(order.delivery_address) + "</p>" +
      "<p><b>Order date:</b> " + esc(order.order_date) + "</p>" +
      "<p><b>Delivery status:</b> " + esc(order.delivery_status || "") + "</p>" +
      (order.delivery_agent_name
        ? "<p><b>Delivery partner:</b> " + esc(order.delivery_agent_name) +
          " · " + esc(order.delivery_agent_phone) + "</p>"
        : "") +
      '<h3 style="margin-top:18px">Items</h3>' + items +
      '<div class="cart-total"><span>' + totalLabel + "</span><strong>" + money(order.total_amount) + "</strong></div>" +
      (canCancel
        ? '<button class="btn light" style="margin-top:12px" onclick="cancelOrder(' + order.id + ')">Cancel this order</button>'
        : "");
  }
}

function closeOrderDetails() {
  const modal = $("orderModal");
  if (modal) modal.classList.remove("show");
}

async function cancelOrder(orderId) {
  if (!confirm("Cancel this order? The stock will be returned to the farmer.")) return;

  try {
    await api("/api/orders/" + orderId + "/cancel", { method: "POST" });
    closeOrderDetails();
    showToast("Order cancelled and stock restored.");
    await loadProducts();
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function updateOrderStatus(orderId) {
  const select = $("status-" + orderId);
  if (!select) return;

  try {
    await postJson("/api/farmer/orders/" + orderId + "/status", {
      status: select.value,
    });
    showToast("Order status updated.");
    await loadProducts();
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}


function setProductError(message) {
  const box = $("productError");
  if (!box) return;
  box.textContent = message;
  box.style.display = message ? "block" : "none";
}

function editProduct(productId) {
  const product = farmerProducts.find(function (item) {
    return item.id === productId;
  });

  if (!product) {
    showToast("Open your dashboard and try editing the product again.");
    return;
  }

  editingProductId = product.id;
  if ($("productId")) $("productId").value = product.id;
  if ($("productName")) $("productName").value = product.name;
  if ($("productDescription")) $("productDescription").value = product.description || "";
  if ($("productPrice")) $("productPrice").value = product.price;
  if ($("productQuantity")) $("productQuantity").value = product.quantity;
  if ($("productUnit")) $("productUnit").value = product.unit;
  if ($("productImage")) $("productImage").value = "";

  const category = $("productCategory");
  if (category) {
    if (!Array.from(category.options).some(function (option) { return option.value === product.category; })) {
      const option = document.createElement("option");
      option.value = product.category;
      option.textContent = product.category;
      category.appendChild(option);
    }
    category.value = product.category;
  }

  if ($("productFormHint")) {
    $("productFormHint").textContent = "Editing: " + product.name + ". Leave the image empty to keep the current photo.";
  }
  if ($("productSubmitButton")) $("productSubmitButton").textContent = "Update product";
  if ($("cancelEditButton")) $("cancelEditButton").style.display = "inline-block";
  setProductError("");

  const form = $("productForm");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelProductEdit() {
  editingProductId = null;
  const form = $("productForm");
  if (form) form.reset();
  if ($("productUnit")) $("productUnit").value = "kg";
  if ($("productSubmitButton")) $("productSubmitButton").textContent = "Add product";
  if ($("cancelEditButton")) $("cancelEditButton").style.display = "none";
  if ($("productFormHint")) $("productFormHint").textContent = "Add a new product to your farm listing.";
  setProductError("");
}

async function handleProductSubmit(event) {
  event.preventDefault();

  const wasEditing = Boolean(editingProductId);
  const button = $("productSubmitButton");
  const oldText = button ? button.textContent : "";

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }
  setProductError("");

  try {
    const formData = new FormData();
    formData.append("name", $("productName").value.trim());
    formData.append("category", $("productCategory").value);
    formData.append("description", $("productDescription").value.trim());
    formData.append("price", $("productPrice").value);
    formData.append("quantity", $("productQuantity").value);
    formData.append("unit", $("productUnit").value.trim());

    const imageInput = $("productImage");
    if (imageInput && imageInput.files && imageInput.files[0]) {
      formData.append("image", imageInput.files[0]);
    }

    const url = wasEditing
      ? "/api/products/" + editingProductId + "/update"
      : "/api/products";

    await api(url, { method: "POST", body: formData });
    showToast(wasEditing ? "Product updated successfully." : "Product added successfully.");
    editingProductId = null;
    await loadProducts();
    await showDashboard();
  } catch (error) {
    setProductError(error.message);
    if (button) {
      button.disabled = false;
      button.textContent = wasEditing ? "Update product" : oldText;
    }
  }
}

async function deleteProduct(productId) {
  if (!confirm("Delete this product? Products used in orders cannot be deleted.")) {
    return;
  }

  try {
    await api("/api/products/" + productId + "/delete", { method: "POST" });
    showToast("Product deleted.");
    await loadProducts();
    await showDashboard();
  } catch (error) {
    showToast(error.message);
  }
}


async function kmPD(productId) {
  let product = products.find(function (item) {
    return item.id === productId;
  });

  if (!product) {
    product = farmerProducts.find(function (item) {
      return item.id === productId;
    });
  }

  if (!product) {
    try {
      product = await api("/api/products/" + productId);
    } catch (error) {
      showToast(error.message);
      return;
    }
  }

  const emoji = CATEGORY_EMOJI[product.category] || "🌱";
  const image = product.image_url
    ? '<img src="' + esc(product.image_url) + '" alt="' + esc(product.name) + '">'
    : '<div class="big">' + emoji + "</div>";

  const ownerEdit =
    currentUser &&
    currentUser.role === "farmer" &&
    currentUser.id === product.farmer_id;

  if ($("kmPDt")) $("kmPDt").textContent = product.name;
  if ($("kmPDb")) {
    $("kmPDb").innerHTML =
      image +
      "<p><b>" + money(product.price) + "/" + esc(product.unit) + "</b> · " + esc(product.category) + "</p>" +
      '<p class="farmer">👨‍🌾 ' + esc(product.farmer_name) + " · " + esc(product.quantity) + " " + esc(product.unit) + " in stock</p>" +
      "<p>" + esc(product.description || "No description provided.") + "</p>" +
      '<div class="form-row"><label>Quantity (' + esc(product.unit) + ")</label>" +
      '<input id="pdQty" type="number" min="1" step="0.5" max="' + product.quantity + '" value="1"></div>' +
      '<div class="hero-actions">' +
      (product.quantity > 0
        ? '<button class="btn" onclick="kmPDOrder(' + product.id + ')">Add to cart</button>'
        : '<button class="btn" disabled>Out of stock</button>') +
      (ownerEdit
        ? '<button class="btn light" onclick="kmPDClose();editProduct(' + product.id + ')">Edit product</button>'
        : "") +
      "</div>";
  }

  const modal = $("kmPD");
  if (modal) modal.classList.add("show");
}

function kmPDClose() {
  const modal = $("kmPD");
  if (modal) modal.classList.remove("show");
}

function kmPDOrder(productId) {
  const quantity = $("pdQty") ? $("pdQty").value : 1;
  kmPDClose();
  addToCart(productId, quantity);
}


function openAI() {
  const modal = $("aiModal");
  if (modal) modal.classList.add("show");
}

function closeAI() {
  const modal = $("aiModal");
  if (modal) modal.classList.remove("show");
}

function sendChat() {
  const input = $("chatInput");
  const box = $("chatMessages");
  if (!input || !box) return;

  const question = input.value.trim();
  if (!question) return;

  box.innerHTML += '<div class="msg user">' + esc(question) + "</div>";

  let answer =
    "I can help with products, prices, stock and bulk ordering. Ask about a product name, price or delivery.";
  const lower = question.toLowerCase();

  if (/minimum|bulk|quantity|stock/.test(lower)) {
    answer =
      "Each product card shows the available stock. Enter the quantity you need and add it to your cart. The server checks stock when you place the order.";
  } else if (/price|cost|cheap|rate/.test(lower)) {
    if (products.length) {
      const cheapest = products.slice().sort(function (a, b) {
        return a.price - b.price;
      })[0];
      answer =
        "The lowest listed price right now is " + cheapest.name + " at " + money(cheapest.price) + "/" + cheapest.unit + " from " + cheapest.farmer_name + ".";
    } else {
      answer = "Search the produce section to compare current farmer prices.";
    }
  } else if (/delivery|address|order|track/.test(lower)) {
    answer =
      "Add products to your cart, open the cart, enter a delivery address and place the order. Farmers can then confirm, dispatch and deliver it.";
  } else if (/farmer|sell|product/.test(lower)) {
    answer =
      "Farmers can register or log in, then add products, upload a photo, update price and stock, and manage incoming orders from their dashboard.";
  }

  box.innerHTML += '<div class="msg">' + esc(answer) + "</div>";
  box.scrollTop = box.scrollHeight;
  input.value = "";
}
