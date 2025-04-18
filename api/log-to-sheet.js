const { google } = require("googleapis");

const allowedOrigin = "https://kriyaedu.com"; // ✅ update if needed

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // ✅ handle preflight
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }



  const privateKey = Buffer.from(
  process.env.GCP_PRIVATE_KEY_B64,
  "base64"
).toString("utf8");

console.log("🔓 first 60 chars decoded:", privateKey.slice(0, 60));

  
  try {
  const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: process.env.GCP_PROJECT_ID,
    private_key: privateKey,
    client_email: process.env.GCP_CLIENT_EMAIL,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const {
      name,
      email,
      phone,
      payment_id,
      shipping_awb,
      plan,
      address: { house, building, locality, city, state, pincode }
    } = req.body;

    const fullAddress = `${house}, ${building}, ${locality}, ${city}, ${state} - ${pincode}`;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "All!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-IN"),
          name,
          phone,
          email,
          fullAddress,
          payment_id,
          shipping_awb || "Unavailable",
          plan
        ]]
      }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Google Sheets error:", err);
    res.status(500).json({ error: "Failed to log to Google Sheet" });
  }
};
