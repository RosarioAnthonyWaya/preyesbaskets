/* assets/js/cart.js */
(function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  const itemsEl = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const badgeEl = document.getElementById("nav-cart-count");

  const openBtn = document.getElementById("cart-open-button");
  const closeBtn = document.getElementById("cart-close-button");

  if (!drawer || !overlay || !itemsEl || !totalEl) return;

  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function money(n) {
    const num = Number(n) || 0;
    return `£${num.toFixed(2)}`;
  }

  function calcTotal(cart) {
    return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  }

  function updateBadge() {
    const cart = readCart();
    const count = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    if (badgeEl) badgeEl.textContent = String(count);
  }

  function openCart() {
    overlay.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");
    // wait for transition then hide overlay
    setTimeout(() => {
      overlay.hidden = true;
    }, 250);
  }

  function renderCart() {
    const cart = readCart();

    if (!cart.length) {
      itemsEl.innerHTML = `<p style="opacity:.75;margin:0;">Your cart is empty.</p>`;
      totalEl.textContent = money(0);
      updateBadge();
      return;
    }

    itemsEl.innerHTML = cart.map((item, idx) => {
      const title = item.name || "Item";
      const opt = item.package ? `Package: ${item.package}` : "";
      const price = money(item.price);
      const qty = Number(item.qty) || 1;

      return `
        <div class="cart-item" data-index="${idx}">
          <div>
            <p class="cart-item-title">${title}</p>
            ${opt ? `<p class="cart-item-meta">${opt}</p>` : ``}
            <p class="cart-item-meta">${price} each</p>
          </div>

          <div style="text-align:right;">
            <div class="cart-item-actions">
              <button type="button" class="cart-qty-btn" data-action="dec" aria-label="Decrease quantity">−</button>
              <strong>${qty}</strong>
              <button type="button" class="cart-qty-btn" data-action="inc" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" class="cart-remove-btn" data-action="remove">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    totalEl.textContent = money(calcTotal(cart));
    updateBadge();
  }

  // --- Add to cart handler (delegated) ---
  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".cart-button");
    if (!addBtn) return;

    const productId = addBtn.getAttribute("data-product-id") || "unknown";
    const name = addBtn.getAttribute("data-name") || "Item";

    const scopeSel = addBtn.getAttribute("data-options-scope");
    const scope = scopeSel ? document.querySelector(scopeSel) : null;

    // Read selected package from hidden input inside scope
    let pkg = "";
    if (scope) {
      const pkgInput = scope.querySelector('input[name="package"]');
      if (pkgInput) pkg = (pkgInput.value || "").trim();
    }

    if (!pkg) {
      alert("Please pick a package first.");
      return;
    }

    // Price lookup via data-price-map (based on package name)
    let price = 0;
    const priceMapRaw = addBtn.getAttribute("data-price-map");
    if (priceMapRaw) {
      try {
        const map = JSON.parse(priceMapRaw);
        price = Number(map[pkg]) || 0;
      } catch {
        price = 0;
      }
    }

    if (!price) {
      alert("Price not found for this package. Please refresh and try again.");
      return;
    }

    const cart = readCart();

    // Merge rule: same product + same package = increase qty
    const existing = cart.find(x => x.productId === productId && x.package === pkg);
    if (existing) {
      existing.qty = (Number(existing.qty) || 1) + 1;
    } else {
      cart.push({
        productId,
        name,
        package: pkg,
        price,
        qty: 1
      });
    }

    writeCart(cart);
    renderCart();
    openCart(); // opens ONLY after add-to-cart (not on load)
  });

  // Qty / remove buttons (inside cart)
  itemsEl.addEventListener("click", (e) => {
    const row = e.target.closest(".cart-item");
    if (!row) return;

    const idx = Number(row.getAttribute("data-index"));
    const action = e.target.getAttribute("data-action");
    if (!Number.isFinite(idx) || !action) return;

    const cart = readCart();
    const item = cart[idx];
    if (!item) return;

    if (action === "inc") {
      item.qty = (Number(item.qty) || 1) + 1;
    }

    if (action === "dec") {
      const next = (Number(item.qty) || 1) - 1;
      item.qty = Math.max(1, next);
    }

    if (action === "remove") {
      cart.splice(idx, 1);
    }

    writeCart(cart);
    renderCart();
  });

  // Open / close controls
  if (openBtn) openBtn.addEventListener("click", () => { renderCart(); openCart(); });
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCart();
  });

  // Package pill selection handler (works for mobile+desktop scopes)
  document.addEventListener("click", (e) => {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid");
    if (!grid) return;

    // only within a product option box
    const scope = pill.closest(".product-detail-btn-box");
    if (!scope) return;

    // toggle selected styling
    grid.querySelectorAll(".option-pill").forEach(b => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    const value = pill.getAttribute("data-option-value") || "";
    const pkgInput = scope.querySelector('input[name="package"]');
    if (pkgInput) pkgInput.value = value;

    // update local displayed price if present
    const priceMapRaw = scope.querySelector(".cart-button")?.getAttribute("data-price-map");
    const priceDisplaySel = scope.querySelector(".cart-button")?.getAttribute("data-price-display");

    if (priceMapRaw && priceDisplaySel) {
      try {
        const map = JSON.parse(priceMapRaw);
        const p = Number(map[value]) || 0;
        const priceEl = document.querySelector(priceDisplaySel);
        if (priceEl) priceEl.textContent = money(p);
      } catch {}
    }
  });

  // Init badge + render (does NOT open)
  updateBadge();
  renderCart();
})();
