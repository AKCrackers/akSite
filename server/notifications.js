import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function buildInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = 510;
    doc.fontSize(22).text('AK Crackers', { bold: true });
    doc.fontSize(9).fillColor('#666').text('2026 COLLECTION · INVOICE / BILL');
    doc.fillColor('#222').moveDown(0.5);
    doc.fontSize(11).text(`Invoice: ${order.id}`, { align: 'right' });
    doc.fontSize(9).fillColor('#666').text(`Date: ${new Date(order.createdAt).toLocaleString('en-IN')}`, { align: 'right' });
    doc.fillColor('#222').moveDown();
    doc.moveTo(42, doc.y).lineTo(552, doc.y).stroke();
    doc.moveDown(1);

    const startY = doc.y;
    doc.fontSize(10).text('Bill To', 42, startY, { continued: false });
    doc.fontSize(9).fillColor('#555').text(order.address.name, 42);
    doc.text(order.address.phone, 42);
    doc.text(order.address.email || '', 42);

    doc.fillColor('#222').fontSize(10).text('Shipping Address', 300, startY);
    doc.fontSize(9).fillColor('#555').text(order.address.address, 300);
    doc.text(`${order.address.city}, ${order.address.state} - ${order.address.pin}`, 300);
    doc.fillColor('#222');
    doc.y = startY + 75;

    const cols = [42, 70, 335, 380, 450];
    const headers = ['#', 'Product', 'Qty', 'Unit Price', 'Amount'];
    doc.rect(42, doc.y, width, 22).fill('#eeeeee').fillColor('#222');
    headers.forEach((h, i) => doc.fontSize(8).text(h, cols[i], doc.y + 7, { width: i === 1 ? 255 : 65 }));
    doc.y += 28;
    order.items.forEach((item, i) => {
      if (doc.y > 730) { doc.addPage(); doc.y = 42; }
      const y = doc.y;
      const name = `${item.code} · ${item.name}`;
      doc.fontSize(8).fillColor('#222').text(String(i + 1), cols[0], y, { width: 20 });
      doc.text(name, cols[1], y, { width: 255 });
      doc.text(String(item.qty), cols[2], y, { width: 40 });
      doc.text(money(item.price), cols[3], y, { width: 60 });
      doc.text(money(item.price * item.qty), cols[4], y, { width: 70 });
      doc.y = y + Math.max(20, doc.heightOfString(name, { width: 255 }) + 7);
      doc.moveTo(42, doc.y - 4).lineTo(552, doc.y - 4).strokeColor('#dddddd').stroke();
    });

    doc.moveDown(1);
    const totalX = 360;
    doc.fillColor('#222').fontSize(9).text(`Subtotal: ${money(order.subtotal)}`, totalX, doc.y, { width: 190, align: 'right' });
    doc.fontSize(13).text(`TOTAL: ${money(order.total)}`, totalX, doc.y + 15, { width: 190, align: 'right' });
    doc.fontSize(8).fillColor('#666').text(`Payment: ${order.paymentMethod || 'Pending'} · Payment status: ${order.paymentStatus} · Order status: ${order.status}`, 42, doc.y + 75);
    doc.text('Thank you for shopping with AK Crackers.', 42, doc.y + 90);
    doc.end();
  });
}

export function getNotificationConfig() {
  const emailRequired = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const emailMissing = emailRequired.filter(k => !String(process.env[k] || '').trim());
  const adminEmail = String(process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || '').trim();
  const phoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const adminWhatsApp = String(process.env.ADMIN_WHATSAPP_NUMBER || '').trim();
  return {
    email: {
      configured: emailMissing.length === 0,
      missing: emailMissing,
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      username: process.env.SMTP_USER ? `${String(process.env.SMTP_USER).slice(0, 2)}***${String(process.env.SMTP_USER).includes('@') ? String(process.env.SMTP_USER).slice(String(process.env.SMTP_USER).indexOf('@')) : ''}` : '',
      adminEmailConfigured: !!adminEmail
    },
    whatsapp: {
      configured: !!phoneId && !!token,
      missing: [!phoneId ? 'WHATSAPP_PHONE_NUMBER_ID' : null, !token ? 'WHATSAPP_ACCESS_TOKEN' : null].filter(Boolean),
      phoneNumberIdConfigured: !!phoneId,
      adminNumbersConfigured: !!adminWhatsApp
    }
  };
}

function emailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass }
  });
}

export async function testEmailConfiguration(to) {
  const transporter = emailTransport();
  if (!transporter) {
    const missing = getNotificationConfig().email.missing;
    throw new Error(`SMTP is not configured. Missing: ${missing.join(', ')}`);
  }
  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'AK Crackers SMTP test',
    text: 'This is a test email from your AK Crackers notification system. SMTP is configured correctly.'
  });
  return { status: 'sent', messageId: info.messageId || null, to };
}

function notificationText(order) {
  return `Your AK Crackers order ${order.id} is confirmed. Total: ${money(order.total)}. Payment: ${order.paymentMethod || 'Pending'}. Your bill is attached.`;
}

async function sendEmail(to, order, pdf) {
  const transporter = emailTransport();
  if (!transporter) return { status: 'skipped', reason: 'SMTP is not configured' };
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `AK Crackers Order ${order.id} – Bill`,
    text: notificationText(order),
    html: `<h2>AK Crackers</h2><p>Your order <b>${order.id}</b> has been placed successfully.</p><p>Total: <b>${money(order.total)}</b></p><p>Please find your bill attached as a PDF.</p>`,
    attachments: [{ filename: `${order.id}-bill.pdf`, content: pdf, contentType: 'application/pdf' }]
  });
  return { status: 'sent' };
}

function cleanWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function uploadWhatsAppMedia(pdf) {
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'ak-crackers-bill.pdf');
  const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `WhatsApp media upload failed (${r.status})`);
  return data.id;
}

async function sendWhatsApp(to, order, pdf) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { status: 'skipped', reason: 'WhatsApp Cloud API is not configured' };
  const recipient = cleanWhatsAppNumber(to);
  if (!recipient) return { status: 'skipped', reason: 'No WhatsApp number' };
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const mediaId = await uploadWhatsAppMedia(pdf);
  const templateName = String(process.env.WHATSAPP_TEMPLATE_NAME || '').trim();
  let payload;
  if (templateName) {
    payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' },
        components: [
          { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: `${order.id}-bill.pdf` } }] },
          { type: 'body', parameters: [
            { type: 'text', text: order.address.name },
            { type: 'text', text: order.id },
            { type: 'text', text: money(order.total) }
          ] }
        ]
      }
    };
  } else {
    payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'document', document: { id: mediaId, filename: `${order.id}-bill.pdf`, caption: `AK Crackers bill for ${order.id} · ${money(order.total)}` } };
  }
  const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `WhatsApp send failed (${r.status})`);
  return { status: 'sent', messageId: data?.messages?.[0]?.id || null };
}

export async function sendOrderNotifications(order, updateOrder) {
  const pdf = await buildInvoicePdf(order);
  const adminEmail = String(process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || '').trim();
  const adminWhatsAppNumbers = String(process.env.ADMIN_WHATSAPP_NUMBER || '').split(',').map(cleanWhatsAppNumber).filter(Boolean);
  const customerEmail = String(order.address.email || '').trim();
  const customerWhatsApp = order.whatsappOptIn === false ? '' : String(order.address.phone || '').trim();
  const results = {};
  const jobs = [
    ['customerEmail', customerEmail ? sendEmail(customerEmail, order, pdf) : Promise.resolve({ status: 'skipped', reason: 'No customer email' })],
    ['adminEmail', adminEmail ? sendEmail(adminEmail, order, pdf) : Promise.resolve({ status: 'skipped', reason: 'No admin notification email' })],
    ['customerWhatsApp', customerWhatsApp ? sendWhatsApp(customerWhatsApp, order, pdf) : Promise.resolve({ status: 'skipped', reason: order.whatsappOptIn === false ? 'Customer did not opt in to WhatsApp updates' : 'No customer WhatsApp number' })]
  ];
  if (!adminWhatsAppNumbers.length) {
    jobs.push(['adminWhatsApp', Promise.resolve({ status: 'skipped', reason: 'No admin WhatsApp number' })]);
  } else {
    jobs.push(['adminWhatsApp', (async () => {
      const perNumber = [];
      for (const number of adminWhatsAppNumbers) {
        try { perNumber.push({ number, ...(await sendWhatsApp(number, order, pdf)) }); }
        catch (e) { perNumber.push({ number, status: 'failed', reason: e.message }); }
      }
      const failed = perNumber.filter(x => x.status === 'failed').length;
      const sent = perNumber.filter(x => x.status === 'sent').length;
      return { status: failed === perNumber.length ? 'failed' : sent ? 'sent' : 'skipped', recipients: perNumber };
    })()]);
  }
  for (const [key, job] of jobs) {
    try { results[key] = await job; }
    catch (e) { results[key] = { status: 'failed', reason: e.message }; }
  }
  if (updateOrder) await updateOrder({ notificationStatus: results, notificationSentAt: new Date().toISOString() });
  return results;
}
