// cart.js – simple client-side cart using localStorage

(function () {
  const STORAGE_KEY = "preyes-cart-v1";
  let cart = [];

  // ---------- Storage helpers ----------
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
    return `£${amount.toFixed(2)}`;
  }

  // ---------- DOM references ----------
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

  // Nav/cart icon
  const navCartCountEl = document.getElementById("nav-cart-count");
  const navCartOpenBtn = document.getElementById("cart-open-button");

  // ---------- Derived totals ----------
  function getCartTotals() {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const shipping = cart.length ? 0 : 0; // tweak later if you want shipping
    const total = subtotal + shipping;
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return { subtotal, shipping, total, itemCount };
  }

  // ---------- Rendering ----------
  function updateNavCartCount() {
    if (!navCartCountEl) return;
    const { itemCount } = getCartTotals();
    navCartCountEl.textContent = itemCount;
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

      cart.forEach((item) => {
        const li = document.createElement("li");
        li.className = "cart-item-row";
        li.innerHTML = `
          <div class="cart-item-main">
            <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-meta">
                <span class="cart-item-qty">x${item.quantity}</span>
                <span class="cart-item-price">${formatGBP(item.price)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="cart-item-remove"
            data-remove-id="${item.id}"
          >
            Remove
          </button>
        `;
        itemsList.appendChild(li);
      });
    }

    const { subtotal, shipping, total } = getCartTotals();

    if (subtotalValue) subtotalValue.textContent = formatGBP(subtotal);
    if (shippingValue) shippingValue.textContent = formatGBP(shipping);
    if (totalValue) totalValue.textContent = formatGBP(total);

    updateNavCartCount();
  }

  // ---------- Cart actions ----------
  function addToCart({ id, name, price, quantity }) {
    const existing = cart.find((item) => item.id === id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ id, name, price, quantity });
    }
    saveCart();
    renderCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((item) => item.id !== id);
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
  // Product "Add to box" buttons
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".cart-button");
    if (!btn) return;

    const id = btn.dataset.productId;
    const name = btn.dataset.name;
    const price = parseFloat(btn.dataset.price || "0");

    let quantity = 1;
    const qtyInputId = btn.dataset.quantityInput;
    if (qtyInputId) {
      const input = document.getElementById(qtyInputId);
      if (input) {
        const value = parseInt(input.value, 10);
        if (!Number.isNaN(value) && value > 0) {
          quantity = value;
        }
      }
    }

    addToCart({ id, name, price, quantity });
    openDrawer();
  });

  // Remove item from cart
  if (itemsList) {
    itemsList.addEventListener("click", (event) => {
      const btn = event.target.closest(".cart-item-remove");
      if (!btn) return;
      const id = btn.dataset.removeId;
      removeFromCart(id);
    });
  }

  // Nav cart open button
  if (navCartOpenBtn) {
    navCartOpenBtn.addEventListener("click", () => {
      openDrawer();
    });
  }

  // Close drawer (overlay or X button)
  if (overlay) {
    overlay.addEventListener("click", closeDrawer);
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDrawer);
  }

  // Checkout button (for now you can wire this to Stripe checkout / WhatsApp)
 const checkoutBtn = document.querySelector(".cart-checkout-button");

if (checkoutBtn) {
  checkoutBtn.addEventListener("click", async () => {
    if (!cart.length) {
      return;
    }

    // Optional: show a basic loading state
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Redirecting...";

    try {
      const response = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cart),
      });

      if (!response.ok) {
        console.error("Checkout failed", await response.text());
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = "Checkout";
        alert("Something went wrong starting checkout. Please try again.");
        return;
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url; // Go to Stripe Checkout
      } else {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = "Checkout";
        alert("Could not get a checkout link. Please try again.");
      }
    } catch (err) {
      console.error(err);
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "Checkout";
      alert("Network error, please try again.");
    }
  });
}


  // ---------- Init ----------
  loadCart();
  renderCart();
})();
