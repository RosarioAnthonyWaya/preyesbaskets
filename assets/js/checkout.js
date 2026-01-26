/* assets/js/checkout.js */

(async function () {
  const CART_KEY = "preyes_cart_v1";
  const DELIVERY_KEY = "preyes_deliveries_v1";

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

  function setStatus(msg) {
    const el = document.getElementById("checkout-status");
    if (el) el.textContent = msg;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("checkout-button");
    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();

      const cart = readCart();
      const deliveriesCount = getDeliveriesCount();

      if (!cart.length) {
        setStatus("Your cart is empty.");
        return;
      }

      try {
        btn.disabled = true;
        setStatus("Redirecting to secure checkout…");

        const { url } = await createCheckoutSession({ cart, deliveriesCount });
        window.location.href = url;
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Something went wrong.");
        btn.disabled = false;
      }
    });
  });
})();
