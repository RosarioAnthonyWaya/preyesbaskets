// assets/js/cart.js
(function () {
  const STORAGE_KEY = "preyes-cart-v1";
  let cart = [];

  // ---------- Storage ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cart = raw ? JSON.parse(raw) : [];
    } catch (e) {
      cart = [];
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function formatGBP(amount) {
    return "£" + amount.toFixed(2);
  }

  // ---------- DOM refs ----------
  const drawer = document.getElementById("cart-drawer");
  const overlay = drawer ? drawer.querySelector(".cart-overlay") : null;
  const closeBtn = drawer ? drawer.querySelector(".cart-close") : null;
  const itemsList = drawer ? drawer.querySelector(".cart-items") : null;
  const emptyState = drawer ? drawer.querySelector(".cart-empty-state") : null;

  const subtotalValue = drawer
    ? drawer.querySelector(".cart-summary-row-subtotal .cart-summary-value")
    : null;
  const shippingValue = drawer
    ? drawer.querySelector(".cart-summary-row-shipping .cart-summary-value")
    : null;
  const totalValue = drawer
    ? drawer.querySelector(".cart-summary-row-total .cart-summary-value")
    : null;

  const checkoutBtn = drawer
    ? drawer.querySelector(".cart-checkout-button")
    : null;

  // Nav icon
  const navCartCountEl = document.getElementById("nav-cart-count");
  const navCartOpenBtn = document.getElementById("cart-open-button");

  // ---------- Totals ----------
  function getCartTotals() {
    const subtotal = cart.reduce(function (sum, item) {
      return sum + item.price * item.quantity;
    }, 0);

    const shipping = cart.length ? 0 : 0; // change later if needed
    const total = subtotal + shipping;
    const itemCount = cart.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);

    return { subtotal, shipping, total, itemCount };
  }

  // ---------- Rendering ----------
  function updateNavCartCount() {
    if (!navCartCountEl) return;
    const totals = getCartTotals();
    navCartCountEl.textContent = totals.itemCount;
  }

  function renderCart() {
    if (!drawer || !itemsList || !emptyState) return;

    itemsList.innerHTML = "";

    if (!cart.length) {
      emptyState.style.display = "block";
      itemsList.style.display = "none";
    } else {
      emptyState.style.display = "none";
      itemsList.style.display = "block";

      cart.forEach(function (item) {
        var li = document.createElement("li");
        li.className = "cart-item-row";
        li.innerHTML =
          '<div class="cart-item-main">' +
            '<div class="cart-item-info">' +
              '<div class="cart-item-name">' + item.name + "</div>" +
              '<div class="cart-item-meta">' +
                '<span class="cart-item-qty">x' + item.quantity + "</span>" +
                '<span class="cart-item-price">' + formatGBP(item.price) + "</span>" +
              "</div>" +
            "</div>" +
          "</div>" +
          '<button type="button" class="cart-item-remove" data-remove-id="' + item.id + '">Remove</button>';

        itemsList.appendChild(li);
      });
    }

    var totals = getCartTotals();
    if (subtotalValue) subtotalValue.textContent = formatGBP(totals.subtotal);
    if (shippingValue) shippingValue.textContent = formatGBP(totals.shipping);
    if (totalValue) totalValue.textContent = formatGBP(totals.total);

    updateNavCartCount();
  }

  // ---------- Cart actions ----------
  function addToCart(config) {
    var id = config.id;
    var name = config.name;
    var price = config.price;
    var quantity = config.quantity;

    var existing = cart.find(function (item) {
      return item.id === id;
    });

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ id: id, name: name, price: price, quantity: quantity });
    }

    saveCart();
    renderCart();
  }

  function removeFromCart(id) {
    cart = cart.filter(function (item) {
      return item.id !== id;
    });
    saveCart();
    renderCart();
  }

  // ---------- Drawer open/close ----------
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    document.body.classList.add("cart-open");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    document.body.classList.remove("cart-open");
  }

  // ---------- Event listeners ----------

  // 1. Add-to-cart buttons
  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".cart-button");
    if (!btn) return;

    // Only handle *real* cart buttons with product data
    var id = btn.dataset.productId;
    if (!id) return;

    var name = btn.dataset.name || "Gift item";
    var price = parseFloat(btn.dataset.price || "0");

    var quantity = 1;
    var qtyInputId = btn.dataset.quantityInput;
    if (qtyInputId) {
      var input = document.getElementById(qtyInputId);
      if (input) {
        var value = parseInt(input.value, 10);
        if (!isNaN(value) && value > 0) {
          quantity = value;
        }
      }
    }

    addToCart({ id: id, name: name, price: price, quantity: quantity });
    openDrawer();
  });

  // 2. Remove item
  if (itemsList) {
    itemsList.addEventListener("click", function (event) {
      var btn = event.target.closest(".cart-item-remove");
      if (!btn) return;
      var id = btn.dataset.removeId;
      removeFromCart(id);
    });
  }

  // 3. Open drawer from nav icon
  if (navCartOpenBtn) {
    navCartOpenBtn.addEventListener("click", function () {
      openDrawer();
    });
  }

  // 4. Close drawer
  if (overlay) {
    overlay.addEventListener("click", closeDrawer);
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDrawer);
  }

  // 5. Checkout (stub for now)
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function () {
      if (!cart.length) return;
      alert("Checkout coming soon. For now, screenshot your box and send it to Preye.");
    });
  }

  // ---------- Init ----------
  loadCart();
  renderCart();
})();
