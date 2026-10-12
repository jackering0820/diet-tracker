// 照片縮圖：長邊縮到 MAX_SIDE 像素、轉成 JPEG 的 data URL。
// 縮小後才保存和送出：省手機空間，也降低 AI 分析的費用。
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.8;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("這張照片無法讀取，請換一張"));
    };
    img.src = url;
  });
}

export async function resizePhoto(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function resizePhotos(files) {
  return Promise.all([...files].map(resizePhoto));
}
