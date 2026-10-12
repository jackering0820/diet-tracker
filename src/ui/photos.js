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

async function resizePhoto(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  // 立刻釋放 canvas 的記憶體：iPhone Safari 的 canvas 記憶體上限很低。
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

// 一張一張處理，不要同時解碼好幾張原始解析度的照片（iPhone 會記憶體不足）。
export async function resizePhotos(files) {
  const photos = [];
  for (const file of files) photos.push(await resizePhoto(file));
  return photos;
}
