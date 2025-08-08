const nodemailer = require('nodemailer');

let cachedToken = null;
let tokenExpiryMs = 0;

let SHIPROCKET_TOKEN = process.env.SHIPROCKET_HARDCODED_TOKEN;

// async function fetchShiprocketToken() {
//   const resp = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       email: process.env.SHIPROCKET_EMAIL,     // set in .env
//       password: process.env.SHIPROCKET_PASSWORD // set in .env
//     })
//   });

//   if (!resp.ok) {
//     const t = await resp.text();
//     throw new Error(`Auth failed: ${t}`);
//   }

//   const json = await resp.json();

//   console.log("🚀 Shiprocket token:", json.token); // 👈 print token here

//   cachedToken = json.token;
//   const ttlMs = (json.expires_in ?? 3600) * 1000;
//   tokenExpiryMs = Date.now() + ttlMs - 60_000; // refresh 1 min early
//   return cachedToken;
// }

// async function getShiprocketToken() {
//   if (cachedToken && Date.now() < tokenExpiryMs) {
//     return cachedToken;
//   }
//   return fetchShiprocketToken();
// }

module.exports = async function handler(req, res) {
  const allowedOrigin = "https://kriyaedu.com";

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if required environment variables are set
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    console.error("❌ SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD environment variables are not set");
    return res.status(500).json({ 
      error: "Shiprocket configuration error: Email or password not found. Please check your environment variables." 
    });
  }

  let SHIPROCKET_TOKEN = await getShiprocketToken();
  const EMAIL_USER = process.env.EMAIL_USER;
  const EMAIL_PASS = process.env.EMAIL_PASS;

  const data = req.body;

  let price = 999;
  if (data.plan === "monthly") price = 1350;
  else if (data.plan === "annual") price = 14500;

  const payload = {
    order_id: data.payment_id,
    order_date: new Date().toISOString().split('T')[0],
    pickup_location: "home",
    shipping_is_billing: true,
    customer_gstin: "",
    billing_customer_name: data.name,
    billing_last_name: "",
    billing_address: [
      data.address.house,
      data.address.building,
      data.address.locality
    ].filter(Boolean).join(', '),
    billing_city: data.address.city,
    billing_pincode: data.address.pincode,
    billing_state: data.address.state,
    billing_country: "India",
    billing_email: data.email,
    billing_phone: data.phone,
    order_items: [
      {
        name: `Kriya STEM Kit - ${data.plan}`,
        sku: `kriya-kit-${data.plan}`,
        units: 1,
        selling_price: price,
        discount: 0,
        tax: 12
      }
    ],
    payment_method: "Prepaid",
    sub_total: price,
    length: 10,
    breadth: 10,
    height: 10,
    weight: 1
  };

  try {
    console.log("🚚 SHIPROCKET PAYLOAD", JSON.stringify(payload, null, 2));

    const response = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SHIPROCKET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ Shiprocket Response:", errorText);
      console.log("🔑 Token being used:", SHIPROCKET_TOKEN ? "Token exists" : "No token");
      console.log("📡 Response status:", response.status);
      console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));
      
      if (response.status === 403) {
        throw new Error("Shiprocket authentication failed. Please check your credentials and ensure they have the required permissions.");
      } else if (response.status === 401) {
        throw new Error("Shiprocket credentials are invalid. Please check your email and password.");
      } else {
        throw new Error(`Shiprocket API failed with status ${response.status}: ${errorText}`);
      }
    }

    const result = await response.json();

    // Check if shipment_id exists (order was created)
    if (!result.shipment_id) {
      console.log("⚠️ Order created, but no shipment_id found:", JSON.stringify(result, null, 2));
      throw new Error("Shiprocket order creation failed: shipment_id missing");
    }

    const shipmentId = result.shipment_id;
    
    if (data.invite) {
      await fetch("https://kriyaedu.com/api/mark-invite-used", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: data.invite,
          usedBy: `${data.name} (${data.email})`,
          plan: data.plan
        })
      });
    } else {
      console.log("⚠️ No invite code provided. Skipping invite marking.");
    }
    
    // Send email notification
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: 'Kriya <ideastorm.technologies@gmail.com>',
      to: 'ideastorm.technologies@gmail.com',
      subject: `New Order Created - Shipment #${shipmentId}`,
      text: `A new order has been created with shipment ID ${shipmentId}.\n\nCustomer: ${data.name} (${data.email})\nPlan: ${data.plan}\nAmount: ₹${price}`,
    });

    return res.status(200).json({
      success: true,
      tracking: {
        shipment_id: shipmentId,
      }
    });
  } catch (error) {
    console.error("❌ Shiprocket error:", error);
    return res.status(500).json({ error: error.message });
  }
};
