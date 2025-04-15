export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowedOrigin = "https://kriyaedu.com";

if (req.method === 'OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.status(200).end();
}

res.setHeader('Access-Control-Allow-Origin', allowedOrigin);


  const { name, email, phone, plan, payment_id } = req.body;

  const planNameMap = {
    trial: "Trial Kit",
    monthly: "Monthly Subscription",
    annual: "Annual Subscription"
  };

  const amount = plan === "monthly" ? 1350 : plan === "annual" ? 14500 : 999;
  const description = planNameMap[plan] || "Kriya STEM Kit";

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
            amount: amount * 100, // in paise
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
}
