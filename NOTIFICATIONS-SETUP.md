# AK Crackers — Email + WhatsApp Order Bill Notifications

When an order is successfully confirmed (online payment), the backend generates the same invoice/bill PDF used by the store and attempts to deliver it to:

- Customer email
- Admin email
- Customer WhatsApp (only when the customer opts in at checkout)
- Admin WhatsApp

A notification result is stored on the order and in `server/data.json` under `notifications`.

## Email setup

Configure SMTP in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=orders@example.com
SMTP_PASS=your-password-or-app-password
SMTP_FROM="AK Crackers <orders@example.com>"
ADMIN_NOTIFICATION_EMAIL=admin@example.com
```

Nodemailer uses SMTP for delivery. For Gmail/Google Workspace, use the provider's supported authentication method/app password or OAuth2; do not put your normal account password in frontend code.

## WhatsApp setup (Meta Cloud API)

The website uses the Meta WhatsApp Cloud API from the server. Put these values only in `.env`:

```env
WHATSAPP_API_VERSION=v23.0
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
ADMIN_WHATSAPP_NUMBER=9198XXXXXXXX
```

For production order notifications, create/approve a WhatsApp template in Meta Business Manager. Set:

```env
WHATSAPP_TEMPLATE_NAME=invoice_with_pdf
WHATSAPP_TEMPLATE_LANGUAGE=en_US
```

The template expected by this build has:

- Document header
- 3 body text parameters in this order: customer name, order id, total

The backend uploads the generated PDF to WhatsApp and sends it as the template's document header.

If `WHATSAPP_TEMPLATE_NAME` is blank, the backend uses a direct document message instead. Direct/free-form WhatsApp messages can be restricted by WhatsApp's customer-service window; an approved template is the safer production configuration for proactive order notifications.

## Local testing

With SMTP/WhatsApp credentials blank, the order still completes normally. The order's notification status will show `skipped` rather than failing the order.

This is intentional: notification outages must not cancel a successful payment/order.

## Manual resend

Admin → Orders → **Send Bill** calls:

`POST /api/admin/orders/:id/notify`

This regenerates the bill and attempts all configured channels again.

## Bill PDF endpoints

Customer:

`GET /api/orders/:id/bill.pdf`

Admin:

`GET /api/admin/orders/:id/bill.pdf`

Both require the appropriate authenticated token.
