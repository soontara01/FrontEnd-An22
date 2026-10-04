/**
 * Reads an image file and returns a JPEG data URL scaled to fit `maxSize`×`maxSize`.
 * Keeps stored thumbnails small (tens of KB) — important while data lives in localStorage.
 */
export function resizeImage(file: File, maxSize = 400, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('ไฟล์ต้องเป็นรูปภาพ'));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('ย่อรูปไม่สำเร็จ'));
        return;
      }
      // White background so transparent PNGs don't turn black as JPEG.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านไฟล์รูปไม่ได้'));
    };
    img.src = url;
  });
}
