/* assets/js/cart.js */
(() => {
  const STORAGE_KEY = "pb_cart_v1";

  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  const itemsEl = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  const openBtn = document.getElementById("cart-open-button");
  const closeBtn = document.getElementById("cart-close-button");
  const countEl = document.getElementById("nav-cart-count");

  if (!drawer || !overlay || !itemsEl || !totalEl) return;

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function money(n) {
    const x = Number(n || 0);
    return `£${x.toFixed(2)}`;
  }

  function calcTotal(cart) {
    return cart.reduce((sum, it) => sum + (Number(it.price) * Number(it.qty || 1)), 0);
  }

  function updateBadge(cart) {
    if (!countEl) return;
    const count = cart.reduce((sum, it) => sum + Number(it.qty || 1), 0);
    countEl.textContent = String(count);
  }

  function renderCart() {
    const cart = readCart();

    if (!cart.length) {
      itemsEl.innerHTML = `<p style="margin:0;">Your cart is empty.</p>`;
      totalEl.textContent = money(0);
      updateBadge(cart);
      return;
    }

    itemsEl.innerHTML = cart.map((it, idx) => {
      const lineTotal = Number(it.price) * Number(it.qty || 1);
      const optText = it.options ? Object.entries(it.options).map(([k,v]) => `${k}: ${v}`).join(" • ") : "";
      return `
        <div class="cart-item" data-index="${idx}" style="display:flex; gap:12px; padding:12px 0; border-bottom:1px solid #eee;">
          <div style="flex:1;">
            <div style="font-weight:600;">${it.name || "Item"}</div>
            ${optText ? `<div style="font-size:12px; opacity:.75; margin-top:4px;">${optText}</div>` : ""}
            <div style="margin-top:8px; display:flex; gap:10px; align-items:center;">
              <button type="button" class="cart-qty-btn" data-action="dec" aria-label="Decrease quantity">−</button>
              <span style="min-width:22px; text-align:center;">${Number(it.qty || 1)}</span>
              <button type="button" class="cart-qty-btn" data-action="inc" aria-label="Increase quantity">+</button>
              <span style="margin-left:auto; font-weight:600;">${money(lineTotal)}</span>
            </div>
          </div>
          <button type="button" class="cart-remove-btn" data-action="remove" aria-label="Remove item" style="border:none; background:transparent; font-size:18px; cursor:pointer;">×</button>
        </div>
      `;
    }).join("");

    totalEl.textContent = money(calcTotal(cart));
    updateBadge(cart);
  }

  function openCart() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    document.body.classList.add("cart-open");
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    document.body.classList.remove("cart-open");
  }

  // ----- Controls: open/close -----
  if (openBtn) openBtn.addEventListener("click", () => {
    renderCart();
    openCart();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeCart);

  overlay.addEventListener("click", closeCart);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });

  // ----- Item controls inside cart -----
  itemsEl.addEventListener("click", (e) => {
    const row = e.target.closest(".cart-item");
    if (!row) return;

    const index = Number(row.getAttribute("data-index"));
    const cart = readCart();
    const item = cart[index];
    if (!item) return;

    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.getAttribute("data-action");

    if (action === "remove") {
      cart.splice(index, 1);
      writeCart(cart);
      renderCart();
      return;
    }

    if (action === "inc") item.qty = Number(item.qty || 1) + 1;
    if (action === "dec") item.qty = Math.max(1, Number(item.qty || 1) - 1);

    cart[index] = item;
    writeCart(cart);
    renderCart();
  });

  // ----- Add-to-cart buttons on product pages -----
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;

    const scopeSel = btn.getAttribute("data-options-scope");
    const scope = scopeSel ? document.querySelector(scopeSel) : document;

    // Required option: "package"
    const pkgInput = scope ? scope.querySelector('input[name="package"]') : null;
    const pkgValue = pkgInput ? (pkgInput.value || "").trim() : "";

    if (!pkgValue) {
      alert("Please pick a package first.");
      return;
    }

    // Price lookup map
    const mapStr = btn.getAttribute("data-price-map") || "{}";
    let priceMap = {};
    try { priceMap = JSON.parse(mapStr); } catch {}

    const price = Number(priceMap[pkgValue] || 0);
    if (!price) {
      alert("Invalid package price. Please try again.");
      return;
    }

    const name = btn.getAttribute("data-name") || "Item";

    const cart = readCart();
    cart.push({
      name,
      price,
      qty: 1,
      options: { package: pkgValue }
    });

    writeCart(cart);
    renderCart();
    updateBadge(cart);

    // Don’t auto-open. Just confirm.
    // If you want a subtle UI feedback, keep it as alert or remove it.
    // alert("Added to cart");
  });

  // Initial badge render only (NO auto-open)
  renderCart();
})();
