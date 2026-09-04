import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { buildInvoicePdf, sendOrderNotifications, getNotificationConfig, testEmailConfiguration } from './notifications.js';
import { ALLOWED_ORIGINS, DB, DEMO_PAYMENT, IS_PRODUCTION, PORT, ROOT, RESERVATION_MINUTES, UPLOADS } from './config.js';
import { categoryImage, readDB, writeDB } from './db.js';
import { adminOnly, auth, publicUser, rateLimit, tokenFor } from './security.js';
import { cleanAddress, validEmail, validPhone, validPin, validateAddress } from './validation.js';
import { imageUpload, removeLocalUpload, validImageFile } from './uploads.js';
import { calculateCart, cleanupExpiredOrders, completePaidOrder, releaseReservation, reserveForOrder } from './orders.js';
import { findProductForPhoto } from './catalogue.js';
import { notifyOrderPlaced } from './notification-service.js';
const notificationEnvStatus = getNotificationConfig();
console.log(`[notifications] Email ${notificationEnvStatus.email.configured ? 'configured' : `NOT configured (missing: ${notificationEnvStatus.email.missing.join(', ')})`}; WhatsApp ${notificationEnvStatus.whatsapp.configured ? 'configured' : `NOT configured (missing: ${notificationEnvStatus.whatsapp.missing.join(', ')})`}.`);

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.includes(origin)), credentials: false }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (IS_PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'AK Crackers API', time: new Date().toISOString() }));
app.get('/api/config', (_req, res) => res.json({ shopName: 'AK Crackers', reservationMinutes: RESERVATION_MINUTES, razorpayEnabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && !DEMO_PAYMENT) }));

app.get('/api/products', (_req, res) => {
  cleanupExpiredOrders();
  const d = readDB();
  res.json(d.products.filter(p => p.active));
});

app.post('/api/auth/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!String(name || '').trim() || !validEmail(cleanEmail) || !validPhone(phone) || String(password || '').length < 6) return res.status(400).json({ error: 'Name, valid email, 10-digit phone and 6+ character password are required.' });
  const d = readDB();
  if (d.users.some(u => u.email.toLowerCase() === cleanEmail)) return res.status(409).json({ error: 'Email is already registered.' });
  const u = { id: uuid(), name: String(name).trim(), email: cleanEmail, phone: String(phone), password: await bcrypt.hash(String(password), 10), role: 'customer', address: null, createdAt: new Date().toISOString() };
  d.users.push(u); writeDB(d);
  res.status(201).json({ token: tokenFor(u), user: publicUser(u) });
});

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: req => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}` }), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const d = readDB();
  const u = d.users.find(x => x.email.toLowerCase() === email);
  if (u?.role === 'admin') return res.status(403).json({ error: 'Admin accounts must use the Admin Login page.' });
  if (!u || !(await bcrypt.compare(String(req.body?.password || ''), u.password))) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: tokenFor(u), user: publicUser(u) });
});

app.post('/api/auth/admin-login', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => `${req.ip}:admin` }), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const d = readDB();
  const u = d.users.find(x => x.role === 'admin' && x.email.toLowerCase() === email);
  if (!u || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ error: 'Invalid admin email or password.' });
  res.json({ token: tokenFor(u), user: publicUser(u) });
});

app.get('/api/admin-login-check', (req, res) => {
  const d = readDB();
  const admin = d.users.find(u => u.role === 'admin');
  res.json({ ok: true, endpoint: '/api/auth/admin-login', adminConfigured: !!admin });
});

app.get('/api/me', auth, (req, res) => {
  const u = readDB().users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json(publicUser(u));
});
app.put('/api/me', auth, (req, res) => {
  const d = readDB(); const u = d.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const name = String(req.body?.name || '').trim(); const phone = String(req.body?.phone || '').trim();
  if (!name || !validPhone(phone)) return res.status(400).json({ error: 'Valid name and phone are required.' });
  u.name = name; u.phone = phone; writeDB(d); res.json(publicUser(u));
});
app.put('/api/me/address', auth, (req, res) => {
  const d = readDB(); const u = d.users.find(x => x.id === req.user.id); if (!u) return res.status(404).json({ error: 'User not found.' });
  const address = cleanAddress({ ...req.body, email: u.email });
  if (!validateAddress(address)) return res.status(400).json({ error: 'Please provide a complete valid shipping address.' });
  u.address = address; u.phone = address.phone; writeDB(d); res.json(publicUser(u));
});

app.post('/api/orders/preview', auth, (req, res) => {
  cleanupExpiredOrders();
  try { res.json(calculateCart(req.body?.items, readDB().products)); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/orders', auth, (req, res) => {
  cleanupExpiredOrders();
  const d = readDB();
  const account = d.users.find(u => u.id === req.user.id);
  if (!account) return res.status(404).json({ error: 'User not found.' });
  const address = cleanAddress(req.body?.address);
  address.email = account.email;
  if (!validateAddress(address)) return res.status(400).json({ error: 'Complete shipping name, phone, address, city, state and 6-digit PIN are required before payment.' });
  try {
    const calc = calculateCart(req.body?.items, d.products);
    const order = { id: `AK-${Date.now()}-${uuid().slice(0, 8)}`, userId: req.user.id, items: calc.rows, address, whatsappOptIn: req.body?.whatsappOptIn !== false && address.phone === account.phone, subtotal: calc.subtotal, total: calc.total, status: 'Pending', paymentStatus: 'Pending', paymentMethod: null, paymentId: null, razorpayOrderId: null, stockReserved: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    reserveForOrder(d, order);
    d.orders.unshift(order);
    writeDB(d);
    res.status(201).json(order);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/orders', auth, (req, res) => { cleanupExpiredOrders(); res.json(readDB().orders.filter(o => o.userId === req.user.id)); });
app.get('/api/orders/:id', auth, (req, res) => {
  cleanupExpiredOrders(); const o = readDB().orders.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' }); res.json(o);
});

app.get('/api/orders/:id/bill.pdf', auth, async (req, res) => {
  try {
    const o = readDB().orders.find(x => x.id === req.params.id && x.userId === req.user.id);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    const pdf = await buildInvoicePdf(o);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=\"${o.id}-bill.pdf\"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: 'Could not generate bill.' }); }
});

app.post('/api/orders/:id/cancel', auth, (req, res) => {
  const d = readDB(); const o = d.orders.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (!['Pending', 'Confirmed'].includes(o.status) || o.paymentStatus === 'Paid') return res.status(400).json({ error: 'This order can no longer be cancelled online.' });
  releaseReservation(d, o); o.status = 'Cancelled'; o.cancelReason = 'Cancelled by customer'; o.cancelledAt = new Date().toISOString(); o.updatedAt = new Date().toISOString(); writeDB(d); res.json(o);
});

app.post('/api/payments/create', auth, async (req, res) => {
  cleanupExpiredOrders(); const d = readDB(); const o = d.orders.find(x => x.id === req.body?.orderId && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.status !== 'Pending') return res.status(400).json({ error: `Order is ${o.status.toLowerCase()}.` });
  if (o.paymentStatus === 'Paid') return res.status(400).json({ error: 'Order is already paid.' });
  const demo = DEMO_PAYMENT;
  if (!demo && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) return res.status(503).json({ error: 'Online payment is not configured.' });
  if (demo) return res.json({ demo: true, orderId: o.id, amount: o.total * 100, currency: 'INR' });
  try {
    const rz = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const r = await rz.orders.create({ amount: Math.round(o.total * 100), currency: 'INR', receipt: o.id });
    const latest = readDB(); const latestOrder = latest.orders.find(x => x.id === o.id);
    latestOrder.razorpayOrderId = r.id; latestOrder.updatedAt = new Date().toISOString(); writeDB(latest);
    res.json({ demo: false, keyId: process.env.RAZORPAY_KEY_ID, orderId: o.id, razorpayOrderId: r.id, amount: r.amount, currency: r.currency, prefill: { name: o.address.name, email: o.address.email, contact: o.address.phone } });
  } catch (e) { res.status(502).json({ error: 'Could not create the Razorpay payment order.' }); }
});

app.post('/api/payments/demo-success', auth, (req, res) => {
  if (!DEMO_PAYMENT || IS_PRODUCTION) return res.status(403).json({ error: 'Demo payment is disabled.' });
  const d = readDB(); const o = d.orders.find(x => x.id === req.body?.orderId && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  try { completePaidOrder(d, o, req.body?.method || 'Demo Payment', `demo_${Date.now()}`); writeDB(d); void notifyOrderPlaced(o.id); res.json(o); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/payments/verify', auth, async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const d = readDB(); const o = d.orders.find(x => x.id === orderId && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.status !== 'Pending' || o.paymentStatus !== 'Pending') return res.status(400).json({ error: 'Order is no longer payable.' });
  if (!o.razorpayOrderId || o.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ error: 'Payment order mismatch.' });
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(500).json({ error: 'Razorpay secret is not configured on the server.' });
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const supplied = String(razorpay_signature || '');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return res.status(400).json({ error: 'Payment signature verification failed.' });
  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || payment.currency !== 'INR' || Number(payment.amount) !== Math.round(o.total * 100) || !['captured', 'authorized'].includes(payment.status)) return res.status(400).json({ error: 'Payment details could not be validated.' });
    if (d.payments.some(p => p.paymentId === razorpay_payment_id)) return res.status(409).json({ error: 'Payment has already been processed.' });
    completePaidOrder(d, o, 'Razorpay', razorpay_payment_id); writeDB(d); void notifyOrderPlaced(o.id); res.json(o);
  } catch (e) { res.status(400).json({ error: e.message || 'Payment verification failed.' }); }
});

app.get('/api/admin/stats', auth, adminOnly, (_req, res) => {
  cleanupExpiredOrders(); const d = readDB();
  const paid = d.orders.filter(o => o.paymentStatus === 'Paid').reduce((s, o) => s + o.total, 0);
  res.json({ products: d.products.length, activeProducts: d.products.filter(p => p.active).length, inStock: d.products.filter(p => p.active && p.stock > 0).length, lowStock: d.products.filter(p => p.active && p.stock > 0 && p.stock <= 5).length, orders: d.orders.length, pendingOrders: d.orders.filter(o => ['Pending', 'Confirmed', 'Processing'].includes(o.status)).length, customers: d.users.filter(u => u.role === 'customer').length, revenue: paid });
});
app.get('/api/admin/products', auth, adminOnly, (_req, res) => res.json(readDB().products));
app.post('/api/admin/products', auth, adminOnly, (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim(); const code = String(b.code || '').trim(); const category = String(b.category || 'General').trim(); const price = Number(b.price); const mrp = Number(b.mrp ?? b.price); const stock = Number(b.stock ?? 0);
  if (!name || !code || !Number.isFinite(price) || price < 0 || !Number.isFinite(mrp) || mrp < 0 || !Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'Valid code, name, price, MRP and stock are required.' });
  const d = readDB(); if (d.products.some(p => p.code.toLowerCase() === code.toLowerCase())) return res.status(409).json({ error: 'Product code already exists.' });
  const p = { id: uuid(), code, name, category, price, mrp, stock: Math.floor(stock), active: b.active !== false, image: String(b.image || categoryImage(category)), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  d.products.push(p); writeDB(d); res.status(201).json(p);
});
app.put('/api/admin/products/:id', auth, adminOnly, (req, res) => {
  const d = readDB(); const p = d.products.find(x => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body || {}; const code = String(b.code ?? p.code).trim(); const name = String(b.name ?? p.name).trim(); const category = String(b.category ?? p.category).trim(); const price = Number(b.price ?? p.price); const mrp = Number(b.mrp ?? p.mrp); const stock = Number(b.stock ?? p.stock);
  if (!name || !code || !category || !Number.isFinite(price) || price < 0 || !Number.isFinite(mrp) || mrp < 0 || !Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'Invalid product data.' });
  if (d.products.some(x => x.id !== p.id && x.code.toLowerCase() === code.toLowerCase())) return res.status(409).json({ error: 'Product code already exists.' });
  Object.assign(p, { code, name, category, price, mrp, stock: Math.floor(stock), active: b.active === undefined ? p.active : Boolean(b.active), image: String(b.image ?? p.image), updatedAt: new Date().toISOString() });
  writeDB(d); res.json(p);
});
app.delete('/api/admin/products/:id', auth, adminOnly, (req, res) => {
  const d = readDB(); const p = d.products.find(x => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (d.orders.some(o => o.items.some(i => i.productId === p.id))) return res.status(409).json({ error: 'This product is used in an order. Hide it instead of deleting it.' });
  removeLocalUpload(p.image); d.products = d.products.filter(x => x.id !== p.id); writeDB(d); res.json({ ok: true });
});

app.post('/api/admin/products/:id/image', auth, adminOnly, (req, res) => imageUpload.single('image')(req, res, err => {
  if (err) return res.status(400).json({ error: err.message || 'Image upload failed.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP image.' });
  if (!validImageFile(req.file)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'The uploaded file is not a valid JPG, PNG or WebP image.' }); }
  const d = readDB(); const p = d.products.find(x => x.id === req.params.id);
  if (!p) { fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Product not found.' }); }
  removeLocalUpload(p.image); p.image = `/uploads/${req.file.filename}`; p.updatedAt = new Date().toISOString(); writeDB(d); res.json(p);
}));
app.delete('/api/admin/products/:id/image', auth, adminOnly, (req, res) => {
  const d = readDB(); const p = d.products.find(x => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'Product not found.' });
  removeLocalUpload(p.image); p.image = categoryImage(p.category); p.updatedAt = new Date().toISOString(); writeDB(d); res.json(p);
});

app.post('/api/admin/products/bulk-images', auth, adminOnly, (req, res) => imageUpload.array('photos', 125)(req, res, err => {
  if (err) return res.status(400).json({ error: err.message || 'Bulk upload failed.' });
  const files = req.files || []; if (!files.length) return res.status(400).json({ error: 'Choose at least one photo.' });
  const d = readDB(); const seen = new Set(); const results = [];
  for (const file of files) {
    if (!validImageFile(file)) { fs.unlinkSync(file.path); results.push({ file: file.originalname, status: 'invalid', message: 'File signature does not match its image extension.' }); continue; }
    const p = findProductForPhoto(file.originalname, d.products);
    if (!p) { fs.unlinkSync(file.path); results.push({ file: file.originalname, status: 'unmatched', message: 'No product code/name matched this filename.' }); continue; }
    if (seen.has(p.id)) { fs.unlinkSync(file.path); results.push({ file: file.originalname, status: 'duplicate', code: p.code, name: p.name, message: 'Another selected file already matched this product.' }); continue; }
    removeLocalUpload(p.image); p.image = `/uploads/${file.filename}`; p.updatedAt = new Date().toISOString(); seen.add(p.id); results.push({ file: file.originalname, status: 'uploaded', code: p.code, name: p.name, image: p.image });
  }
  writeDB(d); res.json({ ok: true, uploaded: results.filter(x => x.status === 'uploaded').length, unmatched: results.filter(x => x.status === 'unmatched').length, duplicates: results.filter(x => x.status === 'duplicate').length, invalid: results.filter(x => x.status === 'invalid').length, results });
}));
app.get('/api/admin/photo-template', auth, adminOnly, (_req, res) => {
  const lines = ['code,name,suggested_filename,current_photo'];
  for (const p of readDB().products) lines.push([p.code, p.name, `${p.code}.jpg`, p.image?.startsWith('/uploads/') ? 'uploaded' : 'not_uploaded'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename=ak-crackers-photo-template.csv'); res.send(lines.join('\n'));
});
app.post('/api/admin/inventory/bulk', auth, adminOnly, (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : []; if (!updates.length) return res.status(400).json({ error: 'No inventory updates supplied.' });
  const d = readDB(); let count = 0;
  for (const u of updates) { const p = d.products.find(x => x.id === u.productId); const stock = Number(u.stock); if (p && Number.isFinite(stock) && stock >= 0) { p.stock = Math.floor(stock); p.updatedAt = new Date().toISOString(); count++; } }
  writeDB(d); res.json({ ok: true, updated: count });
});


app.get('/api/admin/orders/:id/bill.pdf', auth, adminOnly, async (req, res) => {
  try {
    const o = readDB().orders.find(x => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    const pdf = await buildInvoicePdf(o);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=\"${o.id}-bill.pdf\"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: 'Could not generate bill.' }); }
});
app.post('/api/admin/orders/:id/notify', auth, adminOnly, async (req, res) => {
  const o = readDB().orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  const results = await sendOrderNotifications(o);
  const d = readDB(); const latest = d.orders.find(x => x.id === o.id);
  if (latest) { latest.notificationStatus = results; latest.notificationSentAt = new Date().toISOString(); d.notifications = Array.isArray(d.notifications) ? d.notifications : []; d.notifications.unshift({ id: uuid(), orderId: o.id, manual: true, createdAt: new Date().toISOString(), results }); writeDB(d); }
  res.json({ ok: true, order: latest || o, results });
});
app.get('/api/admin/notifications', auth, adminOnly, (_req, res) => res.json(readDB().notifications || []));
app.get('/api/admin/notification-config', auth, adminOnly, (_req, res) => res.json(getNotificationConfig()));
app.post('/api/admin/notifications/test-email', auth, adminOnly, async (req, res) => {
  try {
    const to = String(req.body?.to || process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || '').trim();
    if (!to) return res.status(400).json({ ok: false, error: 'Enter a test email address or configure ADMIN_NOTIFICATION_EMAIL.' });
    const result = await testEmailConfiguration(to);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/orders', auth, adminOnly, (_req, res) => { cleanupExpiredOrders(); res.json(readDB().orders); });
app.put('/api/admin/orders/:id', auth, adminOnly, (req, res) => {
  const allowedStatus = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const allowedPayment = ['Pending', 'Paid', 'Failed', 'Refunded'];
  const d = readDB(); const o = d.orders.find(x => x.id === req.params.id); if (!o) return res.status(404).json({ error: 'Order not found.' });
  const nextStatus = String(req.body?.status ?? o.status); const nextPayment = String(req.body?.paymentStatus ?? o.paymentStatus);
  if (!allowedStatus.includes(nextStatus) || !allowedPayment.includes(nextPayment)) return res.status(400).json({ error: 'Invalid order or payment status.' });
  if (nextPayment === 'Paid' && o.paymentStatus !== 'Paid') return res.status(400).json({ error: 'Paid status can only come from verified payment.' });
  if (!['Pending', 'Cancelled'].includes(nextStatus) && nextPayment !== 'Paid') return res.status(400).json({ error: 'Fulfilled orders must have verified payment.' });
  if (o.paymentStatus === 'Paid' && nextPayment === 'Pending') return res.status(400).json({ error: 'A paid order cannot be reset to pending.' });
  if (nextStatus === 'Cancelled' && o.status !== 'Cancelled') {
    if (o.paymentStatus === 'Paid' && nextPayment !== 'Refunded') return res.status(400).json({ error: 'A paid order must be marked Refunded before cancellation.' });
    releaseReservation(d, o);
  }
  if (o.status === 'Cancelled' && nextStatus !== 'Cancelled' && o.paymentStatus !== 'Paid') { try { reserveForOrder(d, o); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const wasConfirmed = o.status === 'Confirmed';
  o.status = nextStatus; o.paymentStatus = nextPayment; if (req.body?.note !== undefined) o.adminNote = String(req.body.note).slice(0, 1000); o.updatedAt = new Date().toISOString();
  writeDB(d);

  // If an admin manually confirms an order (rather than payment/COD flow doing it),
  // trigger the same bill-notification workflow. Do not duplicate an earlier send.
  if (nextStatus === 'Confirmed' && !wasConfirmed && !o.notificationSentAt) {
    void notifyOrderPlaced(o.id);
  }
  res.json(o);
});
app.get('/api/admin/customers', auth, adminOnly, (_req, res) => res.json(readDB().users.filter(u => u.role === 'customer').map(publicUser)));
app.get('/api/admin/payments', auth, adminOnly, (_req, res) => res.json(readDB().payments));

const clientDist = path.join(ROOT, 'client', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

setInterval(() => { try { cleanupExpiredOrders(); } catch (e) { console.error('cleanup error', e.message); } }, 5 * 60 * 1000).unref();

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(PORT, () => {
  console.log(`AK Crackers server running on http://localhost:${PORT}`);
  const n = getNotificationConfig();
  console.log(`Notifications: email=${n.email.configured ? 'configured' : 'not configured'}${n.email.missing.length ? ` (missing: ${n.email.missing.join(', ')})` : ''}; WhatsApp=${n.whatsapp.configured ? 'configured' : 'not configured'}${n.whatsapp.missing.length ? ` (missing: ${n.whatsapp.missing.join(', ')})` : ''}`);
});
