(function () {
  // ====== Config ======
  const STORAGE_KEY = "preyes_cart_v1"; // KEEP SAME KEY (do not change)

  // ====== Helpers ======
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function money(n) {
    const v = Number(n) || 0;
    return `£${v.toFixed(2)}`;
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    updateNavCount(cart);
  }

  function updateNavCount(cart = loadCart()) {
    const countEl = qs("#nav-cart-count");
    if (!countEl) return;
    const count = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    countEl.textContent = String(count);
  }

  // ====== Cart drawer controls ======
  const drawer = qs("#cart-drawer");
  const overlay = qs("#cart-overlay");
  const openBtn = qs("#cart-open-button");
  const closeBtn = qs("#cart-close-button");

  function openCart() {
    if (!drawer || !overlay) return;
    drawer.classList.add("is-open");
    overlay.hidden = false;
    document.documentElement.classList.add("cart-lock");
    document.body.classList.add("cart-lock");
  }

  function closeCart() {
    if (!drawer || !overlay) return;
    drawer.classList.remove("is-open");
    overlay.hidden = true;
    document.documentElement.classList.remove("cart-lock");
    document.body.classList.remove("cart-lock");
  }

  if (openBtn) openBtn.addEventListener("click", openCart);
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  if (overlay) overlay.addEventListener("click", closeCart);

  // ====== Option reading ======
  function getSelectedOption(scopeEl, groupName) {
    const grid = qs(`.option-grid[data-option-group="${groupName}"]`, scopeEl);
    if (!grid) return "";
    const selected = qs(`.option-pill.is-selected`, grid);
    return selected ? selected.getAttribute("data-option-value") || "" : "";
  }

  function getSelectedOptions(scopeEl, groupName) {
    const grid = qs(`.option-grid[data-option-group="${groupName}"]`, scopeEl);
    if (!grid) return [];
    return qsa(`.option-pill.is-selected`, grid).map((b) => b.getAttribute("data-option-value") || "");
  }

  function requireOption(scopeEl, groupName) {
    const grid = qs(`.option-grid[data-option-group="${groupName}"]`, scopeEl);
    if (!grid) return true; // nothing to require
    const selected = grid.querySelector(".option-pill.is-selected");
    return !!selected;
  }

  function getPriceFromMap(btn, selectedValue) {
    const mapRaw = btn.getAttribute("data-price-map") || "{}";
    let map = {};
    try {
      map = JSON.parse(mapRaw);
    } catch {}
    return Number(map[selectedValue] || 0);
  }

  function getAddonTotal(btn, scopeEl) {
    const addonMapRaw = btn.getAttribute("data-addon-map") || "{}";
    let addonMap = {};
    try {
      addonMap = JSON.parse(addonMapRaw);
    } catch {}

    const selectedAddons = getSelectedOptions(scopeEl, "addon");
    return selectedAddons.reduce((sum, a) => sum + Number(addonMap[a] || 0), 0);
  }

  function computeDisplayedTotal(btn, scopeEl) {
    const mode = btn.getAttribute("data-price-mode") || "fixed";

    if (mode === "lookup") {
      const optionName = btn.getAttribute("data-price-option") || "package";
      const selectedVal = getSelectedOption(scopeEl, optionName);
      const base = getPriceFromMap(btn, selectedVal);
      const addons = getAddonTotal(btn, scopeEl);
      return base + addons;
    }

    // fixed mode
    const base = Number(btn.getAttribute("data-price") || 0);
    const addons = getAddonTotal(btn, scopeEl);
    return base + addons;
  }

  // ====== UI rendering ======
  function renderCart() {
    const cart = loadCart();
    updateNavCount(cart);

    const itemsEl = qs("#cart-items");
    const totalEl = qs("#cart-total");
    if (!itemsEl || !totalEl) return;

    itemsEl.innerHTML = "";

    let total = 0;

    cart.forEach((item, idx) => {
      const qty = Number(item.qty) || 1;
      const price = Number(item.price) || 0;
      const line = price * qty;
      total += line;

      const optionsHtml = item.options
        ? Object.entries(item.options)
            .map(([k, v]) => `<div class="cart-item-opt"><small>${k}: ${String(v)}</small></div>`)
            .join("")
        : "";

      const row = document.createElement("div");
      row.className = "cart-item";
      row.setAttribute("data-index", String(idx));
      row.innerHTML = `
        <div class="cart-item-left">
          <div class="cart-item-name"><strong>${item.name}</strong></div>
          ${optionsHtml}
          <div class="cart-item-line">${money(price)} each</div>
        </div>

        <div class="cart-item-right">
          <div class="cart-item-line-total"><strong>${money(line)}</strong></div>
          <div class="cart-qty">
            <button type="button" class="qty-minus" aria-label="Decrease quantity">−</button>
            <span class="qty-val">${qty}</span>
            <button type="button" class="qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="cart-remove">Remove</button>
        </div>
      `;
      itemsEl.appendChild(row);
    });

    totalEl.textContent = money(total);
  }

  function addToCart(payload) {
    const cart = loadCart();

    // Make item unique by id + options signature
    const signature = JSON.stringify(payload.options || {});
    const existing = cart.find((x) => x.id === payload.id && JSON.stringify(x.options || {}) === signature);

    if (existing) {
      existing.qty += payload.qty || 1;
    } else {
      cart.push(payload);
    }

    saveCart(cart);
    renderCart();
    openCart();
  }

  // ====== Option clicking (single select + multi toggle) ======
  document.addEventListener("click", (e) => {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid");
    if (!grid) return;

    const isMulti = grid.getAttribute("data-multi") === "true";

    if (isMulti) {
      // toggle
      pill.classList.toggle("is-selected");
    } else {
      // single select
      grid.querySelectorAll(".option-pill").forEach((b) => b.classList.remove("is-selected"));
      pill.classList.add("is-selected");
    }

    // Update price display in the same scope
    const scope = pill.closest(".product-detail-btn-box") || document;
    const btn = qs(".cart-button", scope);
    if (!btn) return;

    const displaySel = btn.getAttribute("data-price-display");
    const displayEl = displaySel ? qs(displaySel) : null;

    const total = computeDisplayedTotal(btn, scope);
    if (displayEl) displayEl.textContent = money(total);
  });

  // ====== Add to cart click ======
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;

    const scopeSel = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSel ? qs(scopeSel) : btn.closest(".product-detail-btn-box");

    if (!scopeEl) {
      alert("Cart error: options scope not found.");
      return;
    }

    // Require package selection only if package grid exists
    const hasPackageGrid = qs(`.option-grid[data-option-group="package"]`, scopeEl);
    if (hasPackageGrid && !requireOption(scopeEl, "package")) {
      alert("Please pick a package first.");
      return;
    }

    const id = btn.getAttribute("data-product-id") || "unknown";
    const name = btn.getAttribute("data-name") || "Item";

    // Build options
    const options = {};

    const selectedPackage = hasPackageGrid ? getSelectedOption(scopeEl, "package") : "";
    if (selectedPackage) options.package = selectedPackage;

    const selectedAddons = getSelectedOptions(scopeEl, "addon");
    if (selectedAddons.length) options.addons = selectedAddons.join(", ");

    // Card message
    const msg = qs('textarea[name="card_message"]', scopeEl);
    if (msg && msg.value.trim()) options.card_message = msg.value.trim();

    // Compute final unit price
    const unitPrice = computeDisplayedTotal(btn, scopeEl);

    addToCart({ id, name, price: unitPrice, qty: 1, options });
  });

  // ====== Qty / remove handlers ======
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
