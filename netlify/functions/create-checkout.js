// netlify/functions/create-checkout.js

const Stripe = require("stripe");

const SHIPPING_EXCEPTION_IDS = new Set(["holiday-cheer", "joyful-baskets"]);
const SHIPPING_STANDARD = 11;
const SHIPPING_EXCEPTION = 8;

function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function cartHasOnlyExceptionItems(cart) {
  if (!Array.isArray(cart) || cart.length === 0) return false;
  return cart.every((item) => SHIPPING_EXCEPTION_IDS.has(String(item.id)));
}

function shippingPerDelivery(cart) {
  return cartHasOnlyExceptionItems(cart) ? SHIPPING_EXCEPTION : SHIPPING_STANDARD;
}

function buildOptionsText(options) {
  if (!options || typeof options !== "object") return "";
  const entries = Object.entries(options).filter(([k, v]) => k && v !== undefined && v !== null && String(v).trim() !== "");
  if (!entries.length) return "";
  return entries
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.join(", ")}`;
      return `${k}: ${String(v)}`;
    })
    .join(" | ");
}

exports.handler = async (event) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const deliveriesCount = Math.max(1, Math.floor(safeNumber(body.deliveriesCount, 1)));

    if (!cart.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty" }) };
    }

    // Convert cart -> Stripe line items
    const line_items = cart.map((item) => {
      const name = String(item.name || "Item");
      const priceGBP = safeNumber(item.price, 0);
      const quantity = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));

      if (!priceGBP || priceGBP <= 0) {
        throw new Error(`Invalid price for item: ${name}`);
      }

      const optionsText = buildOptionsText(item.options);

      return {
        quantity,
        price_data: {
          currency: "gbp",
          unit_amount: Math.round(priceGBP * 100), // pence
          product_data: {
            name: optionsText ? `${name} (${optionsText})` : name,
            metadata: {
              product_id: String(item.id || ""),
            },
          },
        },
      };
    });

    // Shipping as a line item
    const perDelivery = shippingPerDelivery(cart);
    const shippingTotal = perDelivery * deliveriesCount;

    line_items.push({
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: Math.round(shippingTotal * 100),
        product_data: {
          name: `Shipping (${deliveriesCount} delivery${deliveriesCount > 1 ? "ies" : ""})`,
          metadata: {
            shipping_per_delivery_gbp: String(perDelivery),
            deliveries_count: String(deliveriesCount),
          },
        },
      },
    });

    // IMPORTANT: Use absolute URLs
    const origin =
      event.headers.origin ||
      `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      payment_method_types: ["card"],
      metadata: {
        deliveries_count: String(deliveriesCount),
        shipping_per_delivery_gbp: String(perDelivery),
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
};
