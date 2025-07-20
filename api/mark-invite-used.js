const { google } = require("googleapis");

const allowedOrigin = "https://kriyaedu.com"; // your domain

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, usedBy, plan } = req.body;
  if (!code || !usedBy || !plan) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
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

    const spreadsheetId = process.env.GOOGLE_SHEET_INVITE_CODES_ID;
    const range = 'Sheet1!A2:E';  // Adjust if your tab name differs

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    let updated = false;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === code && rows[i][1]?.toLowerCase() === 'unused') {
        const rowNumber = i + 2; // offset for header + 1-based index
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!B${rowNumber}:E${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [[
              'used',       // Status
              usedBy,       // Used By
              plan,         // Plan
              timestamp     // Used At
            ]]
          }
        });
        updated = true;
        break;
      }
    }

    if (updated) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ success: false, error: "Code not found or already used" });
    }

  } catch (err) {
    console.error("Error updating Google Sheet:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
