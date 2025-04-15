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

    if (!response.ok || result.status !== 1) {
      console.log("❌ Shiprocket Order Creation Failed:", JSON.stringify(result, null, 2));
      throw new Error(result.message || "Shiprocket order creation failed");
    }
    
const shipmentId = result.shipment_id;
    
if (!response.ok || !result.shipment_id) {
  console.log("❌ Shiprocket Order Creation Failed:", JSON.stringify(result, null, 2));
  throw new Error("Shiprocket order creation failed");
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

    return res.status(200).json({ success: true, tracking: result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
