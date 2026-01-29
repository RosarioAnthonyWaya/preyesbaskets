const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SHIPPING = { standard: 11, express: 15 };

function safeInt(n, fallback = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(1, Math.floor(x));
}

function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function readCatalog() {
  const p = path.join(process.cwd(), "data", "products.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function computePriceFromCatalog(product, options) {
  if (!product) return 0;

  if (product.priceMode === "lookup") {
    const key = product.priceOption;
    const chosen = options?.[key];
    const p = chosen ? Number(product.priceMap?.[chosen] || 0) : 0;
    return p > 0 ? p : 0;
  }

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

function getClientUnitPrice(item) {
  const p = safeNumber(item && item.price, 0);
  return p > 0 ? p : 0;
}

// compact encode for multi-address metadata (keeps it short)
function encodeAddresses(addrs) {
  // name~phone~line1~city~postcode  ||  ...
  // strip pipes/tilde to avoid breaking the format
  const clean = (s) => String(s || "").replace(/[|~]/g, " ").trim();
  return (addrs || [])
    .map((a) => [a.name, a.phone, a.line1, a.city, a.postcode].map(clean).join("~"))
    .join("||");
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const cart = body.cart;
    const deliveries = safeInt(body.deliveriesCount, 1);

    const deliverySpeed = (body.deliverySpeed === "express" ? "express" : "standard");
    const deliveryDate = String(body.deliveryDate || "").trim();

    const multiAddresses = Array.isArray(body.multiAddresses) ? body.multiAddresses : [];
    const isMulti = deliveries > 1 || multiAddresses.length > 0;

    if (!Array.isArray(cart) || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty." }) };
    }
    if (!deliveryDate) {
      return { statusCode: 400, body: JSON.stringify({ error: "Delivery date is required." }) };
    }
    if (isMulti && multiAddresses.length !== deliveries) {
      return { statusCode: 400, body: JSON.stringify({ error: "Please provide one address per delivery." }) };
    }

    const catalog = readCatalog();
    const line_items = [];

    for (const item of cart) {
      const id = String(item.id || "").trim();
      const qty = safeInt(item.qty ?? item.quantity, 1);
      const options = item.options && typeof item.options === "object" ? item.options : {};

      const product = catalog ? catalog[id] : null;
      let unitPrice = 0;

      if (catalog) {
        if (!product) return { statusCode: 400, body: JSON.stringify({ error: `Unknown product: ${id}` }) };
        unitPrice = computePriceFromCatalog(product, options);
      } else {
        unitPrice = getClientUnitPrice(item);
      }

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
          currency: (product && product.currency) || "gbp",
          product_data: { name: `${(product && product.name) || item.name || id}${optionText}` },
          unit_amount: Math.round(unitPrice * 100),
        },
        quantity: qty,
      });
    }

    // Shipping as a line item (per delivery)
    const shipPer = SHIPPING[deliverySpeed] ?? SHIPPING.standard;
    const shipTotal = shipPer * deliveries;

    line_items.push({
      price_data: {
        currency: "gbp",
        product_data: { name: `Delivery (${deliverySpeed}, ${deliveries} drop${deliveries > 1 ? "s" : ""})` },
        unit_amount: Math.round(shipTotal * 100),
      },
      quantity: 1,
    });

    const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;

    const metadata = {
      delivery_speed: deliverySpeed,
      delivery_date: deliveryDate,
      deliveries: String(deliveries),
      address_mode: isMulti ? "multi_collected_on_site" : "stripe_shipping_address",
    };

    if (isMulti) {
      // WARNING: Stripe metadata has size limits.
      // This compact string works for small counts; if you expect 5–10 addresses often,
      // we should store this in a real DB and just put an orderId in metadata.
      metadata.multi_addresses = encodeAddresses(multiAddresses).slice(0, 480);
    }

    const sessionParams = {
      mode: "payment",
      line_items,
      success_url: `${siteUrl}/success/`,
      cancel_url: `${siteUrl}/cart/`,
      metadata,
    };

    // Option B: Stripe collects shipping address only when SINGLE address
    if (!isMulti) {
      sessionParams.shipping_address_collection = { allowed_countries: ["GB"] };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error creating checkout." }) };
  }
};
