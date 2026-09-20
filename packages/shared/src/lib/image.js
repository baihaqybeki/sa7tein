// ============================================================
//  Helper gambar — membaca & mengompres foto yang diunggah agar
//  bisa disimpan sebagai data URL kecil (ramah localStorage)
// ============================================================

// Baca File sebagai data URL base64
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

// Perkecil gambar (data URL) agar muat dalam `maxSize` px di sisi
// terpanjangnya dan enkode ulang sebagai JPEG supaya string tersimpan tetap kecil.
export function downscaleDataUrl(dataUrl, maxSize = 512, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Ubah file yang dipilih menjadi URL yang siap diunggah
export async function prepareImageFile(file, maxSize = 512, quality = 0.72) {
  const dataUrl = await readFileAsDataUrl(file);
  return downscaleDataUrl(dataUrl, maxSize, quality);
}

// Apakah string ini foto asli (URL atau data URL), bukan emoji?
export function isPhoto(value) {
  return typeof value === 'string' && (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://'));
}
