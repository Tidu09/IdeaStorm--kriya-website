const nodemailer = require('nodemailer');

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

  const SHIPROCKET_TOKEN = process.env.SHIPROCKET_TOKEN;
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
        tax: 0
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
      throw new Error(errorText || "Shiprocket API failed");
    }

const result = await response.json();

// Check if HTTP failed
if (!response.ok) {
  const errorText = await response.text();
  console.log("❌ Shiprocket API Error:", errorText);
  throw new Error("Shiprocket API failed");
}

// Check if shipment_id exists (order was created)
if (!result.shipment_id) {
  console.log("⚠️ Order created, but no shipment_id found:", JSON.stringify(result, null, 2));
  throw new Error("Shiprocket order creation failed: shipment_id missing");
}

const shipmentId = result.shipment_id;


const assignRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/assign/awb", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SHIPROCKET_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ shipment_id: shipmentId })
});

const assignResult = await assignRes.json();

if (!assignRes.ok || !assignResult.awb_code) {
  console.log("❌ Failed to assign AWB:", JSON.stringify(assignResult, null, 2));
  throw new Error(assignResult.message || "AWB assignment failed");
}

    // Fetch the shipping label
    const labelRes = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/generate/label?shipment_id=${shipmentId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${SHIPROCKET_TOKEN}`
        }
      }
    );

    const labelBuffer = await labelRes.arrayBuffer();

    // Send email with label
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass:EMAIL_PASS,
  },
});

await transporter.sendMail({
  from: 'Kriya <ideastorm.technologies@gmail.com>',
  to: 'ideastorm.technologies@gmail.com',
  subject: `Shipping Label - Shipment #${shipmentId}`,
  text: `Attached is the shipping label for shipment ID ${shipmentId}.`,
  attachments: [
    {
      filename: `Label-${shipmentId}.pdf`,
      content: Buffer.from(labelBuffer),
      contentType: 'application/pdf'
    }
  ]
});

return res.status(200).json({
  success: true,
  tracking: {
    shipment_id: shipmentId,
    awb_code: assignResult.awb_code,
    courier_name: assignResult.courier_name,
    label_sent_to: EMAIL_USER // optional, for confirmation
  }
});
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
