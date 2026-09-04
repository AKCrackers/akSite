import bcrypt from 'bcryptjs';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, CATALOGUE, DB } from './config.js';

export function categoryImage(category) {
  return `/images/categories/${String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
}

export function seedProducts() {
  const source = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
  return source.map((p, i) => ({
    id: `cat-${p.code}-${i + 1}`,
    code: String(p.code),
    name: String(p.name),
    category: String(p.category),
    price: Number(p.price),
    mrp: Number(p.mrp || p.price),
    stock: Number(p.stock || 0),
    active: p.active !== false,
    image: p.image || categoryImage(p.category),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function initialDB() {
  return {
    settings: { shopName: 'AK Crackers', currency: 'INR' },
    notifications: [],
    users: [{ id: 'admin', name: ADMIN_NAME, email: ADMIN_EMAIL, phone: '', password: bcrypt.hashSync(ADMIN_PASSWORD, 10), role: 'admin', address: null, createdAt: new Date().toISOString() }],
    products: seedProducts(),
    orders: [],
    payments: []
  };
}

function ensureAdminAccount(data) {
  const existing = data.users.find(user => user.role === 'admin');
  if (!existing) {
    data.users.push({ id: 'admin', name: ADMIN_NAME, email: ADMIN_EMAIL, phone: '', password: bcrypt.hashSync(ADMIN_PASSWORD, 10), role: 'admin', address: null, createdAt: new Date().toISOString() });
    return true;
  }
  let changed = false;
  if (existing.email.toLowerCase() !== ADMIN_EMAIL) { existing.email = ADMIN_EMAIL; changed = true; }
  if (existing.name !== ADMIN_NAME) { existing.name = ADMIN_NAME; changed = true; }
  if (!bcrypt.compareSync(ADMIN_PASSWORD, existing.password)) { existing.password = bcrypt.hashSync(ADMIN_PASSWORD, 10); changed = true; }
  return changed;
}

export function writeDB(data) {
  const temp = `${DB}.${process.pid}.${uuid()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, DB);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function reconcileCatalogue(data) {
  const seed = seedProducts();
  const existing = Array.isArray(data.products) ? data.products : [];
  const byCode = new Map(existing.map(product => [String(product.code).toLowerCase(), product]));
  const merged = seed.map(seedProduct => {
    const old = byCode.get(seedProduct.code.toLowerCase());
    if (!old) return seedProduct;
    return {
      ...seedProduct,
      id: old.id || seedProduct.id,
      stock: Number.isFinite(Number(old.stock)) ? Number(old.stock) : seedProduct.stock,
      active: old.active !== undefined ? old.active : seedProduct.active,
      image: old.image && String(old.image).startsWith('/uploads/') ? old.image : seedProduct.image,
      createdAt: old.createdAt || seedProduct.createdAt,
      updatedAt: old.updatedAt || seedProduct.updatedAt
    };
  });
  const catalogueCodes = new Set(seed.map(product => product.code.toLowerCase()));
  for (const old of existing) {
    if (!catalogueCodes.has(String(old.code).toLowerCase())) merged.push(old);
  }
  const changed = existing.length !== merged.length || seed.some(product => !existing.some(old => String(old.code).toLowerCase() === product.code.toLowerCase()));
  if (changed) {
    data.products = merged;
    writeDB(data);
    console.log(`Catalogue reconciled: ${existing.length} -> ${merged.length} products.`);
  }
}

function ensureDB() {
  if (!fs.existsSync(DB)) {
    writeDB(initialDB());
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
    reconcileCatalogue(data);
  } catch (error) {
    console.error('Catalogue reconciliation failed:', error.message);
  }
}

export function readDB() {
  ensureDB();
  const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (ensureAdminAccount(data)) writeDB(data);
  return data;
}
