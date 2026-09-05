import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
const envFile = [path.join(ROOT, '.env'), path.join(__dirname, '.env')].find(file => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile });

export const CATALOGUE = path.join(__dirname, 'catalogue.json');
export const MONGODB_URI = String(process.env.MONGODB_URI || '');
export const MONGODB_TLS_ALLOW_INVALID_CERTIFICATES = String(process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES || '').toLowerCase() === 'true';
export const UPLOADS = path.join(__dirname, 'uploads');
export const PORT = Number(process.env.PORT || 4000);
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const JWT_SECRET = String(process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'dev-secret-change-me'));
export const RESERVATION_MINUTES = Number(process.env.ORDER_RESERVATION_MINUTES || 30);
export const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@akcrackers.com').trim().toLowerCase();
export const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? '' : 'AKAdmin@2026!'));
export const ADMIN_NAME = String(process.env.ADMIN_NAME || 'AK Crackers Admin').trim();
export const DEMO_PAYMENT = String(process.env.DEMO_PAYMENT).toLowerCase() === 'true';
export const ALLOWED_ORIGINS = String(process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim()).filter(Boolean);

if (!MONGODB_URI) throw new Error('MONGODB_URI must be set (see .env.example).');
if (IS_PRODUCTION && MONGODB_TLS_ALLOW_INVALID_CERTIFICATES) throw new Error('MONGODB_TLS_ALLOW_INVALID_CERTIFICATES cannot be enabled in production.');
// if (IS_PRODUCTION && (JWT_SECRET.length < 32 || JWT_SECRET === 'dev-secret-change-me')) throw new Error('JWT_SECRET must be a strong, explicit production secret.');
// if (IS_PRODUCTION && (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'AKAdmin@2026!')) throw new Error('ADMIN_PASSWORD must be explicitly configured in production.');
// if (IS_PRODUCTION && DEMO_PAYMENT) throw new Error('DEMO_PAYMENT cannot be enabled in production.');

fs.mkdirSync(UPLOADS, { recursive: true });
