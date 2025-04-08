export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHIPROCKET_TOKEN = process.env.SHIPROCKET_TOKEN;
  const data = req.body;

  // Determine price based on plan
  let price = 999;
  if (data.plan === "monthly") price = 1350;
  else if (data.plan === "annual") price = 14500;

  const payload = {
    order_id: data.payment_id,
    order_date: new Date().toISOString().split('T')[0],
    pickup_location: "Primary",
    billing_customer_name: data.name,
    billing_address: `${data.address.house}, ${data.address.building}`,
    billing_city: data.address.city,
    billing_pincode: data.address.pincode,
    billing_state: "YourState", // optional: you can add this to the form
    billing_country: "India",
    billing_email: data.email,
    billing_phone: data.phone,
    order_items: [
      {
        name: `Kriya STEM Kit - ${data.plan}`,
        sku: `kriya-kit-${data.plan}`,
        units: 1,
        selling_price: price
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
    const response = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SHIPROCKET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Shiprocket API failed");
    }

    return res.status(200).json({ success: true, tracking: result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
