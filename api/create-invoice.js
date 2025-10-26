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

  // MODIFIED: Accept final paid 'amount' and optional 'coupon' directly from the client
  const { name, email, phone, plan, payment_id, amount, coupon } = req.body; 

  const planNameMap = {
    trial: "Trial Kit",
    monthly: "Monthly Subscription",
    annual: "Annual Subscription"
  };

  // Price will be used directly from the body (received as 'amount')
  let description = planNameMap[plan] || "Kriya STEM Kit";
  
  // NEW: Add coupon code to description if present
  if (coupon) {
    description = `${description} (Coupon: ${coupon})`;
  }

  try {
    const response = await fetch("https://api.razorpay.com/v1/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY}:${process.env.RAZORPAY_SECRET}`).toString("base64")
      },
      body: JSON.stringify({
        type: "invoice",
        description: `${description} - Payment ID: ${payment_id}`,
        customer: {
          name,
          email,
          contact: phone
        },
        line_items: [
          {
            name: description,
            amount: amount * 100, // in paise - Uses 'amount' from req.body
            currency: "INR",
            quantity: 1
          }
        ],
        currency: "INR",
        email_notify: 1,
        sms_notify: 0
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.description || "Invoice creation failed");
    }

    res.status(200).json({ invoice_url: result.short_url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
