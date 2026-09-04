import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';

const rateBuckets = new Map();

export function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

export function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

export function rateLimit({ windowMs, max, key = request => `${request.ip}:${request.path}` }) {
  return (request, response, next) => {
    const now = Date.now();
    const current = rateBuckets.get(key(request));
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    rateBuckets.set(key(request), bucket);
    if (bucket.count > max) return response.status(429).json({ error: 'Too many requests. Please try again later.' });
    next();
  };
}

export function auth(request, response, next) {
  try {
    const raw = request.headers.authorization || '';
    request.user = jwt.verify(raw.replace(/^Bearer\s+/i, ''), JWT_SECRET);
    next();
  } catch {
    response.status(401).json({ error: 'Please login to continue.' });
  }
}

export function adminOnly(request, response, next) {
  return request.user?.role === 'admin' ? next() : response.status(403).json({ error: 'Admin access required.' });
}
