const nodemailer = require('nodemailer');

let cachedToken = null;
let tokenExpiryMs = 0;


async function fetchShiprocketToken() {
  const resp = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,     // set in .env
      password: process.env.SHIPROCKET_PASSWORD // set in .env
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Auth failed: ${t}`);
  }

  const json = await resp.json();

  console.log("🚀 Shiprocket token:", json.token); // 👈 print token here

  cachedToken = json.token;
  const ttlMs = (json.expires_in ?? 3600) * 1000;
  tokenExpiryMs = Date.now() + ttlMs - 60_000; // refresh 1 min early
  return cachedToken;
}

async function getShiprocketToken() {
  if (cachedToken && Date.now() < tokenExpiryMs) {
    return cachedToken;
  }
  return fetchShiprocketToken();
}
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

  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    console.error("❌ SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD environment variables are not set");
    return res.status(500).json({ 
      error: "Shiprocket configuration error: Email or password not found. Please check your environment variables." 
    });
  }

  let SHIPROCKET_TOKEN = await getShiprocketToken();
  const EMAIL_USER = process.env.EMAIL_USER;
  const EMAIL_PASS = process.env.EMAIL_PASS;

  // We assume 'data.amount' is the final paid amount (in Rupees)
  const data = req.body; 

  // --- FIX 1: Define basePrice for calculating discount ---
  let basePrice = 3200;
  if (data.plan === "monthly") basePrice = 1350;
  else if (data.plan === "annual") basePrice = 14500;

  // Final price paid by the customer. Use data.amount from the client (Rupees).
  const finalPrice = data.amount || basePrice; 
  const discountAmount = Math.max(0, basePrice - finalPrice);
  // --------------------------------------------------------
  
  const payload = {
    order_id: data.payment_id,
    order_date: new Date().toISOString().split('T')[0],
    pickup_location: "warehouse",
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
        // --- MODIFIED: Use finalPrice as the selling price to reflect paid amount in UI ---
        selling_price: finalPrice, 
        // --- MODIFIED: Set discount to 0 as the price already reflects the discount ---
        discount: 0, 
        tax: 18
      }
    ],
    payment_method: "Prepaid",
    sub_total: finalPrice, // Correctly using the paid amount
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

    if (!result.shipment_id) {
      console.log("⚠️ Order created, but no shipment_id found:", JSON.stringify(result, null, 2));
      throw new Error("Shiprocket order creation failed: shipment_id missing");
    }

    const shipmentId = result.shipment_id;
    let assignRes = null;
    // const assignRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/assign/awb", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${SHIPROCKET_TOKEN}`,
    //     "Content-Type": "application/json"
    //   },
    //   body: JSON.stringify({ shipment_id: shipmentId })
    // });



    // if (assignRes) {
    //     assignResult = await assignRes.json();
    // }
    // const awbCode = assignResult.response?.data?.awb_code || null;
    // const courierName = assignResult.response?.data?.courier_name || null;

    // if (!assignRes.ok || !awbCode) {
    //   console.log("❌ Failed to assign AWB:", JSON.stringify(assignResult, null, 2));
    //   throw new Error("AWB assignment failed");
    // }

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
    
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

//     const transporter = nodemailer.createTransport({
//   host: "smtp.zoho.com",
//   port: 465,
//   secure: true, // use SSL
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// });

// Customer Confirmation Email with Logo
    await transporter.sendMail({
      from: 'Kriya <ideastorm.technologies@gmail.com>',
      to: data.email,
      subject: `Your Kriya Order #${data.payment_id} has been shipped!`,

      // The plain text version cannot display images, so it remains unchanged.
      // text: `Hi ${data.name},\n\n` +
      //       `Great news! Your Kriya STEM Kit (${data.plan} plan) is on its way.\n\n` +
      //       `You can track your shipment using the details below:\n` +
      //       `Courier: ${courierName}\n` +
      //       `Tracking Number: ${awbCode}\n\n` +
      //       `While you wait, check out Kriya Station (where you will be having fun): https://station.kriyaedu.com/\n\n` +
      //       `We're so excited for you to begin your learning adventure!\n\n` +
      //       `Thanks for your order,\n` +
      //       `The Kriya Team`,

            text: `Hi ${data.name},\n\n` +
            `Great news! Your Kriya STEM Kit (${data.plan} plan) is on its way.\n\n` +
            `While you wait, check out Kriya Station (where you will be having fun): https://station.kriyaedu.com/\n\n` +
            `We're so excited for you to begin your learning adventure!\n\n` +
            `Thanks for your order,\n` +
            `The Kriya Team`,

      // HTML version with the logo at the top
      // html: `
      //   <div style="font-family: sans-serif; line-height: 1.6;">
      //     <img 
      //       src="https://kriyaedu.com/images/logo-email.png" 
      //       alt="Kriya Logo" 
      //       style="width: 200px; height: auto; margin-bottom: 20px;"
      //     >
          
      //     <p>Hi ${data.name},</p>
      //     <p>Great news! Your Kriya STEM Kit (<strong>${data.plan} plan</strong>) is on its way.</p>
      //     <p>You can track your shipment using the details below:</p>
      //     <ul>
      //       <li><strong>Courier:</strong> ${courierName}</li>
      //       <li><strong>Tracking Number:</strong> ${awbCode}</li>
      //     </ul>
      //     <p>While you wait, check out <strong>Kriya Station</strong> (where you will be having fun): <a href="https://station.kriyaedu.com/" target="_blank">https://station.kriyaedu.com/</a></p>
      //     <p>Also, Join our <strong> WhatsApp community </strong> <a href="https://chat.whatsapp.com/DIHIUJHZaLtIjPjS6Ruwvk" target="_blank">https://chat.whatsapp.com/DIHIUJHZaLtIjPjS6Ruwvk</a></p>
      //     <p>We are so excited for you to begin your learning adventure!</p>
      //     <p>Thanks for your order,<br>The Kriya Team</p>
      //   </div>
      // `


       html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <img 
            src="https://kriyaedu.com/images/logo-email.png" 
            alt="Kriya Logo" 
            style="width: 200px; height: auto; margin-bottom: 20px;"
          >
          
          <p>Hi ${data.name},</p>
          <p>Great news! Your Kriya STEM Kit (<strong>${data.plan} plan</strong>) is on its way.</p>
          <p>We Shall Ship all orders from September 1. Thanks for preordering!</p>
          <p>While you wait, check out <strong>Kriya Station</strong> (where you will be having fun): <a href="https://station.kriyaedu.com/" target="_blank">https://station.kriyaedu.com/</a></p>
          <p>Also, Join our <strong> WhatsApp community </strong> <a href="https://chat.whatsapp.com/DIHIUJHZaLtIjPjS6Ruwvk" target="_blank">https://chat.whatsapp.com/DIHIUJHZaLtIjPjS6Ruwvk</a></p>
          <p>We are so excited for you to begin your learning adventure!</p>
          <p>Thanks for your order,<br>The Kriya Team</p>
        </div>
      `
    });

    return res.status(200).json({
      success: true,
      tracking: {
        shipment_id: shipmentId
        //awb_code: awbCode,
        //courier_name: courierName
      }
    });
  } catch (error) {
    console.error("❌ Shiprocket error:", error);
    return res.status(500).json({ error: error.message });
  }
};
