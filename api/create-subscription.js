const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const { name, email, phone, selectedPlan } = req.body;

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
      // ✅ Razorpay Subscription Logic
      const plan_id = process.env.MONTHLY_PLAN_ID; // Razorpay plan for ₹1350/month x 12

      const subRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan_id,
          total_count: 12,
          customer_notify: 1,
          customer: { name, email, contact: phone }
        })
      });

      const subscription = await subRes.json();
      if (!subscription.id) throw new Error(subscription.error.description);

      options.subscription_id = subscription.id;
      options.description = "Monthly Subscription – Autopay Enabled";

    } else {
      // ✅ One-time Order Logic (Trial or Annual)
      const amount = selectedPlan === "trial" ? 99900 : 1450000;

      const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount,
          currency: "INR",
          receipt: `order_${Date.now()}`,
          payment_capture: 1
        })
      });

      const order = await orderRes.json();
      if (!order.id) throw new Error(order.error.description);

      options.order_id = order.id;
      options.amount = amount;
      options.currency = "INR";
      options.description = selectedPlan === "trial" ? "Trial Kit – One-time" : "Annual Plan – One-time";
    }

    return res.status(200).json(options);

  } catch (err) {
    console.error("❌ Error creating Razorpay session:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
