# AK Crackers — Full Connected Business Website 2026

This build is a complete customer + admin e-commerce application based on the supplied 2026 AK Crackers catalogue.

## What is connected
- Customer registration/login/logout
- Customer profile + saved shipping details
- 125 exact catalogue products from the supplied PDF
- Live stock read from the backend
- Cart persisted in browser
- Server-side price and stock validation
- Stock reservation when an order is created
- Automatic release of abandoned pending orders after the configured reservation window
- Shipping details required before payment
- Online Payment
- Razorpay Standard Checkout with server-side signature verification
- Customer order history and order cancellation for eligible pending orders
- Admin dashboard
- Product CRUD
- Individual product photo upload/replace/remove
- Bulk photo upload matched by product code
- Bulk stock update
- Admin order status + payment status
- Customer list
- Payment list
- Atomic JSON persistence for local/small deployment
- Vite dev proxy so the frontend does NOT hard-code localhost API URLs
- Production mode serves the built React app from the same Express server

## Catalogue
125 entries: 117 numbered products + G1-G4 Gift Boxes + C1-C4 Combo Packs.
Selling prices are based on the PDF Amount column. Current inventory and individual product photos were not present in the PDF, so stock begins at 0 and category placeholders are used until an admin enters stock/uploads real photos.

## Project structure
- `client/src/main.jsx`: customer storefront and admin dashboard UI.
- `client/src/style.css`: shared storefront and admin styles.
- `server/server.js`: Express bootstrap and HTTP route registration.
- `server/config.js`: environment loading and startup safety checks.
- `server/db.js`: JSON persistence, catalogue seeding, and admin account reconciliation.
- `server/security.js`: JWT authentication, admin authorization, and rate limiting.
- `server/validation.js`: shared account, address, and quantity validation.
- `server/orders.js`: cart calculation, stock reservations, expiry, and payment finalization.
- `server/uploads.js`: image storage, validation, and safe local-file removal.
- `server/catalogue.js`: bulk-photo filename matching.
- `server/notification-service.js`: order notification persistence and delivery orchestration.
- `server/notifications.js`: email, WhatsApp, and invoice PDF delivery implementation.
- `server/catalogue.json`: authoritative product catalogue.
- `server/data.json`: local application data; replace with a transactional database for multi-instance production.

## Run on Windows
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Keep `DEMO_PAYMENT=true` for local testing.
4. Run `start.bat` or:
   - `npm install`
   - `npm --prefix client install`
   - `npm run dev`
5. Open `http://localhost:5173`.

Admin setup:
- Set a unique `ADMIN_EMAIL` and strong `ADMIN_PASSWORD` in `.env`.
- Production also requires a strong `JWT_SECRET` and never permits demo payments.

## Real Razorpay
Set `DEMO_PAYMENT=false` and provide `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`. Never put the secret key in client code.

## Production
For production-scale traffic, move the JSON database to PostgreSQL/MySQL and uploaded images to object storage/CDN, enable HTTPS, use secure cookies or a hardened token strategy, add rate limiting, backups, audit logging, and Razorpay webhooks.

## Product visibility / old-data self-heal
On server startup, the app reconciles any existing `server/data.json` against the supplied 125-product 2026 catalogue. This fixes older installations that had only a small starter catalogue while preserving matching stock and uploaded photos.


## Order bill notifications

This build sends the generated invoice PDF automatically after verified payment confirms an order. The notification fan-out is: **customer email + admin email + customer WhatsApp (when opted in/configured) + admin WhatsApp**. Configure SMTP for email and Meta WhatsApp Cloud API for WhatsApp. See `NOTIFICATIONS-SETUP.md`. Admin can manually resend from Admin → Orders → Send Bill and can review delivery results under Admin → Notifications.
