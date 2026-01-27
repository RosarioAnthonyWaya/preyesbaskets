/* /assets/js/cart.js */
(function () {
  const CART_KEY = "preyes_cart_v1";

  // ===== Helpers =====
  const money = (n) => `£${Number(n || 0).toFixed(2)}`;
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function cartCount(cart) {
    return cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  }

  function cartTotal(cart) {
    return cart.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);
  }

  // ===== Drawer Elements =====
  const drawer = qs("#cart-drawer");
  const overlay = qs("#cart-overlay");
  const openBtn = qs("#cart-open-button");
  const closeBtn = qs("#cart-close-button");
  const navCount = qs("#nav-cart-count");
  const itemsEl = qs("#cart-items");
  const totalEl = qs("#cart-total");

  // If drawer markup isn’t on the page, don’t crash
  if (!drawer || !overlay) {
    // Still update count if possible
    const cart = loadCart();
    if (navCount) navCount.textContent = String(cartCount(cart));
    return;
  }

  function isOpen() {
    return drawer.classList.contains("is-open");
  }

  function openCart() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    overlay.classList.add("is-open");
    document.documentElement.classList.add("cart-lock");
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.classList.remove("is-open");
    overlay.hidden = true;
    document.documentElement.classList.remove("cart-lock");
  }

  // ===== Render =====
  function renderCart() {
    const cart = loadCart();

    if (navCount) navCount.textContent = String(cartCount(cart));
    if (totalEl) totalEl.textContent = money(cartTotal(cart));

    if (!itemsEl) return;

    if (cart.length === 0) {
      itemsEl.innerHTML = `<p>Your cart is empty.</p>`;
      return;
    }

    itemsEl.innerHTML = cart
      .map((item, idx) => {
        const optText = item.options
          ? Object.entries(item.options)
              .map(([k, v]) => `<div class="cart-opt"><small>${k}: ${v}</small></div>`)
              .join("")
          : "";

        return `
          <div class="cart-item" data-index="${idx}">
            <div class="cart-item-main">
              <strong>${item.name}</strong>
              ${optText}
              <div class="cart-item-row">
                <span>${money(item.price)}</span>
                <div class="cart-qty">
                  <button type="button" class="qty-minus" aria-label="Decrease">−</button>
                  <span class="qty-val">${item.qty}</span>
                  <button type="button" class="qty-plus" aria-label="Increase">+</button>
                </div>
              </div>
            </div>
            <button type="button" class="cart-remove" aria-label="Remove">Remove</button>
          </div>
        `;
      })
      .join("");
  }

  // ===== Option reading =====
  function getSelectedOption(scopeEl, groupName) {
    const grid = qs(`.option-grid[data-option-group="${groupName}"]`, scopeEl);
    if (!grid) return "";
    const selected = qs(".option-pill.is-selected", grid);
    return selected ? selected.getAttribute("data-option-value") || "" : "";
  }

  function requireOption(scopeEl, groupName) {
    const v = getSelectedOption(scopeEl, groupName);
    return v && v.trim().length > 0;
  }

  function getPriceFromMap(btn, selectedValue) {
    const mapRaw = btn.getAttribute("data-price-map");
    if (!mapRaw) return 0;
    let map;
    try {
      map = JSON.parse(mapRaw);
    } catch {
      return 0;
    }
    return Number(map[selectedValue] || 0);
  }

  // ===== Add to cart =====
  function addToCart(payload) {
    const cart = loadCart();

    // “same line item” merge rule: same id + same options => increase qty
    const key = JSON.stringify({ id: payload.id, options: payload.options || {} });
    const existing = cart.find((x) => JSON.stringify({ id: x.id, options: x.options || {} }) === key);

    if (existing) {
      existing.qty += payload.qty || 1;
    } else {
      cart.push({
        id: payload.id,
        name: payload.name,
        price: payload.price,
        qty: payload.qty || 1,
        options: payload.options || {}
      });
    }

    saveCart(cart);
    renderCart();
    openCart(); // open only AFTER add
  }

  // ===== EVENTS =====

  // Open cart on nav button click
  if (openBtn) {
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      renderCart();
      openCart();
    });
  }

  // Close cart
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) closeCart();
  });

  // Option pill selection (adds .is-selected and updates price display)
  document.addEventListener("click", (e) => {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid");
    if (!grid) return;

    // Toggle selected state within this grid
    qsa(".option-pill", grid).forEach((b) => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    // Update price display if there is an add-to-cart button in the same scope
    const scope = pill.closest(".product-detail-btn-box") || document;
    const btn = qs(".cart-button[data-price-mode='lookup']", scope);
    if (!btn) return;

    const displaySel = btn.getAttribute("data-price-display");
    const displayEl = displaySel ? qs(displaySel) : null;

    const optionName = btn.getAttribute("data-price-option") || "package";
    const selectedVal = getSelectedOption(scope, optionName);
    const price = getPriceFromMap(btn, selectedVal);

    if (displayEl) displayEl.textContent = money(price);
  });

  // Add to cart click
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;

    const scopeSel = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSel ? qs(scopeSel) : btn.closest(".product-detail-btn-box");

    if (!scopeEl) {
      alert("Cart error: options scope not found.");
      return;
    }

    // Require package selection if package option grid exists in scope
    const hasPackageGrid = qs(`.option-grid[data-option-group="package"]`, scopeEl);
    if (hasPackageGrid && !requireOption(scopeEl, "package")) {
      alert("Please pick a package first.");
      return;
    }

    const id = btn.getAttribute("data-product-id") || "unknown";
    const name = btn.getAttribute("data-name") || "Item";

    const selectedPackage = hasPackageGrid ? getSelectedOption(scopeEl, "package") : "";
    const price =
      btn.getAttribute("data-price-mode") === "lookup"
        ? getPriceFromMap(btn, selectedPackage)
        : Number(btn.getAttribute("data-price") || 0);

    const options = {};
    if (selectedPackage) options.package = selectedPackage;

    // Card message (optional)
    const msg = qs('textarea[name="card_message"]', scopeEl);
    if (msg && msg.value.trim()) options.card_message = msg.value.trim();

    addToCart({ id, name, price, qty: 1, options });
  });

  // Cart quantity / remove
  document.addEventListener("click", (e) => {
    const itemEl = e.target.closest(".cart-item");
    if (!itemEl) return;

    const idx = Number(itemEl.getAttribute("data-index"));
    const cart = loadCart();
    if (!Number.isFinite(idx) || !cart[idx]) return;

    if (e.target.closest(".cart-remove")) {
      cart.splice(idx, 1);
      saveCart(cart);
      renderCart();
      if (cart.length === 0) closeCart();
      return;
    }

    if (e.target.closest(".qty-plus")) {
      cart[idx].qty += 1;
      saveCart(cart);
      renderCart();
      return;
    }

    if (e.target.closest(".qty-minus")) {
      cart[idx].qty = Math.max(1, cart[idx].qty - 1);
      saveCart(cart);
      renderCart();
      return;
    }
  });

  // Initial render (DO NOT OPEN)
  renderCart();
})();
