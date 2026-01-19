/* assets/js/cart.js */

(function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

  // Products that qualify for the £8 shipping ONLY if they are the ONLY items in cart.
  const SHIPPING_EXCEPTION_IDS = new Set(["holiday-cheer", "joyful-baskets"]);

  // Shipping rates (per delivery)
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
    } catch (e) {
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

    // Every item must be one of the exception IDs
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

  // Build a stable variant key from selected options (so "Red / M" is a distinct cart line)
  function buildVariantKey(options) {
    if (!options || typeof options !== "object") return "";
    const keys = Object.keys(options).sort();
    return keys.map((k) => `${k}:${String(options[k]).trim()}`).join("|");
  }

  // Public API
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
      console.warn("Invalid product:", product);
      return;
    }

    const idx = findCartItemIndex(cart, id, variantKey);

    if (idx >= 0) {
      cart[idx].quantity = Math.max(1, Math.floor(safeNumber(cart[idx].quantity, 1))) + quantity;
    } else {
      cart.push({
        id,
        name,
        price,
        quantity,
        options,
        variantKey,
      });
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

    const qty = Math.max(1, Math.floor(safeNumber(newQty, 1)));
    cart[idx].quantity = qty;
    writeCart(cart);
  }

  function clearCart() {
    writeCart([]);
  }

  // Attach click handlers for any button with .cart-button
  // Supports:
  // data-product-id, data-name, data-price
  // optional: data-quantity-input="inputId"
  // optional: data-options-scope="#product-options" (we will read selected radios/checkboxes/textareas inside)
  function bindAddToCartButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cart-button");
      if (!btn) return;

      e.preventDefault();

      const id = btn.getAttribute("data-product-id");
      const name = btn.getAttribute("data-name");
      const price = safeNumber(btn.getAttribute("data-price"), 0);

      // Quantity
      let qty = 1;
      const qtyInputId = btn.getAttribute("data-quantity-input");
      if (qtyInputId) {
        const qtyEl = document.getElementById(qtyInputId);
        if (qtyEl) qty = Math.max(1, Math.floor(safeNumber(qtyEl.value, 1)));
      }

      // Options
      const options = {};
      const scopeSel = btn.getAttribute("data-options-scope");
      if (scopeSel) {
        const scope = document.querySelector(scopeSel);
        if (scope) {
          // radio groups
          scope.querySelectorAll('input[type="radio"]:checked').forEach((r) => {
            if (r.name) options[r.name] = r.value;
          });

          // checkboxes
          scope.querySelectorAll('input[type="checkbox"]').forEach((c) => {
            if (!c.name) return;
            if (!options[c.name]) options[c.name] = [];
            if (c.checked) options[c.name].push(c.value || "Yes");
          });
          // Convert single-element checkbox arrays to "Yes" if you want; leaving array is fine.

          // selects
          scope.querySelectorAll("select").forEach((s) => {
            if (s.name) options[s.name] = s.value;
          });

          // textareas
          scope.querySelectorAll("textarea").forEach((t) => {
            if (t.name) options[t.name] = t.value.trim();
          });

          // text inputs (optional)
          scope.querySelectorAll('input[type="text"]').forEach((t) => {
            if (t.name) options[t.name] = t.value.trim();
          });
        }
      }

      addToCart({ id, name, price, quantity: qty, options });

      // Optional UX: show toast or change button text
      btn.classList.add("added");
      setTimeout(() => btn.classList.remove("added"), 600);
    });
  }

  // Render cart if a container exists
  // Required elements (if you want it auto):
  // #cart-items, #cart-subtotal, #cart-shipping, #cart-total, #deliveries-count (input)
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

        const optionsText = item.options && Object.keys(item.options).length
          ? Object.entries(item.options)
              .map(([k, v]) => {
                if (Array.isArray(v)) return `${k}: ${v.join(", ")}`;
                return `${k}: ${String(v)}`;
              })
              .join(" • ")
          : "";

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
            <input class="cart-qty" type="number" min="1" value="${Math.max(1, Math.floor(safeNumber(item.quantity, 1)))}"
              data-id="${item.id}" data-variant="${item.variantKey || ""}" />
            <div class="cart-line-lineTotal">${moneyGBP(item.price * Math.max(1, Math.floor(safeNumber(item.quantity, 1))))}</div>
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
      const newQty = qty.value;

      updateQuantity(id, variantKey, newQty);
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
    bindAddToCartButtons();
    bindCartInteractions();
    renderCart();
  });

  // Optional: expose helpers
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
