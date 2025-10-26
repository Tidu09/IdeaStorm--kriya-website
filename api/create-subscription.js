const allowedOrigin = "https://kriyaedu.com"; // ✅ Your frontend domain

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);

  // MODIFIED: Added 'coupon' to destructuring to prevent crashes
  const { name, email, phone, selectedPlan, amount, coupon } = req.body; 

  const key = process.env.RAZORPAY_KEY;
  const secret = process.env.RAZORPAY_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  let options = {
    key,
    name: "Kriya Kits",
    prefill: { name, email, contact: phone },
    theme: { color: "#bc9670" }
  };

  try {
    if (selectedPlan === "monthly") {
      const plan_id = process.env.MONTHLY_PLAN_ID;
      console.log("🚨 Using plan_id:", process.env.MONTHLY_PLAN_ID);
      const subRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan_id,
          total_count: 12,
          customer_notify: 1 
        })
      });

      const subscription = await subRes.json();
      if (!subscription.id) throw new Error(subscription.error.description);

      options.subscription_id = subscription.id;
      options.description = "Monthly Subscription – Autopay Enabled";
      
      // Since subscriptions are fixed price, no need to pass amount here, 
      // but Razorpay will handle the first payment amount based on the plan.

    } else {
      // For trial and annual (one-time payments), create a Razorpay Order
      
      const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // FIXED: Convert Rupees (from client) to Paise (for Razorpay)
          amount: amount, 
          currency: "INR",
          receipt: `order_${Date.now()}`,
          payment_capture: 1,
          notes: {
            coupon_code: coupon || 'NONE',
            plan: selectedPlan
          }
        })
      });

      const order = await orderRes.json();
      if (!order.id) throw new Error(order.error.description);

      options.order_id = order.id;
      // FIXED: Send amount in Paise to the client for Razorpay popup
      options.amount = amount * 100; 
      options.currency = "INR";
      options.description = selectedPlan === "trial"
        ? "Trial Kit – One-time"
        : "Annual Plan – One-time";
    }

    return res.status(200).json(options);

  } catch (err) {
    console.error("❌ Razorpay Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
