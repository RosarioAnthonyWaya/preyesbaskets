(function () {
  const CART_KEY = "preyes_cart_v1";

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function getCart() {
    return safeJSONParse(localStorage.getItem(CART_KEY) || "[]", []);
  }

  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function money(n) {
    n = Number(n || 0);
    return `£${n.toFixed(2)}`;
  }

  // ----------------------------
  // COUNT UI
  // ----------------------------
  function updateCartCountUI() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    const navCount = document.getElementById("nav-cart-count");
    if (navCount) navCount.textContent = String(count);

    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
    });
  }

  // ----------------------------
  // DRAWER UI
  // ----------------------------
  const drawer = () => document.getElementById("cart-drawer");
  const overlay = () => document.getElementById("cart-overlay");
  const itemsBox = () => document.getElementById("cart-items");
  const totalEl = () => document.getElementById("cart-total");

  function openCart() {
    const d = drawer();
    const o = overlay();
    if (!d || !o) return;

    o.hidden = false;
    d.classList.add("is-open");
    d.setAttribute("aria-hidden", "false");
    renderCart();
  }

  function closeCart() {
    const d = drawer();
    const o = overlay();
    if (!d || !o) return;

    d.classList.remove("is-open");
    d.setAttribute("aria-hidden", "true");
    o.hidden = true;
  }

  function cartTotal(cart) {
    return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  }

  function optionSummary(options) {
    if (!options) return "";
    const parts = [];
    Object.keys(options).forEach((k) => {
      if (k === "card_message") return;
      parts.push(`${k}: ${options[k]}`);
    });
    return parts.join(" • ");
  }

  function renderCart() {
    const box = itemsBox();
    const tEl = totalEl();
    if (!box || !tEl) return;

    const cart = getCart();

    if (!cart.length) {
      box.innerHTML = `<p style="color:#666;margin:8px 0;">Your cart is empty.</p>`;
      tEl.textContent = money(0);
      updateCartCountUI();
      return;
    }

    box.innerHTML = cart.map((item, idx) => {
      const meta = optionSummary(item.options);
      const msg = item.options?.card_message ? `Message: ${item.options.card_message}` : "";
      return `
        <div class="cart-item" data-index="${idx}">
          <div class="cart-item-main">
            <p class="cart-item-title">${item.name}</p>
            ${meta ? `<p class="cart-item-meta">${meta}</p>` : ""}
            ${msg ? `<p class="cart-item-meta">${msg}</p>` : ""}

            <div class="cart-item-actions">
              <button class="qty-btn" type="button" data-action="dec">−</button>
              <span><strong>${item.qty}</strong></span>
              <button class="qty-btn" type="button" data-action="inc">+</button>
              <span style="margin-left:10px;">${money(item.price)}</span>
              <button class="remove-btn" type="button" data-action="remove">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    tEl.textContent = money(cartTotal(cart));
    updateCartCountUI();
  }

  function mutateItem(index, action) {
    const cart = getCart();
    const i = Number(index);

    if (!cart[i]) return;

    if (action === "inc") cart[i].qty = Number(cart[i].qty || 0) + 1;
    if (action === "dec") cart[i].qty = Math.max(1, Number(cart[i].qty || 0) - 1);
    if (action === "remove") cart.splice(i, 1);

    setCart(cart);
    updateCartCountUI();
    renderCart();
    window.dispatchEvent(new Event("cart:updated"));
  }

  // ----------------------------
  // OPTIONS + PRICE (product page)
  // ----------------------------
  function readOptions(scopeEl) {
    const options = {};

    scopeEl.querySelectorAll(".option-grid[data-option-group]").forEach((grid) => {
      const groupName = grid.getAttribute("data-option-group");
      const selected = grid.querySelector(".option-pill.is-selected");
      if (groupName && selected) {
        options[groupName] = selected.getAttribute("data-option-value") || selected.textContent.trim();
      }
    });

    scopeEl.querySelectorAll('input[type="hidden"][name]').forEach((inp) => {
      if (inp.value && !options[inp.name]) options[inp.name] = inp.value;
    });

    const msg = scopeEl.querySelector('textarea[name="card_message"]');
    if (msg && msg.value.trim()) options.card_message = msg.value.trim();

    return options;
  }

  function requireOption(scopeEl, groupName) {
    const grid = scopeEl.querySelector(`.option-grid[data-option-group="${groupName}"]`);
    if (!grid) return true;
    return !!grid.querySelector(".option-pill.is-selected");
  }

  function getPriceFromButton(btn, scopeEl) {
    const mode = btn.getAttribute("data-price-mode");
    if (mode === "fixed") return Number(btn.getAttribute("data-price") || 0);

    if (mode === "lookup") {
      const optionGroup = btn.getAttribute("data-price-option");
      const mapRaw = btn.getAttribute("data-price-map") || "{}";
      const priceMap = safeJSONParse(mapRaw, {});
      const options = readOptions(scopeEl);
      const selectedVal = options[optionGroup];
      return Number(priceMap[selectedVal] || 0);
    }
    return 0;
  }

  function updatePriceDisplay(btn) {
    const scopeSelector = btn.getAttribute("data-options-scope");
    const displaySelector = btn.getAttribute("data-price-display");
    if (!scopeSelector || !displaySelector) return;

    const scopeEl = document.querySelector(scopeSelector);
    if (!scopeEl) return;

    const price = getPriceFromButton(btn, scopeEl);
    const priceEl = document.querySelector(displaySelector);
    if (priceEl) priceEl.textContent = money(price);
  }

  function addToCart(btn) {
    const scopeSelector = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSelector ? document.querySelector(scopeSelector) : null;

    if (!scopeEl) {
      alert("Cart error: options scope not found.");
      return;
    }

    // required
    if (!requireOption(scopeEl, "package")) {
      alert("Please pick a package first.");
      return;
    }

    const id = btn.getAttribute("data-product-id") || "unknown";
    const name = btn.getAttribute("data-name") || "Product";
    const options = readOptions(scopeEl);

    const price = getPriceFromButton(btn, scopeEl);
    if (!price || price <= 0) {
      alert("Please pick a package first.");
      return;
    }

    const cart = getCart();
    const signature = JSON.stringify({ id, options });

    const existingIndex = cart.findIndex((item) =>
      JSON.stringify({ id: item.id, options: item.options }) === signature
    );

    if (existingIndex > -1) {
      cart[existingIndex].qty = Number(cart[existingIndex].qty || 0) + 1;
    } else {
      cart.push({ id, name, price, qty: 1, options });
    }

    setCart(cart);
    updateCartCountUI();
    window.dispatchEvent(new Event("cart:updated"));

    // feedback
    const original = btn.textContent;
    btn.textContent = "Added ✓";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 800);

    // open cart so user sees movement
    openCart();
  }

  function handleOptionClick(e) {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid[data-option-group]");
    if (!grid) return;

    grid.querySelectorAll(".option-pill").forEach((b) => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    const groupName = grid.getAttribute("data-option-group");
    const scopeEl = pill.closest(".product-detail-btn-box") || document;

    const hidden = scopeEl.querySelector(`input[type="hidden"][name="${groupName}"]`);
    if (hidden) hidden.value = pill.getAttribute("data-option-value") || "";

    scopeEl.querySelectorAll(".cart-button").forEach(updatePriceDisplay);
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  document.addEventListener("click", function (e) {
    // open cart
    if (e.target.closest("#cart-open-button")) {
      openCart();
      return;
    }

    // close cart
    if (e.target.closest("#cart-close-button") || e.target.closest("#cart-overlay")) {
      closeCart();
      return;
    }

    // option pills
    if (e.target.closest(".option-pill")) {
      handleOptionClick(e);
      return;
    }

    // add to cart
    const btn = e.target.closest(".cart-button");
    if (btn) {
      addToCart(btn);
      return;
    }

    // cart item controls
    const itemEl = e.target.closest(".cart-item");
    const actionBtn = e.target.closest("[data-action]");
    if (itemEl && actionBtn) {
      const index = itemEl.getAttribute("data-index");
      const action = actionBtn.getAttribute("data-action");
      mutateItem(index, action);
      return;
    }

    // clear cart
    if (e.target.closest("#cart-clear")) {
      setCart([]);
      updateCartCountUI();
      renderCart();
      return;
    }

    // checkout (placeholder)
    if (e.target.closest("#cart-checkout")) {
      alert("Checkout not wired yet. Tell me where you want checkout to go (WhatsApp, Stripe, or a checkout page).");
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeCart();
  });

  document.addEventListener("DOMContentLoaded", function () {
    updateCartCountUI();
    document.querySelectorAll(".cart-button").forEach(updatePriceDisplay);
  });

  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY) {
      updateCartCountUI();
      renderCart();
    }
  });

})();
