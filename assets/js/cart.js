/* assets/js/cart.js */

(function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

  const SHIPPING_EXCEPTION_IDS = new Set(["holiday-cheer", "joyful-baskets"]);
  const SHIPPING_STANDARD = 11;
  const SHIPPING_EXCEPTION = 8;

  function safeNumber(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }

  function moneyGBP(value) {
    return `£${safeNumber(value).toFixed(2)}`;
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

  function findCartItemIndex(cart, id, variantKey) {
    return cart.findIndex((x) => x.id === id && (x.variantKey || "") === (variantKey || ""));
  }

  function buildVariantKey(options) {
    if (!options || typeof options !== "object") return "";
    const keys = Object.keys(options).sort();
    return keys.map((k) => `${k}:${String(options[k]).trim()}`).join("|");
  }

  // -------- NEW: Pill UI support --------

  function getSelectedPillOptions(scope) {
    // Reads: .option-grid[data-option-group] .option-pill.is-selected (or aria-pressed="true")
    const options = {};
    scope.querySelectorAll(".option-grid[data-option-group]").forEach((grid) => {
      const group = grid.getAttribute("data-option-group");
      if (!group) return;

      const selected = grid.querySelector(".option-pill.is-selected, .option-pill[aria-pressed='true']");
      if (selected) options[group] = selected.getAttribute("data-option-value") || selected.textContent.trim();
    });
    return options;
  }

  function getFormOptions(scope, options) {
    // radios
    scope.querySelectorAll('input[type="radio"]:checked').forEach((r) => {
      if (r.name) options[r.name] = r.value;
    });

    // checkboxes
    scope.querySelectorAll('input[type="checkbox"]').forEach((c) => {
      if (!c.name) return;
      if (!options[c.name]) options[c.name] = [];
      if (c.checked) options[c.name].push(c.value || "Yes");
    });

    // selects
    scope.querySelectorAll("select").forEach((s) => {
      if (s.name) options[s.name] = s.value;
    });

    // textareas
    scope.querySelectorAll("textarea").forEach((t) => {
      if (t.name) options[t.name] = t.value.trim();
    });

    // text inputs
    scope.querySelectorAll('input[type="text"]').forEach((t) => {
      if (t.name) options[t.name] = t.value.trim();
    });

    return options;
  }

  function parseJsonAttr(el, attr, fallback) {
    const raw = el.getAttribute(attr);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function computeDynamicPrice(btn, options) {
    const mode = (btn.getAttribute("data-price-mode") || "").trim();

    // default fallback: data-price
    const base = safeNumber(btn.getAttribute("data-price"), 0);

    if (!mode) return base;

    // mode="lookup": price = map[ options[priceOption] ]
    if (mode === "lookup") {
      const priceOption = btn.getAttribute("data-price-option"); // e.g. "package"
      const map = parseJsonAttr(btn, "data-price-map", {});
      const chosen = priceOption ? options[priceOption] : null;
      const p = chosen ? safeNumber(map[chosen], 0) : 0;
      return p > 0 ? p : 0;
    }

    // mode="basePlus": base + sum(addonMap[group][value])
    if (mode === "basePlus") {
      const addonMap = parseJsonAttr(btn, "data-addon-map", {});
      let total = base;

      Object.keys(options || {}).forEach((group) => {
        const val = options[group];
        if (addonMap[group] && typeof addonMap[group] === "object") {
          if (Array.isArray(val)) {
            val.forEach((v) => (total += safeNumber(addonMap[group][v], 0)));
          } else {
            total += safeNumber(addonMap[group][val], 0);
          }
        }
      });

      return total;
    }

    return base;
  }

  function setPriceDisplay(btn, price) {
    const displaySel = btn.getAttribute("data-price-display");
    if (!displaySel) return;
    const el = document.querySelector(displaySel);
    if (!el) return;
    el.textContent = moneyGBP(price);
  }

  // -------- Cart API --------

  const CartAPI = {
    readCart,
    writeCart,
    setDeliveriesCount,
    getDeliveriesCount,
    cartSubtotal,
    shippingPerDelivery,
    totalShipping,
    cartTotal,
  };
  window.PreyesCart = CartAPI;

  function addToCart(product) {
    const cart = readCart();

    const id = String(product.id || "").trim();
    const name = String(product.name || "").trim();
    const price = safeNumber(product.price, 0);
    const quantity = Math.max(1, Math.floor(safeNumber(product.quantity, 1)));
    const options = product.options && typeof product.options === "object" ? product.options : {};
    const variantKey = buildVariantKey(options);

    if (!id || !name || !Number.isFinite(price) || price <= 0) {
      console.warn("Invalid product (missing/zero price is not allowed):", product);
      return;
    }

    const idx = findCartItemIndex(cart, id, variantKey);

    if (idx >= 0) {
      cart[idx].quantity = Math.max(1, Math.floor(safeNumber(cart[idx].quantity, 1))) + quantity;
    } else {
      cart.push({ id, name, price, quantity, options, variantKey });
    }

    writeCart(cart);
  }

  function removeFromCart(id, variantKey = "") {
    const cart = readCart().filter((x) => !(x.id === id && (x.variantKey || "") === (variantKey || "")));
    writeCart(cart);
  }

  function updateQuantity(id, variantKey, newQty) {
    const cart = readCart();
    const idx = findCartItemIndex(cart, id, variantKey);
    if (idx < 0) return;

    cart[idx].quantity = Math.max(1, Math.floor(safeNumber(newQty, 1)));
    writeCart(cart);
  }

  function clearCart() {
    writeCart([]);
  }

  function bindOptionPills() {
    document.addEventListener("click", (e) => {
      const pill = e.target.closest(".option-pill");
      if (!pill) return;

      const grid = pill.closest(".option-grid[data-option-group]");
      if (!grid) return;

      e.preventDefault();

      // single-select within a group
      grid.querySelectorAll(".option-pill").forEach((b) => {
        b.classList.remove("is-selected");
        b.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("is-selected");
      pill.setAttribute("aria-pressed", "true");

      // if this options block contains a cart button, update displayed price
      const block = pill.closest(".product-detail-btn-box");
      if (!block) return;

      const btn = block.querySelector(".cart-button");
      if (!btn) return;

      const scopeSel = btn.getAttribute("data-options-scope") || btn.getAttribute("data-options-source");
      const scope = scopeSel ? document.querySelector(scopeSel) : block;

      const options = getFormOptions(scope, getSelectedPillOptions(scope));
      const price = computeDynamicPrice(btn, options);

      setPriceDisplay(btn, price);
      btn.setAttribute("data-price", String(price)); // so add-to-cart uses latest
    });
  }

  function bindAddToCartButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cart-button");
      if (!btn) return;

      e.preventDefault();

      const id = btn.getAttribute("data-product-id");
      const name = btn.getAttribute("data-name");

      // Quantity
      let qty = 1;
      const qtyInputId = btn.getAttribute("data-quantity-input");
      if (qtyInputId) {
        const qtyEl = document.getElementById(qtyInputId);
        if (qtyEl) qty = Math.max(1, Math.floor(safeNumber(qtyEl.value, 1)));
      }

      // Options scope (supports both attributes)
      const scopeSel = btn.getAttribute("data-options-scope") || btn.getAttribute("data-options-source");
      const scope = scopeSel ? document.querySelector(scopeSel) : null;

      const options = scope ? getFormOptions(scope, getSelectedPillOptions(scope)) : {};

      // Dynamic price
      const dynamicPrice = computeDynamicPrice(btn, options);
      btn.setAttribute("data-price", String(dynamicPrice));
      setPriceDisplay(btn, dynamicPrice);

      // Guard: must have a valid price
      if (dynamicPrice <= 0) {
        console.warn("Price is 0. Select options or fix mapping.", { id, name, options });
        return;
      }

      addToCart({ id, name, price: dynamicPrice, quantity: qty, options });

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

        const qtyNum = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));

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
            <input class="cart-qty" type="number" min="1" value="${qtyNum}"
              data-id="${item.id}" data-variant="${item.variantKey || ""}" />
            <div class="cart-line-lineTotal">${moneyGBP(item.price * qtyNum)}</div>
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

      updateQuantity(qty.getAttribute("data-id"), qty.getAttribute("data-variant") || "", qty.value);
    });

    document.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".cart-remove");
      if (!removeBtn) return;

      e.preventDefault();
      removeFromCart(removeBtn.getAttribute("data-id"), removeBtn.getAttribute("data-variant") || "");
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

  document.addEventListener("DOMContentLoaded", () => {
    bindOptionPills();
    bindAddToCartButtons();
    bindCartInteractions();
    renderCart();
  });

  window.PreyesCartActions = {
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    renderCart,
    setDeliveriesCount,
    getDeliveriesCount,
  };
})();
