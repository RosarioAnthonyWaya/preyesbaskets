const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SHIPPING_EXCEPTION_IDS = new Set(["holiday-cheer", "joyful-baskets"]);
const SHIPPING_STANDARD = 11;
const SHIPPING_EXCEPTION = 8;

function safeInt(n, fallback = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(1, Math.floor(x));
}

function readCatalog() {
  const p = path.join(process.cwd(), "data", "products.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function computePriceFromCatalog(product, options) {
  if (!product) return 0;

  if (product.priceMode === "lookup") {
    const key = product.priceOption; // e.g. "package"
    const chosen = options?.[key];
    const p = chosen ? Number(product.priceMap?.[chosen] || 0) : 0;
    return p > 0 ? p : 0;
  }

  // If later you use basePlus:
  if (product.priceMode === "basePlus") {
    let total = Number(product.basePrice || 0);
    const addonMap = product.addonMap || {};
    Object.keys(options || {}).forEach((group) => {
      const val = options[group];
      if (!addonMap[group]) return;
      if (Array.isArray(val)) val.forEach((v) => (total += Number(addonMap[group][v] || 0)));
      else total += Number(addonMap[group][val] || 0);
    });
    return total;
  }

  return 0;
}

function cartHasOnlyExceptionItems(cart) {
  if (!cart.length) return false;
  return cart.every((item) => SHIPPING_EXCEPTION_IDS.has(item.id));
}

function shippingPerDelivery(cart) {
  return cartHasOnlyExceptionItems(cart) ? SHIPPING_EXCEPTION : SHIPPING_STANDARD;
}

exports.handler = async (event) => {
  try {
    const { cart, deliveriesCount } = JSON.parse(event.body || "{}");

    if (!Array.isArray(cart) || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty." }) };
    }

    const deliveries = safeInt(deliveriesCount, 1);
    const catalog = readCatalog();

    // Build Stripe line items from trusted server-side pricing
    const line_items = [];

    for (const item of cart) {
      const id = String(item.id || "").trim();
      const qty = safeInt(item.quantity, 1);
      const options = item.options && typeof item.options === "object" ? item.options : {};

      const product = catalog[id];
      if (!product) {
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown product: ${id}` }) };
      }

      const unitPrice = computePriceFromCatalog(product, options);
      if (unitPrice <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: `Invalid price for: ${id}` }) };
      }

      const optionText = Object.keys(options).length
        ? " (" +
          Object.entries(options)
            .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k}: ${v}`))
            .join(" • ") +
          ")"
        : "";

      line_items.push({
        price_data: {
          currency: product.currency || "gbp",
          product_data: { name: `${product.name}${optionText}` },
          unit_amount: Math.round(unitPrice * 100),
        },
        quantity: qty,
      });
    }

    // Shipping as its own line item (per delivery)
    const shipPer = shippingPerDelivery(cart);
    const shipTotal = shipPer * deliveries;

    line_items.push({
      price_data: {
        currency: "gbp",
        product_data: { name: `Delivery (${deliveries} drop${deliveries > 1 ? "s" : ""})` },
        unit_amount: Math.round(shipTotal * 100),
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${process.env.SITE_URL}/success/`,
      cancel_url: `${process.env.SITE_URL}/cart/`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error creating checkout." }) };
  }
};
