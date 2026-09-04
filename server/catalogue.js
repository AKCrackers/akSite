export function normalizePhotoKey(value) {
  return String(value || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '').replace(/^0+(?=\d)/, '');
}

export function findProductForPhoto(filename, products) {
  const key = normalizePhotoKey(filename);
  if (!key) return null;
  let product = products.find(item => normalizePhotoKey(item.code) === key);
  if (product) return product;
  product = products.find(item => normalizePhotoKey(item.id) === key);
  if (product) return product;
  const candidates = products.filter(item => key.startsWith(normalizePhotoKey(item.code))).sort((a, b) => normalizePhotoKey(b.code).length - normalizePhotoKey(a.code).length);
  if (candidates.length) return candidates[0];
  return products.find(item => normalizePhotoKey(item.name) === key) || null;
}
