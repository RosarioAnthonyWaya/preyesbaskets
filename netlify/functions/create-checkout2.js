
// netlify/functions/create-checkout.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ✅ These two have cheaper shipping IF they are the ONLY items in cart
const CHEAP_IDS = new Set(["holiday-cheer", "joyful-baskets"]);

// ✅ Change these to your real pages
const SUCCESS_URL =
  "https://preyesbaskets.com/success/?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://preyesbaskets.com/cancel/";

function computeShippingPerDelivery(cart) {
  if (!Array.isArray(cart) || cart.length === 0) return 0;

  // If EVERYTHING in the cart is only holiday-cheer or joyful-baskets => £8
  const allCheap = cart.every((item) =>
    CHEAP_IDS.has(String(item?.id || "").toLowerCase().trim())
  );

  // Otherwise => £11
  return allCheap ? 8 : 11;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cart = Array.isArray(body.cart) ? body.cart : [];

    // Number of delivery addresses (Model A)
    const deliveries = Math.max(1, parseInt(body.deliveries, 10) || 1);

    if (!cart.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cart is empty" }),
      };
    }

    // Products -> Stripe line items
    const line_items = cart.map((item) => ({
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.name || "Gift item",
        },
        unit_amount: Math.round((Number(item.price) || 0) * 100),
      },
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    }));

    // ✅ Shipping line item (Model A)
    const shippingPerDelivery = computeShippingPerDelivery(cart);
    const shippingTotal = shippingPerDelivery * deliveries;

    line_items.push({
      price_data: {
        currency: "gbp",
        product_data: {
          name: `Shipping (${deliveries} delivery${
            deliveries > 1 ? "ies" : ""
          })`,
        },
        unit_amount: Math.round(shippingTotal * 100),
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,

      // helpful to read later
      metadata: {
        deliveries: String(deliveries),
        shipping_per_delivery: String(shippingPerDelivery),
      },

      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: session.url,
      }),
    };
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Checkout failed",
        details: err?.message || "Unknown error",
      }),
    };
  }
};

