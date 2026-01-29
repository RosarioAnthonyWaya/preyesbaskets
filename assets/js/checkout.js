/* assets/js/checkout.js — Hybrid (B then A if multi-address) */

(function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

  const SHIPPING = { standard: 11, express: 15 };

  function money(n) {
    const v = Number(n) || 0;
    return `£${v.toFixed(2)}`;
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

  function getDeliveriesCount() {
    const raw = localStorage.getItem(DELIVERY_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
  }

  function setDeliveriesCount(n) {
    const safe = Number.isFinite(Number(n)) ? Math.max(1, Math.floor(Number(n))) : 1;
    localStorage.setItem(DELIVERY_KEY, String(safe));
    return safe;
  }

  function computeSubtotal(cart) {
    return (cart || []).reduce((sum, item) => {
      const qty = Number(item.qty) || 1;
      const price = Number(item.price) || 0;
      return sum + price * qty;
    }, 0);
  }

  // ---- Business day helpers (weekends only) ----
  function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  function addBusinessDays(fromDate, businessDays) {
    const d = new Date(fromDate);
    let added = 0;
    while (added < businessDays) {
      d.setDate(d.getDate() + 1);
      if (!isWeekend(d)) added++;
    }
    return d;
  }

  function toISODate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getSelectedDeliverySpeed(scopeEl) {
    // we treat the pills as a single-choice group
    const selected = scopeEl.querySelector('.option-grid[data-option-group="deliverySpeed"] .option-pill.is-selected');
    return selected ? selected.getAttribute("data-option-value") : "standard";
  }

  function setSelectedPill(gridEl, value) {
    const pills = Array.from(gridEl.querySelectorAll(".option-pill"));
    pills.forEach((p) => {
      const isMatch = p.getAttribute("data-option-value") === value;
      p.classList.toggle("is-selected", isMatch);
      p.setAttribute("aria-pressed", isMatch ? "true" : "false");
    });
  }

  function renderTotals(cart, deliveries, speed) {
    const subtotal = computeSubtotal(cart);
    const shipPer = SHIPPING[speed] ?? SHIPPING.standard;
    const shipping = shipPer * Math.max(1, Number(deliveries) || 1);
    const total = subtotal + shipping;

    const subtotalEl = document.getElementById("cart-subtotal");
    const shippingEl = document.getElementById("cart-shipping");
    const totalEl = document.getElementById("cart-total");

    if (subtotalEl) subtotalEl.textContent = money(subtotal);
    if (shippingEl) shippingEl.textContent = money(shipping);
    if (totalEl) totalEl.textContent = money(total);
  }

  function setStatus(msg) {
    const el = document.getElementById("checkout-status");
    if (el) el.textContent = msg;
  }

  function buildAddressBlock(i) {
    const idx = i + 1;
    const wrap = document.createElement("div");
    wrap.className = "address-block";
    wrap.style.border = "1px solid rgba(0,0,0,0.10)";
    wrap.style.borderRadius = "12px";
    wrap.style.padding = "12px";
    wrap.style.marginBottom = "12px";

    wrap.innerHTML = `
      <div class="field-label" style="margin-bottom:10px;">Address ${idx}</div>

      <input class="text-input" data-addr="name" placeholder="Full name" />
      <div style="height:10px;"></div>

      <input class="text-input" data-addr="phone" placeholder="Phone number" />
      <div style="height:10px;"></div>

      <input class="text-input" data-addr="line1" placeholder="Address line 1" />
      <div style="height:10px;"></div>

      <input class="text-input" data-addr="line2" placeholder="Address line 2 (optional)" />
      <div style="height:10px;"></div>

      <input class="text-input" data-addr="city" placeholder="Town/City" />
      <div style="height:10px;"></div>

      <input class="text-input" data-addr="postcode" placeholder="Postcode" />
    `;

    return wrap;
  }

  function readAddresses(containerEl, expectedCount) {
    const blocks = Array.from(containerEl.querySelectorAll(".address-block"));
    const out = [];

    for (let i = 0; i < expectedCount; i++) {
      const block = blocks[i];
      if (!block) break;

      const get = (k) => {
        const el = block.querySelector(`[data-addr="${k}"]`);
        return el ? String(el.value || "").trim() : "";
      };

      out.push({
        name: get("name"),
        phone: get("phone"),
        line1: get("line1"),
        line2: get("line2"),
        city: get("city"),
        postcode: get("postcode"),
      });
    }

    return out;
  }

  function validateAddresses(addresses) {
    // basic but effective
    for (let i = 0; i < addresses.length; i++) {
      const a = addresses[i];
      const missing = [];
      if (!a.name || a.name.length < 2) missing.push("name");
      if (!a.phone || a.phone.length < 7) missing.push("phone");
      if (!a.line1 || a.line1.length < 4) missing.push("address line 1");
      if (!a.city || a.city.length < 2) missing.push("city");
      if (!a.postcode || a.postcode.length < 4) missing.push("postcode");

      if (missing.length) {
        return `Address ${i + 1} is missing: ${missing.join(", ")}.`;
      }
    }
    return null;
  }

  async function createCheckoutSession(payload) {
    const res = await fetch("/.netlify/functions/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Checkout session failed");
    return data;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("checkout-button");
    const deliveriesInput = document.getElementById("deliveries-count");

    const deliveryDate = document.getElementById("delivery-date");
    const dateHint = document.getElementById("delivery-date-hint");

    const speedGrid = document.querySelector('.option-grid[data-option-group="deliverySpeed"]');

    const multiToggle = document.getElementById("multi-address-toggle");
    const multiWrap = document.getElementById("multi-address-wrap");
    const multiList = document.getElementById("multi-address-list");

    const cart = readCart();

    // Empty cart handling
    const emptyEl = document.getElementById("cart-empty");
    if (!cart.length) {
      if (emptyEl) emptyEl.style.display = "block";
      if (btn) btn.disabled = true;
      renderTotals([], 1, "standard");
      return;
    } else {
      if (emptyEl) emptyEl.style.display = "none";
    }

    // Init deliveries count
    let deliveries = deliveriesInput ? setDeliveriesCount(deliveriesInput.value || getDeliveriesCount()) : getDeliveriesCount();
    if (deliveriesInput) deliveriesInput.value = String(deliveries);

    // Init speed selection
    let speed = "standard";
    if (speedGrid) {
      // default selected pill (already marked in HTML)
      speed = getSelectedDeliverySpeed(document);
      speedGrid.addEventListener("click", (e) => {
        const pill = e.target.closest(".option-pill");
        if (!pill) return;
        const val = pill.getAttribute("data-option-value");
        setSelectedPill(speedGrid, val);
        speed = val || "standard";
        applyDateRules(speed);
        renderTotals(readCart(), deliveries, speed);
      });
    }

    // Date rules
    function applyDateRules(currentSpeed) {
      if (!deliveryDate) return;

      const today = new Date();
      // standard: minimum +3 business days, express: minimum +1 business day
      const minDate = currentSpeed === "express" ? addBusinessDays(today, 1) : addBusinessDays(today, 3);

      deliveryDate.min = toISODate(minDate);

      if (!deliveryDate.value || deliveryDate.value < deliveryDate.min) {
        deliveryDate.value = deliveryDate.min;
      }

      if (dateHint) {
        dateHint.textContent =
          currentSpeed === "express"
            ? `Earliest Express date: ${deliveryDate.min}`
            : `Earliest Standard date: ${deliveryDate.min}`;
      }
    }
    applyDateRules(speed);

    // Multi-address logic
    function isMultiMode() {
      return (multiToggle && multiToggle.checked) || deliveries > 1;
    }

    function renderAddressBlocks() {
      if (!multiWrap || !multiList) return;
      const multi = isMultiMode();

      multiWrap.style.display = multi ? "block" : "none";
      if (!multi) {
        multiList.innerHTML = "";
        return;
      }

      // Ensure blocks match deliveries
      multiList.innerHTML = "";
      for (let i = 0; i < deliveries; i++) {
        multiList.appendChild(buildAddressBlock(i));
      }
    }

    // If deliveries > 1, auto-enable multi
    if (multiToggle) {
      multiToggle.checked = deliveries > 1;
      multiToggle.addEventListener("change", () => {
        if (multiToggle.checked && deliveries === 1) {
          deliveries = setDeliveriesCount(2);
          if (deliveriesInput) deliveriesInput.value = "2";
        }
        renderAddressBlocks();
        renderTotals(readCart(), deliveries, speed);
      });
    }

    if (deliveriesInput) {
      deliveriesInput.addEventListener("input", () => {
        deliveries = setDeliveriesCount(deliveriesInput.value);
        // auto-check multi toggle when >1
        if (multiToggle) multiToggle.checked = deliveries > 1;
        renderAddressBlocks();
        renderTotals(readCart(), deliveries, speed);
      });
    }

    renderAddressBlocks();
    renderTotals(cart, deliveries, speed);

    // Checkout click
    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();

      const cart = readCart();
      if (!cart.length) {
        setStatus("Your cart is empty.");
        return;
      }

      // delivery details
      const chosenSpeed = speedGrid ? getSelectedDeliverySpeed(document) : "standard";
      const chosenDate = deliveryDate ? String(deliveryDate.value || "").trim() : "";

      if (!chosenDate) {
        setStatus("Please choose a delivery date.");
        return;
      }

      // if multi-address, validate addresses
      let addresses = [];
      if (isMultiMode()) {
        addresses = readAddresses(multiList, deliveries);
        const err = validateAddresses(addresses);
        if (err) {
          setStatus(err);
          return;
        }
      }

      try {
        btn.disabled = true;
        setStatus("Redirecting to secure checkout…");

        const { url } = await createCheckoutSession({
          cart,
          deliveriesCount: deliveries,
          deliverySpeed: chosenSpeed,
          deliveryDate: chosenDate,
          multiAddresses: addresses, // empty if not multi
        });

        window.location.href = url;
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Something went wrong.");
        btn.disabled = false;
      }
    });
  });
})();
