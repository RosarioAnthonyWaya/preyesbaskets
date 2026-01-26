/* assets/js/cart.js */
(function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

  // Shipping exception rule (only these items AND only these items => £8/delivery)
  const SHIPPING_EXCEPTION_IDS = new Set(["holiday-cheer", "joyful-baskets"]);
  const SHIPPING_STANDARD = 11;
  const SHIPPING_EXCEPTION = 8;

  function safeNumber(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  function moneyGBP(v) {
    return `£${safeNumber(v).toFixed(2)}`;
  }

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
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart } }));
  }

  function getDeliveriesCount() {
    const raw = localStorage.getItem(DELIVERY_KEY);
    const n = safeNumber(raw, 1);
    return Math.max(1, Math.floor(n));
  }

  function setDeliveriesCount(n) {
    const val = Math.max(1, Math.floor(safeNumber(n, 1)));
    localStorage.setItem(DELIVERY_KEY, String(val));
    window.dispatchEvent(new CustomEvent("deliveries:updated", { detail: { deliveries: val } }));
    return val;
  }

  function cartSubtotal(cart) {
    return cart.reduce((sum, item) => {
      const price = safeNumber(item.price, 0);
      const qty = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
      return sum + price * qty;
    }, 0);
  }

  function cartHasOnlyExceptionItems(cart) {
    if (!cart.length) return false;
    return cart.every((item) => SHIPPING_EXCEPTION_IDS.has(item.id));
  }

  function shippingPerDelivery(cart) {
    return cartHasOnlyExceptionItems(cart) ? SHIPPING_EXCEPTION : SHIPPING_STANDARD;
  }

  function totalShipping(cart, deliveriesCount) {
    const per = shippingPerDelivery(cart);
    const d = Math.max(1, Math.floor(safeNumber(deliveriesCount, 1)));
    return per * d;
  }

  function cartTotal(cart) {
    const deliveries = getDeliveriesCount();
    return cartSubtotal(cart) + totalShipping(cart, deliveries);
  }

  function buildVariantKey(options) {
    if (!options || typeof options !== "object") return "";
    const keys = Object.keys(options).sort();
    return keys.map((k) => `${k}:${String(options[k]).trim()}`).join("|");
  }

  function findCartItemIndex(cart, id, variantKey) {
    return cart.findIndex((x) => x.id === id && (x.variantKey || "") === (variantKey || ""));
  }

  function parseJSONAttr(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  // Read options from a scope that contains:
  //  - .option-grid[data-option-group="package"] with .option-pill.is-selected
  //  - inputs/select/textarea with name=""
  function readOptionsFromScope(scopeEl) {
    const options = {};

    // pill groups
    scopeEl.querySelectorAll(".option-grid[data-option-group]").forEach((grid) => {
      const group = grid.getAttribute("data-option-group");
      const selected = grid.querySelector(".option-pill.is-selected");
      if (group && selected) {
        options[group] = selected.getAttribute("data-option-value") || selected.textContent.trim();
      }
    });

    // selects/inputs/textareas
    scopeEl.querySelectorAll("select[name], textarea[name], input[name]").forEach((el) => {
      const name = el.getAttribute("name");
      if (!name) return;

      if (el.type === "checkbox") {
        if (!options[name]) options[name] = [];
        if (el.checked) options[name].push(el.value || "Yes");
        return;
      }

      if (el.type === "radio") {
        if (el.checked) options[name] = el.value;
        return;
      }

      options[name] = (el.value || "").trim();
    });

    // remove empty strings
    Object.keys(options).forEach((k) => {
      const v = options[k];
      if (typeof v === "string" && v.trim() === "") delete options[k];
      if (Array.isArray(v) && v.length === 0) delete options[k];
    });

    return options;
  }

  function resolvePrice(btn, options) {
    const mode = (btn.getAttribute("data-price-mode") || "").trim();

    if (mode === "lookup") {
      const optionKey = btn.getAttribute("data-price-option"); // e.g. "package"
      const mapStr = btn.getAttribute("data-price-map") || "{}";
      const priceMap = parseJSONAttr(mapStr, {});
      const selected = optionKey ? options[optionKey] : "";
      const p = selected ? priceMap[selected] : 0;
      return safeNumber(p, 0);
    }

    // default: data-price directly
    return safeNumber(btn.getAttribute("data-price"), 0);
  }

  function addToCart(product) {
    const cart = readCart();

    const id = String(product.id || "").trim();
    const name = String(product.name || "").trim();
    const price = safeNumber(product.price, 0);
    const quantity = Math.max(1, Math.floor(safeNumber(product.quantity, 1)));
    const options = product.options && typeof product.options === "object" ? product.options : {};
    const variantKey = buildVariantKey(options);

    // IMPORTANT: allow price > 0 only (because you need real checkout)
    if (!id || !name || !Number.isFinite(price) || price <= 0) {
      console.warn("Invalid product (missing id/name or price <= 0):", product);
      return { ok: false, reason: "invalid_product" };
    }

    const idx = findCartItemIndex(cart, id, variantKey);

    if (idx >= 0) {
      cart[idx].quantity = Math.max(1, Math.floor(safeNumber(cart[idx].quantity, 1))) + quantity;
    } else {
      cart.push({ id, name, price, quantity, options, variantKey });
    }

    writeCart(cart);
    return { ok: true };
  }

  function removeFromCart(id, variantKey = "") {
    const cart = readCart().filter((x) => !(x.id === id && (x.variantKey || "") === (variantKey || "")));
    writeCart(cart);
  }

  function updateQuantity(id, variantKey, newQty) {
    const cart = readCart();
    const idx = findCartItemIndex(cart, id, variantKey);
    if (idx < 0) return;

    const qty = Math.max(1, Math.floor(safeNumber(newQty, 1)));
    cart[idx].quantity = qty;
    writeCart(cart);
  }

  function clearCart() {
    writeCart([]);
  }

  // Option pills: click => purple highlight
  function bindOptionPills() {
    document.addEventListener("click", (e) => {
      const pill = e.target.closest(".option-pill");
      if (!pill) return;

      const grid = pill.closest(".option-grid[data-option-group]");
      if (!grid) return;

      e.preventDefault();

      // single-select per grid
      grid.querySelectorAll(".option-pill").forEach((p) => p.classList.remove("is-selected"));
      pill.classList.add("is-selected");

      // if this product uses lookup pricing, update price display immediately
      const scope = pill.closest(".product-detail-btn-box") || pill.closest("[data-product-scope]");
      if (!scope) return;

      const btn = scope.querySelector(".cart-button[data-price-mode='lookup']");
      if (!btn) return;

      const options = readOptionsFromScope(scope);
      const price = resolvePrice(btn, options);

      const displaySel = btn.getAttribute("data-price-display");
      if (displaySel) {
        const displayEl = document.querySelector(displaySel);
        if (displayEl) displayEl.textContent = moneyGBP(price);
      }
    });
  }

  function bindAddToCartButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cart-button");
      if (!btn) return;

      e.preventDefault();

      const id = btn.getAttribute("data-product-id");
      const name = btn.getAttribute("data-name");

      // Quantity (optional)
      let qty = 1;
      const qtyInputId = btn.getAttribute("data-quantity-input");
      if (qtyInputId) {
        const qtyEl = document.getElementById(qtyInputId);
        if (qtyEl) qty = Math.max(1, Math.floor(safeNumber(qtyEl.value, 1)));
      }

      // Scope for options
      const scopeSel = btn.getAttribute("data-options-scope");
      const scope = scopeSel ? document.querySelector(scopeSel) : null;
      const options = scope ? readOptionsFromScope(scope) : {};

      // Resolve price (lookup or direct)
      const price = resolvePrice(btn, options);

      // Required option check for lookup mode (prevents £0 adds)
      if ((btn.getAttribute("data-price-mode") || "") === "lookup") {
        const requiredKey = btn.getAttribute("data-price-option"); // "package"
        if (requiredKey && !options[requiredKey]) {
          alert(`Please choose a ${requiredKey} first.`);
          return;
        }
      }

      const result = addToCart({ id, name, price, quantity: qty, options });

      if (!result.ok) {
        alert("This item couldn’t be added (missing price or options).");
        return;
      }

      btn.classList.add("added");
      setTimeout(() => btn.classList.remove("added"), 600);
    });
  }

  function renderCart() {
    const cart = readCart();

    const itemsWrap = document.getElementById("cart-items");
    const subtotalEl = document.getElementById("cart-subtotal");
    const shippingEl = document.getElementById("cart-shipping");
    const totalEl = document.getElementById("cart-total");
    const deliveriesInput = document.getElementById("deliveries-count");
    const emptyEl = document.getElementById("cart-empty");

    const deliveries = getDeliveriesCount();
    if (deliveriesInput) deliveriesInput.value = deliveries;

    if (itemsWrap) {
      itemsWrap.innerHTML = "";

      if (!cart.length) {
        if (emptyEl) emptyEl.style.display = "block";
      } else {
        if (emptyEl) emptyEl.style.display = "none";
      }

      cart.forEach((item) => {
        const line = document.createElement("div");
        line.className = "cart-line";

        const optionsText =
          item.options && Object.keys(item.options).length
            ? Object.entries(item.options)
                .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k}: ${String(v)}`))
                .join(" • ")
            : "";

        const qtySafe = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
        const lineTotal = safeNumber(item.price, 0) * qtySafe;

        line.innerHTML = `
          <div class="cart-line-left">
            <div class="cart-line-title">${item.name}</div>
            ${optionsText ? `<div class="cart-line-options">${optionsText}</div>` : ""}
            <div class="cart-line-meta">
              <button class="cart-remove" data-id="${item.id}" data-variant="${item.variantKey || ""}">Remove</button>
            </div>
          </div>

          <div class="cart-line-right">
            <div class="cart-line-price">${moneyGBP(item.price)}</div>
            <input class="cart-qty" type="number" min="1" value="${qtySafe}"
              data-id="${item.id}" data-variant="${item.variantKey || ""}" />
            <div class="cart-line-lineTotal">${moneyGBP(lineTotal)}</div>
          </div>
        `;

        itemsWrap.appendChild(line);
      });
    }

    const subtotal = cartSubtotal(cart);
    const ship = totalShipping(cart, deliveries);
    const total = subtotal + ship;

    if (subtotalEl) subtotalEl.textContent = moneyGBP(subtotal);
    if (shippingEl) shippingEl.textContent = moneyGBP(ship);
    if (totalEl) totalEl.textContent = moneyGBP(total);
  }

  function bindCartInteractions() {
    document.addEventListener("input", (e) => {
      const qty = e.target.closest(".cart-qty");
      if (!qty) return;

      const id = qty.getAttribute("data-id");
      const variantKey = qty.getAttribute("data-variant") || "";
      updateQuantity(id, variantKey, qty.value);
    });

    document.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".cart-remove");
      if (!removeBtn) return;

      e.preventDefault();
      const id = removeBtn.getAttribute("data-id");
      const variantKey = removeBtn.getAttribute("data-variant") || "";
      removeFromCart(id, variantKey);
    });

    const deliveriesInput = document.getElementById("deliveries-count");
    if (deliveriesInput) {
      deliveriesInput.addEventListener("input", () => {
        setDeliveriesCount(deliveriesInput.value);
        renderCart();
      });
    }

    window.addEventListener("cart:updated", renderCart);
    window.addEventListener("deliveries:updated", renderCart);
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    bindOptionPills();
    bindAddToCartButtons();
    bindCartInteractions();
    renderCart();
  });

  // Expose helpers (optional)
  window.PreyesCartActions = {
    readCart,
    writeCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    renderCart,
    setDeliveriesCount,
    getDeliveriesCount,
    cartSubtotal,
    shippingPerDelivery,
    totalShipping,
    cartTotal,
  };
})();
