const crypto = require("crypto");

// Helper to get raw body for signature validation
const getRawBody = req =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

module.exports = async (req, res) => {
  const allowedOrigin = "https://kriyaedu.com";

  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-razorpay-signature");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = await getRawBody(req);
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(403).json({ error: "Invalid webhook signature" });
    }

    const body = JSON.parse(rawBody);

    if (body.event !== "payment.captured") {
      return res.status(200).json({ message: "Ignored non-payment event." });
    }

    const payment = body.payload.payment.entity;

    // ✅ Create clean receipt
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; padding: 2rem; }
          h2 { color: #265098; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          td, th { border: 1px solid #ccc; padding: 8px; }
        </style>
      </head>
      <body>
        <h2>Payment Receipt</h2>
        <p><strong>Name:</strong> ${payment.notes?.name || "Customer"}</p>
        <p><strong>Email:</strong> ${payment.email}</p>
        <p><strong>Phone:</strong> ${payment.contact}</p>
        <p><strong>Amount Paid:</strong> ₹${(payment.amount / 100).toFixed(2)}</p>
        <p><strong>Payment ID:</strong> ${payment.id}</p>
        <p><strong>Date:</strong> ${new Date(payment.created_at * 1000).toLocaleString("en-IN")}</p>
      </body>
      </html>
    `;

    console.log("✅ Receipt generated for payment:", payment.id);

    // Optional: Email or Save this HTML

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    return res.status(500).json({ error: "Webhook handling failed" });
  }
};
