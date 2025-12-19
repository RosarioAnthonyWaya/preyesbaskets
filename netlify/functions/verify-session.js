// netlify/functions/verify-session.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const session_id = event.queryStringParameters?.session_id;

    if (!session_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing session_id" }),
      };
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    const paid =
      session.payment_status === "paid" ||
      (session.status === "complete" && session.payment_status !== "unpaid");

    return {
      statusCode: 200,
      body: JSON.stringify({
        paid,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total, // in minor units (pence)
        currency: session.currency,
      }),
    };
  } catch (err) {
    console.error("Verify session error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to verify payment" }),
    };
  }
};



