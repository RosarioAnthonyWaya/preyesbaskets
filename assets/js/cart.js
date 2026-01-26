/* /assets/js/cart.js */
(function () {
  const CART_KEY = "preyes_cart_v1";

  // ---------- helpers ----------
  function safeJson(str, fallback = null) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  function money(n) {
    const v = Number(n || 0);
    return `£${v.toFixed(2)}`;
  }

  function getCart() {
    return safeJson(localStorage.getItem(CART_KEY), []) || [];
  }

  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function sameOptions(a, b) {
    const ka = Object.keys(a || {}).sort();
    const kb = Object.keys(b || {}).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      const k = ka[i];
      if (k !== kb[i]) return false;
      if (String(a[k]) !== String(b[k])) return false;
    }
    return true;
  }

  function getScopeFromButton(btn) {
    const sel = btn.getAttribute("data-options-scope");
    if (sel) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // fallback: closest common container
    return btn.closest(".product-detail-btn-box") || document;
  }

  function getGroupValue(scope, groupName) {
    // 1) hidden/text input with name=groupName (your current setup)
    const input = scope.querySelector(`[name="${groupName}"]`);
    if (input && String(input.value || "").trim() !== "") {
      return String(input.value).trim();
    }

    // 2) selected pill
    const selected = scope.querySelector(
      `[data-option-group="${groupName}"] .option-pill.is-selected`
    );
    if (selected) {
      return selected.getAttribute("data-option-value") || selected.textContent.trim();
    }

    return "";
  }

  function ensureHiddenInput(scope, groupName) {
    let input = scope.querySelector(`[name="${groupName}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = groupName;
      scope.appendChild(input);
    }
    return input;
  }

  function updatePriceFromButton(btn) {
    const scope = getScopeFromButton(btn);

    const priceMode = btn.getAttribute("data-price-mode");
    const optionName = btn.getAttribute("data-price-option");
    const mapStr = btn.getAttribute("data-price-map");
    const displaySel = btn.getAttribute("data-price-display");

    if (priceMode !== "lookup" || !optionName || !mapStr) return;

    const map = safeJson(mapStr, {});
    const chosen = getGroupValue(scope, optionName);
    const price = Number(map[chosen] || 0);

    // store computed price on button so cart uses it
    btn.setAttribute("data-price", String(price));

    if (displaySel) {
      const priceEl = document.querySelector(displaySel);
      if (priceEl) priceEl.textContent = money(price);
    }
  }

  // ---------- 1) option pill clicks ----------
  document.addEventListener("click", function (e) {
    const pill = e.target.closest(".option-pill");
    if (!pill) return;

    const grid = pill.closest(".option-grid");
    if (!grid) return;

    const groupName = grid.getAttribute("data-option-group");
    if (!groupName) return;

    // scope should be the nearest product box
    const scope = pill.closest(".product-detail-btn-box") || document;

    // UI selection state
    grid.querySelectorAll(".option-pill").forEach(b => b.classList.remove("is-selected"));
    pill.classList.add("is-selected");

    // write to hidden input (this is what many carts rely on)
    const val = pill.getAttribute("data-option-value") || pill.textContent.trim();
    const input = ensureHiddenInput(scope, groupName);
    input.value = val;

    // update price for the cart button inside THIS scope
    const btn = scope.querySelector(".cart-button");
    if (btn) updatePriceFromButton(btn);
  });

  // ---------- 2) add to cart clicks ----------
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".cart-button");
    if (!btn) return;

    const scope = getScopeFromButton(btn);

    // Update price once more (in case user didn't click pill)
    updatePriceFromButton(btn);

    // Determine required groups:
    // - if data-price-option is set, require that
    // - also require any [data-option-group] inside scope
    const required = new Set();
    const priceOption = btn.getAttribute("data-price-option");
    if (priceOption) required.add(priceOption);

    scope.querySelectorAll("[data-option-group]").forEach(el => {
      const g = el.getAttribute("data-option-group");
      if (g) required.add(g);
    });

    // Validate
    for (const groupName of required) {
      const v = getGroupValue(scope, groupName);
      if (!v) {
        // match your current wording
        alert(groupName === "package" ? "Pick a package first." : `Pick ${groupName} first.`);
        return;
      }
    }

    // Build options object from groups in scope
    const options = {};
    required.forEach(groupName => {
      options[groupName] = getGroupValue(scope, groupName);
    });

    // optional card message
    const msgEl = scope.querySelector('textarea[name="card_message"]');
    const card_message = msgEl ? String(msgEl.value || "").trim() : "";

    const id = btn.getAttribute("data-product-id") || "";
    const name = btn.getAttribute("data-name") || "Product";
    const price = Number(btn.getAttribute("data-price") || 0);

    const item = {
      id,
      name,
      price,
      qty: 1,
      options,
      card_message
    };

    const cart = getCart();

    // Merge if same product + same options + same message
    const existing = cart.find(x =>
      x.id === item.id &&
      sameOptions(x.options, item.options) &&
      String(x.card_message || "") === String(item.card_message || "")
    );

    if (existing) existing.qty += 1;
    else cart.push(item);

    setCart(cart);

    alert("Added to cart.");
  });

  // ---------- 3) on load: sync prices if already selected ----------
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".cart-button").forEach(updatePriceFromButton);
  });
})();
