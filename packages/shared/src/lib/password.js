// ============================================================
//  Helper kata sandi — hashing SHA-256 dengan salt per pengguna
//  Memakai Web Crypto API (butuh konteks aman, mis. localhost
//  atau https — yang memang dipakai semua lingkungan Sa7tein).
// ============================================================

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}
