export function validPhone(value) { return /^[6-9]\d{9}$/.test(String(value || '')); }
export function validPin(value) { return /^\d{6}$/.test(String(value || '')); }
export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')); }

export function cleanAddress(address = {}) {
  return {
    name: String(address.name || '').trim(),
    phone: String(address.phone || '').trim(),
    email: String(address.email || '').trim(),
    address: String(address.address || '').trim(),
    city: String(address.city || '').trim(),
    state: String(address.state || '').trim(),
    pin: String(address.pin || '').trim()
  };
}

export function validateAddress(address) {
  return address.name && validPhone(address.phone) && address.address && address.city && address.state && validPin(address.pin);
}

export function cleanQty(value) {
  return Number.isInteger(Number(value)) ? Number(value) : NaN;
}
