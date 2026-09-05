import bcrypt from 'bcryptjs';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, CATALOGUE, MONGODB_TLS_ALLOW_INVALID_CERTIFICATES, MONGODB_URI } from './config.js';

// The whole app used to store one big JSON object on disk. To avoid touching
// every route/order/notification file, we keep that same one-object shape,
// but it now lives as a single document in MongoDB instead of a local file.
const DOC_ID = 'main';
const COLLECTION_NAME = 'store';

let client;
let collection;
let cache = null;
let persistQueue = Promise.resolve();

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
    console.log(`Catalogue reconciled: ${existing.length} -> ${merged.length} products.`);
  }
  return changed;
}

async function persistSnapshot(data) {
  if (!collection || !data) return;
  const { _id, ...rest } = data;
  await collection.replaceOne({ _id: DOC_ID }, { _id: DOC_ID, ...rest }, { upsert: true });
}

async function persist() {
  await persistSnapshot(cache);
}

// Call this once at server startup, before app.listen().
export async function connectDB() {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tlsAllowInvalidCertificates: MONGODB_TLS_ALLOW_INVALID_CERTIFICATES });
  await client.connect();
  const db = client.db(); // uses the database name embedded in MONGODB_URI
  collection = db.collection(COLLECTION_NAME);

  const doc = await collection.findOne({ _id: DOC_ID });
  if (!doc) {
    cache = initialDB();
    await persist();
    console.log('MongoDB: initialized new store document.');
  } else {
    const { _id, ...data } = doc;
    cache = data;
    const catalogueChanged = reconcileCatalogue(cache);
    const adminChanged = ensureAdminAccount(cache);
    if (catalogueChanged || adminChanged) await persist();
  }
  console.log('Connected to MongoDB Atlas.');
}

// Same signature/behavior as before: synchronous read of the current data.
export function readDB() {
  if (!cache) throw new Error('Database not initialized. Call connectDB() before handling requests.');
  return cache;
}

// Same signature as before: update in-memory immediately (so subsequent
// readDB() calls in the same request cycle see the change right away),
// then persist to MongoDB in the background.
export function writeDB(data) {
  cache = data;
  const snapshot = JSON.parse(JSON.stringify(data));
  persistQueue = persistQueue
    .then(() => persistSnapshot(snapshot))
    .catch(error => console.error('MongoDB persist failed:', error.message));
}