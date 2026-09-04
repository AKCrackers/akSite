# AK Crackers Notification Troubleshooting

## 1. Put `.env` in the project root

The file must be beside `package.json`, not inside `client` or `server`.

The server now explicitly loads:

`<project-root>/.env`

so it works even if you launch `node server/server.js` from another directory.

## 2. Gmail SMTP

Use:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM="AK Crackers <yourgmail@gmail.com>"
ADMIN_NOTIFICATION_EMAIL=yourgmail@gmail.com
```

`SMTP_PASS` must be a Gmail App Password, not the normal Google account password.

## 3. Restart Node after changing `.env`

Stop the server with Ctrl+C and run:

```powershell
npm run dev
```

## 4. New diagnostics

After admin login, the Notifications page shows whether the server detected SMTP and WhatsApp configuration.

Use **Send Test Email** to test SMTP without placing an order. The server verifies the SMTP connection first and reports the actual error if authentication/connection fails.

## 5. WhatsApp

Configure `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` for Meta WhatsApp Cloud API. Multiple admin numbers may be comma-separated in `ADMIN_WHATSAPP_NUMBER`.
