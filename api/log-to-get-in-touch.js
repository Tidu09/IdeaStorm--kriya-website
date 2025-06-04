const { google } = require("googleapis");

const allowedOrigin = "https://kriyaedu.com"; // or your domain

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // preflight
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const privateKey = Buffer.from(process.env.GCP_PRIVATE_KEY_B64, "base64").toString("utf8");

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

    const spreadsheetId = process.env.GOOGLE_SHEET_GET_IN_TOUCH_ID; // <--- New Sheet ID

    const { name, school, role, whatsapp, email } = req.body;

    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, name, school, role, whatsapp, email]]
      }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Google Sheets error:", err);
    res.status(500).json({ error: "Failed to log to Google Sheet" });
  }
};
