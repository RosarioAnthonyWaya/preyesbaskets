(function () {
  const CART_KEY = "preyes_cart_v1";

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));

  const drawer = qs("#cart-drawer");
  const overlay = qs("#cart-overlay");
  const openBtn = qs("#cart-open-button");
  const closeBtn = qs("#cart-close-button");
  const navCount = qs("#nav-cart-count");

  const itemsWrap = qs("#cart-items");
  const totalEl = qs("#cart-total");

  if (!drawer || !overlay || !openBtn || !closeBtn || !itemsWrap || !totalEl) return;

  // ---- HARD RESET ON LOAD (prevents "starts open" / weird state) ----
  overlay.hidden = true;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("cart-lock");
  document.body.classList.remove("cart-lock");

  // ---- storage helpers ----
  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function money(n) {
    const x = Number(n) || 0;
    return `£${x.toFixed(2)}`;
  }

  // ---- UI open/close ----
  function openCart() {
    overlay.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("cart-lock");
    document.body.classList.add("cart-lock");
  }

  function closeCart() {
    overlay.hidden = true;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("cart-lock");
    document.body.classList.remove("cart-lock");
  }

  // ---- render ----
  function calc(cart) {
    let qty = 0;
    let total = 0;
    cart.forEach(i => {
      const q = Number(i.qty) || 0;
      const p = Number(i.price) || 0;
      qty += q;
      total += q * p;
    });
    return { qty, total };
  }

  function updateBadge(cart) {
    const { qty } = calc(cart);
    if (navCount) navCount.textContent = String(qty);
  }

  function render() {
    const cart = readCart();
    itemsWrap.innerHTML = "";

    if (!cart.length) {
      itemsWrap.innerHTML = `<p style="margin:0; padding: 16px;">Your cart is empty.</p>`;
      totalEl.textContent = money(0);
      updateBadge(cart);
      return;
    }

    cart.forEach((item, idx) => {
      const line = (Number(item.price) || 0) * (Number(item.qty) || 0);

      const opts = item.options
        ? Object.entries(item.options).map(([k, v]) => `<div style="font-size:12px; opacity:.75;">${k}: ${v}</div>`).join("")
        : "";

      const row = document.createElement("div");
      row.className = "cart-row";
      row.style.cssText = "padding:16px; border-bottom:1px solid #eee; display:flex; gap:12px; justify-content:space-between;";

      row.innerHTML = `
        <div style="flex:1;">
          <div style="font-weight:600;">${item.name || "Item"}</div>
          ${opts}
          <div style="margin-top:6px; opacity:.8;">${money(item.price)} × ${item.qty}</div>
        </div>

        <div style="text-align:right; min-width:120px;">
          <div style="font-weight:700;">${money(line)}</div>

          <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end; align-items:center;">
            <button type="button" data-action="dec" data-idx="${idx}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-action="inc" data-idx="${idx}">+</button>
          </div>

          <button type="button" data-action="remove" data-idx="${idx}" style="margin-top:8px;">Remove</button>
        </div>
      `;

      itemsWrap.appendChild(row);
    });

    const { total } = calc(cart);
    totalEl.textContent = money(total);
    updateBadge(cart);
  }

  // ---- cart mutations ----
  function upsertItem(newItem) {
    const cart = readCart();

    // merge rule: same product id + same options => increase qty
    const key = (i) => JSON.stringify({ id: i.id, options: i.options || {} });
    const existingIndex = cart.findIndex(i => key(i) === key(newItem));

    if (existingIndex >= 0) {
      cart[existingIndex].qty += newItem.qty;
    } else {
      cart.push(newItem);
    }

    writeCart(cart);
    render();
  }

  function changeQty(idx, delta) {
    const cart = readCart();
    if (!cart[idx]) return;

    cart[idx].qty = (Number(cart[idx].qty) || 0) + delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);

    writeCart(cart);
    render();
  }

  function removeIdx(idx) {
    const cart = readCart();
    cart.splice(idx, 1);
    writeCart(cart);
    render();
  }

  // ---- option helpers (your "pick a package" logic) ----
  function getSelectedOption(scopeEl, optionName) {
    // expects: <input type="hidden" name="package" ... value="Classic Romance">
    const hidden = qs(`input[name="${optionName}"]`, scopeEl);
    if (hidden && hidden.value) return hidden.value.trim();

    // fallback: selected pill
    const pill = qs(`.option-grid[data-option-group="${optionName}"] .option-pill.is-selected`, scopeEl);
    return pill ? pill.getAttribute("data-option-value") : "";
  }

  function getPriceFromMap(btn, selectedOptionValue) {
    const mapRaw = btn.getAttribute("data-price-map") || "{}";
    let map = {};
    try { map = JSON.parse(mapRaw); } catch { map = {}; }
    return Number(map[selectedOptionValue]) || 0;
  }

  function addToCartFromButton(btn) {
    const name = btn.getAttribute("data-name") || "Item";
    const id = btn.getAttribute("data-product-id") || name.toLowerCase().replace(/\s+/g, "-");

    const scopeSel = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSel ? qs(scopeSel) : document;

    const priceMode = btn.getAttribute("data-price-mode") || "fixed";

    let options = {};
    let price = 0;

    if (priceMode === "lookup") {
      const optionKey = btn.getAttribute("data-price-option") || "package";
      const selected = getSelectedOption(scopeEl, optionKey);

      if (!selected) {
        alert("Please pick a package first.");
        return;
      }

      options[optionKey] = selected;
      price = getPriceFromMap(btn, selected);

      const displaySel = btn.getAttribute("data-price-display");
      if (displaySel) {
        const displayEl = qs(displaySel);
        if (displayEl) displayEl.textContent = money(price);
      }
    } else {
      price = Number(btn.getAttribute("data-price") || 0);
    }

    upsertItem({ id, name, price, qty: 1, options });
    openCart();
  }

  // ---- events ----
  openBtn.addEventListener("click", openCart);
  closeBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });

  // add-to-cart buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;
    addToCartFromButton(btn);
  });

  // qty/remove inside cart
  itemsWrap.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("button[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.getAttribute("data-action");
    const idx = Number(actionBtn.getAttribute("data-idx"));
    if (Number.isNaN(idx)) return;

    if (action === "inc") changeQty(idx, +1);
    if (action === "dec") changeQty(idx, -1);
    if (action === "remove") removeIdx(idx);
  });

  // initial paint
  render();
})();
