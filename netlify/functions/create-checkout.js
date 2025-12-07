// netlify/functions/create-checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/**
 * Expected body: JSON array of cart items like:
 * [
 *   { id: "shadow-drip", name: "Shadow Drip", price: 89, quantity: 2 },
 *   { id: "chocolate-box-small", name: "Box of Chocolates", price: 10, quantity: 1 }
 * ]
 */
exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const cart = JSON.parse(event.body || "[]");

    if (!Array.isArray(cart) || cart.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cart is empty or invalid" }),
      };
    }

    // Build Stripe line_items
    const lineItems = cart.map((item) => {
      const priceInPence = Math.round(Number(item.price) * 100);

      return {
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.name || "Gift item",
          },
          unit_amount: priceInPence,
        },
        quantity: item.quantity || 1,
      };
    });

    // Use Netlify's URL env if available; fallback is origin we detect
    const siteUrl =
      process.env.URL || "https://preyesbaskets.netlify.app"; // change if needed

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${siteUrl}/success/`,
      cancel_url: `${siteUrl}/cart/`,
      // Optional: metadata so you see details in Stripe
      metadata: {
        source: "Preye website",
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
