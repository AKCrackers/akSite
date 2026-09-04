import { RESERVATION_MINUTES } from './config.js';
import { cleanQty } from './validation.js';
import { v4 as uuid } from 'uuid';
import { readDB, writeDB } from './db.js';

export function calculateCart(items, products) {
  if (!Array.isArray(items) || !items.length) throw new Error('Your cart is empty.');
  const rows = [];
  let subtotal = 0;
  const quantities = new Map();
  for (const raw of items) quantities.set(raw?.productId, (quantities.get(raw?.productId) || 0) + cleanQty(raw?.qty));
  for (const [productId, qty] of quantities) {
    const product = products.find(item => item.id === productId && item.active);
    if (!product) throw new Error('One of the products is no longer available. Refresh your cart.');
    if (!Number.isInteger(qty) || qty < 1) throw new Error(`Invalid quantity for ${product.name}.`);
    if (qty > product.stock) throw new Error(`Only ${product.stock} unit(s) of ${product.name} are available.`);
    rows.push({ productId: product.id, code: product.code, name: product.name, qty, price: product.price, image: product.image });
    subtotal += product.price * qty;
  }
  return { rows, subtotal, total: subtotal };
}

export function releaseReservation(data, order) {
  if (!order.stockReserved) return;
  for (const item of order.items) {
    const product = data.products.find(entry => entry.id === item.productId);
    if (product) product.stock += item.qty;
  }
  order.stockReserved = false;
  order.stockReleasedAt = new Date().toISOString();
}

export function reserveForOrder(data, order) {
  for (const item of order.items) {
    const product = data.products.find(entry => entry.id === item.productId);
    if (!product || product.stock < item.qty) throw new Error(`Stock changed for ${item.name}. Please return to cart and try again.`);
  }
  for (const item of order.items) data.products.find(entry => entry.id === item.productId).stock -= item.qty;
  order.stockReserved = true;
  order.stockReservedAt = new Date().toISOString();
}

export function isExpired(order) {
  if (!order.stockReserved || order.status !== 'Pending' || order.paymentStatus === 'Paid') return false;
  return Date.now() - new Date(order.createdAt).getTime() > RESERVATION_MINUTES * 60 * 1000;
}

export function cleanupExpiredOrders() {
  const data = readDB();
  let changed = false;
  for (const order of data.orders) {
    if (isExpired(order)) {
      releaseReservation(data, order);
      order.status = 'Cancelled';
      order.cancelReason = 'Payment/order reservation expired';
      order.cancelledAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) writeDB(data);
}

export function completePaidOrder(data, order, method, paymentId) {
  if (order.status !== 'Pending' || order.paymentStatus !== 'Pending') throw new Error('Order is no longer payable.');
  if (!order.stockReserved) reserveForOrder(data, order);
  order.status = 'Confirmed';
  order.paymentStatus = 'Paid';
  order.paymentMethod = method;
  order.paymentId = paymentId || null;
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  data.payments.unshift({ id: uuid(), orderId: order.id, status: 'Paid', method, paymentId: paymentId || null, amount: order.total, createdAt: new Date().toISOString() });
}
