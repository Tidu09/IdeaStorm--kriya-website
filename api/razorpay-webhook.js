const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// Helper to get raw body for signature validation
const getRawBody = req =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

console.log("📬 Webhook hit at", new Date().toISOString());

module.exports = async (req, res) => {
  const allowedOrigin = "https://kriyaedu.com";

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

    // ✅ Receipt HTML
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 2rem; }
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

    console.log("✅ Generating PDF for:", payment.id);
    const receiptPath = `/tmp/receipt-${payment.id}.pdf`;

    // ✅ Create and upload PDF
await new Promise(async (resolve, reject) => {
  try {
  const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath,
  headless: chromium.headless,
});

    const page = await browser.newPage();
    await page.setContent(receiptHTML, { waitUntil: "networkidle0" });
    await page.pdf({
      path: receiptPath,
      format: "A4",
      printBackground: true
    });

    await browser.close();

cloudinary.uploader.upload(receiptPath, {
  resource_type: "raw",
  public_id: `receipts/receipt-${payment.id}`, // ✅ already includes the folder path
});
    

    console.log("✅ Uploaded to Cloudinary:", uploadResult.secure_url);
    resolve();
  } catch (err) {
    console.error("❌ PDF generation/upload error:", err);
    reject(err);
  }
});

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    return res.status(500).json({ error: "Webhook handling failed" });
  }
};
