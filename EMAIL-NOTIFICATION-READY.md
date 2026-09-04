# AK Crackers — Automatic Customer + Admin Email Bills

This build is wired to send the generated PDF bill automatically when an order becomes **Confirmed**.

## Email recipients
- Customer: the billing/checkout email stored on the order (falls back to the signed-in customer's account email when checkout email is blank).
- Admin: `ADMIN_NOTIFICATION_EMAIL`, falling back to `SMTP_USER` when the admin email setting is blank.

Both emails include the same order-specific PDF bill attachment: `<ORDER_ID>-bill.pdf`.

## When email is sent
- Razorpay payment verification succeeds.
- order is confirmed.
- Admin changes an order from `Pending` to `Confirmed`.

The admin-status path does not duplicate a notification that was already sent for that order.

## Gmail `.env`
Create a `.env` in the project root (next to `package.json`):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM="AK Crackers <your-gmail-address@gmail.com>"
ADMIN_NOTIFICATION_EMAIL=admin@example.com
```

For Gmail, use a Google App Password or another supported authentication method. Never put SMTP secrets in frontend/client files.

## Test without placing an order
1. Start the server with `npm run dev`.
2. Sign in to Admin.
3. Open **Admin → Notifications**.
4. Enter an email address in **Test email** and click **Send Test Email**.
5. Confirm the test arrives.

The Notifications page also shows whether the server sees SMTP as configured.

## Delivery behavior
Email failures are recorded in the notification log and do not cancel an otherwise successful order/payment. Admin can use **Admin → Orders → Send Bill** to resend manually.
