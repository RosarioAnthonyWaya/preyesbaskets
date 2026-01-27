(() => {
  const CART_KEY = "preyes_cart_v1";

  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  const openBtn = document.getElementById("cart-open-button");
  const closeBtn = document.getElementById("cart-close-button");

  const itemsEl = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const countEl = document.getElementById("nav-cart-count");

  if (!drawer || !overlay || !itemsEl || !totalEl || !countEl) return;

  // ---------- Storage ----------
  const loadCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  };
  const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));

  // ---------- Helpers ----------
  const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;

  const getCartCount = (cart) => cart.reduce((sum, i) => sum + (i.qty || 0), 0);
  const getCartTotal = (cart) => cart.reduce((sum, i) => sum + (i.qty || 0) * (i.price || 0), 0);

  function openCart() {
    drawer.hidden = false;
    overlay.hidden = false;

    drawer.classList.add("is-open");
    overlay.classList.add("is-open");

    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");

    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");

    // Wait for transition before hiding
    window.setTimeout(() => {
      drawer.hidden = true;
      overlay.hidden = true;
    }, 220);
  }

  // Force CLOSED on load (prevents the “pops up” issue)
  drawer.classList.remove("is-open");
  overlay.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.hidden = true;
  overlay.hidden = true;
  document.body.classList.remove("cart-open");

  // ---------- UI render ----------
  function render() {
    const cart = loadCart();

    // badge
    countEl.textContent = String(getCartCount(cart));
    totalEl.textContent = money(getCartTotal(cart));

    // items
    if (cart.length === 0) {
      itemsEl.innerHTML = `<p style="padding:14px;margin:0;">Your cart is empty.</p>`;
      return;
    }

    itemsEl.innerHTML = cart.map((item, idx) => {
      const line = (item.price || 0) * (item.qty || 0);
      const meta = item.optionsText ? `<div style="font-size:12px;opacity:.75;">${item.optionsText}</div>` : "";

      return `
        <div class="cart-item" style="display:flex;gap:12px;align-items:flex-start;padding:14px;border-bottom:1px solid rgba(0,0,0,.06);">
          <div style="flex:1;">
            <div style="font-weight:600;">${item.name || "Item"}</div>
            ${meta}
            <div style="margin-top:6px;opacity:.85;">${money(item.price)}</div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            <div style="font-weight:700;">${money(line)}</div>

            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" data-action="dec" data-idx="${idx}">−</button>
              <span>${item.qty}</span>
              <button type="button" data-action="inc" data-idx="${idx}">+</button>
            </div>

            <button type="button" data-action="rm" data-idx="${idx}" style="opacity:.7;">Remove</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- Cart mutations ----------
  function addItem(newItem) {
    const cart = loadCart();

    // same product + same options signature => merge qty
    const sig = `${newItem.id}__${newItem.optionsSignature || ""}`;
    const found = cart.find(i => `${i.id}__${i.optionsSignature || ""}` === sig);

    if (found) found.qty += newItem.qty;
    else cart.push(newItem);

    saveCart(cart);
    render();
    openCart();
  }

  function updateQty(idx, delta) {
    const cart = loadCart();
    if (!cart[idx]) return;

    cart[idx].qty = (cart[idx].qty || 1) + delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);

    saveCart(cart);
    render();
  }

  function removeIdx(idx) {
    const cart = loadCart();
    if (!cart[idx]) return;
    cart.splice(idx, 1);
    saveCart(cart);
    render();
  }

  // ---------- Read options from product block ----------
  function collectOptions(scopeEl) {
    // 1) Selected pills (recommended)
    const selected = Array.from(scopeEl.querySelectorAll(".option-grid")).map(grid => {
      const groupName = grid.getAttribute("data-option-group") || "";
      const chosenBtn = grid.querySelector(".option-pill.is-selected");
      const value = chosenBtn ? chosenBtn.getAttribute("data-option-value") : "";
      return { groupName, value };
    }).filter(x => x.groupName && x.value);

    // 2) Hidden inputs (fallback)
    const hidden = Array.from(scopeEl.querySelectorAll('input[type="hidden"][name]'))
      .map(inp => ({ groupName: inp.name, value: inp.value }))
      .filter(x => x.groupName && x.value);

    // merge (selected wins)
    const map = new Map();
    hidden.forEach(o => map.set(o.groupName, o.value));
    selected.forEach(o => map.set(o.groupName, o.value));

    const options = Array.from(map.entries()).map(([k, v]) => ({ groupName: k, value: v }));

    const optionsText = options.map(o => `${o.groupName}: ${o.value}`).join(" • ");
    const optionsSignature = options.map(o => `${o.groupName}=${o.value}`).join("|");

    return { options, optionsText, optionsSignature };
  }

  function lookupPrice(btn, scopeEl) {
    const mode = btn.getAttribute("data-price-mode");
    if (mode !== "lookup") return Number(btn.getAttribute("data-price")) || 0;

    const priceOption = btn.getAttribute("data-price-option"); // e.g. "package"
    const mapStr = btn.getAttribute("data-price-map") || "{}";

    let priceMap = {};
    try { priceMap = JSON.parse(mapStr); } catch {}

    // Find selected value for that option group
    const grid = scopeEl.querySelector(`.option-grid[data-option-group="${priceOption}"]`);
    const chosen = grid ? grid.querySelector(".option-pill.is-selected") : null;
    const chosenValue = chosen ? chosen.getAttribute("data-option-value") : "";

    if (!chosenValue) return null; // means “pick a package” should show
    return Number(priceMap[chosenValue]) || 0;
  }

  // ---------- Purple selection + price display ----------
  document.addEventListener("click", (e) => {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid");
    if (!grid) return;

    // toggle selection within group
    grid.querySelectorAll(".option-pill").forEach(b => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    // If there's a price display on the same product block, update it
    const scope = pill.closest(".product-detail-btn-box") || document;
    const addBtn = scope.querySelector(".cart-button");
    if (!addBtn) return;

    const displaySel = addBtn.getAttribute("data-price-display");
    if (!displaySel) return;

    const displayEl = scope.querySelector(displaySel);
    if (!displayEl) return;

    const price = lookupPrice(addBtn, scope);
    if (price == null) return;
    displayEl.textContent = money(price);
  });

  // ---------- Add to cart ----------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;

    const scopeSel = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSel ? document.querySelector(scopeSel) : null;
    const scope = scopeEl || btn.closest(".product-detail-btn-box") || document;

    const id = btn.getAttribute("data-product-id") || "item";
    const name = btn.getAttribute("data-name") || "Item";

    const { optionsText, optionsSignature } = collectOptions(scope);

    const price = lookupPrice(btn, scope);
    if (price == null) {
      alert("Please pick a package first.");
      return;
    }

    addItem({
      id,
      name,
      price,
      qty: 1,
      optionsText,
      optionsSignature
    });
  });

  // ---------- Cart item controls ----------
  itemsEl.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    const idxStr = e.target.getAttribute("data-idx");
    if (!action || idxStr == null) return;

    const idx = Number(idxStr);
    if (Number.isNaN(idx)) return;

    if (action === "inc") updateQty(idx, +1);
    if (action === "dec") updateQty(idx, -1);
    if (action === "rm") removeIdx(idx);
  });

  // ---------- Open/Close bindings ----------
  if (openBtn) openBtn.addEventListener("click", openCart);
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });

  // initial paint (no auto-open)
  render();
})();
