/**
 * Canvas API로 이미지를 리사이즈 + JPEG 압축 후 data URL로 반환.
 * 413 에러 방지를 위해 업로드 전 항상 호출.
 */
export function compressImage(
  file: File,
  maxPx = 1200,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // 긴 변이 maxPx를 초과하면 비율 유지하며 축소
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height / width) * maxPx);
          width = maxPx;
        } else {
          width = Math.round((width / height) * maxPx);
          height = maxPx;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 컨텍스트를 생성할 수 없습니다.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 로드할 수 없습니다.'));
    };

    img.src = objectUrl;
  });
}
