// ---------------- CART STATE ---------------- //
let cart = [];

// Load cart from localStorage
(function loadCart() {
  const saved = localStorage.getItem("preyes_cart");
  if (saved) {
    try {
      cart = JSON.parse(saved);
    } catch {}
  }
  renderCart();
})();

function saveCart() {
  localStorage.setItem("preyes_cart", JSON.stringify(cart));
}

// Add an item
function addToCart(productId, name, price) {
  const existing = cart.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ productId, name, price: Number(price), quantity: 1 });
  }
  saveCart();
  renderCart();
}

// Change quantity
function changeQty(productId, delta) {
  const item = cart.find((i) => i.productId === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter((i) => i.productId !== productId);
  }
  saveCart();
  renderCart();
}

// Render the cart summary
function renderCart() {
  const box = document.getElementById("cart-summary");
  if (!box) return;

  if (cart.length === 0) {
    box.innerHTML = "<p>Your box is empty.</p>";
    return;
  }

  let html = "<h4>Your Gift Box</h4><ul>";

  cart.forEach((item) => {
    html += `
      <li>
        ${item.name} (£${item.price}) × ${item.quantity}
        <button data-action="minus" data-id="${item.productId}">−</button>
        <button data-action="plus" data-id="${item.productId}">+</button>
      </li>
    `;
  });

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  html += `</ul><p><strong>Total: £${total}</strong></p>`;
  html += `<button id="checkout">Checkout Securely</button>`;

  box.innerHTML = html;
}

// Handle clicks
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".add-to-cart");
  if (btn) {
    addToCart(btn.dataset.productId, btn.dataset.name, btn.dataset.price);
  }

  if (e.target.dataset.action === "minus") {
    changeQty(e.target.dataset.id, -1);
  }

  if (e.target.dataset.action === "plus") {
    changeQty(e.target.dataset.id, +1);
  }

  if (e.target.id === "checkout") {
    checkout();
  }
});

// Send cart to Netlify Function → Stripe
async function checkout() {
  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ cart }),
  });

  const data = await res.json();

  if (data.url) {
    window.location = data.url;
  } else {
    alert("Checkout error");
  }
}
