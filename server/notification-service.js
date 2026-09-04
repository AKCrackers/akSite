import { v4 as uuid } from 'uuid';
import { readDB, writeDB } from './db.js';
import { sendOrderNotifications } from './notifications.js';

export async function notifyOrderPlaced(orderId) {
  try {
    const current = readDB();
    const order = current.orders.find(item => item.id === orderId);
    if (!order) return;
    const results = await sendOrderNotifications(order);
    const data = readDB();
    const latest = data.orders.find(item => item.id === orderId);
    if (latest) {
      latest.notificationStatus = results;
      latest.notificationSentAt = new Date().toISOString();
      data.notifications = Array.isArray(data.notifications) ? data.notifications : [];
      data.notifications.unshift({ id: uuid(), orderId, createdAt: new Date().toISOString(), results });
      writeDB(data);
    }
    console.log(`Order notifications ${orderId}:`, results);
  } catch (error) {
    console.error(`Order notification error ${orderId}:`, error.message);
    const data = readDB();
    const latest = data.orders.find(item => item.id === orderId);
    if (latest) {
      latest.notificationStatus = { system: { status: 'failed', reason: error.message } };
      latest.notificationSentAt = new Date().toISOString();
      writeDB(data);
    }
  }
}
