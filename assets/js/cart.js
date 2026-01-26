/* ============================
   Preye's Cart (localStorage)
   - Updates #nav-cart-count
   - Works with .cart-button + option pills
   ============================ */

(function () {
  const CART_KEY = "preyes_cart_v1";

  // ---------- Helpers ----------
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
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

  // ---------- Cart count UI ----------
  function updateCartCountUI() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    // Your header badge
    const navCount = document.getElementById("nav-cart-count");
    if (navCount) navCount.textContent = String(count);

    // Optional generic support if you add [data-cart-count] elsewhere
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
    });
  }

  // ---------- Read selected options from a scope ----------
  function readOptions(scopeEl) {
    const options = {};

    // For every option grid (example: data-option-group="package")
    scopeEl.querySelectorAll(".option-grid[data-option-group]").forEach((grid) => {
      const groupName = grid.getAttribute("data-option-group");
      const selected = grid.querySelector(".option-pill.is-selected");
      if (groupName && selected) {
        options[groupName] = selected.getAttribute("data-option-value") || selected.textContent.trim();
      }
    });

    // Also read hidden inputs inside scope (you already add these)
    scopeEl.querySelectorAll('input[type="hidden"][name]').forEach((inp) => {
      if (inp.value && !options[inp.name]) options[inp.name] = inp.value;
    });

    // Card message textarea (optional)
    const msg = scopeEl.querySelector('textarea[name="card_message"]');
    if (msg && msg.value.trim()) options.card_message = msg.value.trim();

    return options;
  }

  function requireOption(scopeEl, groupName) {
    const grid = scopeEl.querySelector(`.option-grid[data-option-group="${groupName}"]`);
    if (!grid) return true; // if group doesn't exist, don't block
    return !!grid.querySelector(".option-pill.is-selected");
  }

  // ---------- Price handling ----------
  function getPriceFromButton(btn, scopeEl) {
    const mode = btn.getAttribute("data-price-mode"); // "lookup" or "fixed"
    if (mode === "fixed") {
      return Number(btn.getAttribute("data-price") || 0);
    }

    if (mode === "lookup") {
      const optionGroup = btn.getAttribute("data-price-option"); // e.g. "package"
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

  // ---------- Add to cart ----------
  function addToCart(btn) {
    const scopeSelector = btn.getAttribute("data-options-scope");
    const scopeEl = scopeSelector ? document.querySelector(scopeSelector) : null;

    if (!scopeEl) {
      alert("Cart error: options scope not found.");
      return;
    }

    // REQUIRED: package must be selected
    const mustPickPackage = !requireOption(scopeEl, "package") ? true : false;
    if (mustPickPackage) {
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

    // "same item" means same id + same options.package (and other options)
    const signature = JSON.stringify({ id, options });

    const existingIndex = cart.findIndex((item) => {
      return JSON.stringify({ id: item.id, options: item.options }) === signature;
    });

    if (existingIndex > -1) {
      cart[existingIndex].qty = Number(cart[existingIndex].qty || 0) + 1;
    } else {
      cart.push({
        id,
        name,
        price,
        qty: 1,
        options,
      });
    }

    setCart(cart);
    updateCartCountUI();
    window.dispatchEvent(new Event("cart:updated"));

    // UI feedback
    const original = btn.textContent;
    btn.textContent = "Added ✓";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 800);
  }

  // ---------- Option pill selection + sync hidden inputs ----------
  function handleOptionClick(e) {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid[data-option-group]");
    if (!grid) return;

    // select only one within grid
    grid.querySelectorAll(".option-pill").forEach((b) => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    const groupName = grid.getAttribute("data-option-group"); // e.g. package
    const scopeEl = pill.closest(".product-detail-btn-box") || pill.closest("[id^='product-']") || document;

    // if there is a hidden input matching group name, set it
    const hidden = scopeEl.querySelector(`input[type="hidden"][name="${groupName}"]`);
    if (hidden) hidden.value = pill.getAttribute("data-option-value") || "";

    // Update any price displays attached to cart buttons in this scope
    scopeEl.querySelectorAll(".cart-button").forEach(updatePriceDisplay);
  }

  // ---------- Bind events ----------
  document.addEventListener("click", function (e) {
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
  });

  // Initial update on page load
  document.addEventListener("DOMContentLoaded", function () {
    updateCartCountUI();
    document.querySelectorAll(".cart-button").forEach(updatePriceDisplay);
  });

  // Cross-tab updates
  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY) updateCartCountUI();
  });

})();
