const { google } = require("googleapis");

const allowedOrigin = "https://kriyaedu.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // preflight
  }

  if (req.method !== "GET") {
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
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = process.env.GOOGLE_SHEET_INVITE_CODES_ID;  // Use your Invite Codes Sheet ID
    const code = req.query.code?.toUpperCase();

    if (!code) {
      return res.status(400).json({ valid: false, error: "Invite code is required" });
    }

    const range = "Invites!A2:B";  // A = Invite Code, B = Status
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const rows = response.data.values || [];

    const match = rows.find(row => row[0] === code && row[1]?.toLowerCase() === "unused");

    if (match) {
      return res.status(200).json({ valid: true });
    } else {
      return res.status(200).json({ valid: false });
    }

  } catch (err) {
    console.error("Google Sheets validation error:", err);
    return res.status(500).json({ valid: false, error: "Server error" });
  }
};
