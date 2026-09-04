# AK Crackers full connectivity checklist

## 1. Install
- Node.js 20+ recommended.
- Open a terminal in this folder.
- Run `npm install`.
- Run `npm --prefix client install`.

## 2. Start
- Copy `.env.example` to `.env`.
- Keep `DEMO_PAYMENT=true` for first testing.
- Run `npm run dev`.
- Open `http://localhost:5173`.

## 3. Verify backend connectivity
Open `http://localhost:4000/api/health`. It should return JSON with `ok: true`.

## 4. Verify customer flow
1. Register a customer.
2. In Admin, set stock for at least one product.
3. Upload its real photo.
4. Customer sees the photo and stock immediately.
5. Add to cart.
6. Checkout.
7. Enter shipping details.
8. Continue to payment.
9. In demo mode, complete the online payment.
10. Check My Orders.
11. Admin sees the same order and payment record.
12. Admin changes order status; customer sees the updated status after opening My Orders again.

## 5. Verify stock protection
- If available stock is 2, a customer cannot add more than 2.
- Creating an order reserves/reduces stock immediately.
- Cancelling an eligible order releases the reserved stock.
- Abandoned pending reservations are automatically released after `ORDER_RESERVATION_MINUTES`.

## 6. Verify real payments
Use Razorpay test credentials first:
- `DEMO_PAYMENT=false`
- `RAZORPAY_KEY_ID=...`
- `RAZORPAY_KEY_SECRET=...`

The secret key stays on the server. The client only receives the public key ID.

## 7. Important
The supplied catalogue does not contain current inventory or individual product photos. The imported 125 products therefore start with stock 0 and category placeholder images. Use Admin → Inventory and Admin → Bulk Photos before accepting real orders.
