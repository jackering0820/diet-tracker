# 飲食紀錄（diet-tracker）

只給自己用的飲食控制 PWA：拍照估算營養、記錄喝水、每天看有沒有達標。資料只存在手機裡。

規格書：[#1](https://github.com/jackering0820/diet-tracker/issues/1)

## 需要的工具

- [Node.js](https://nodejs.org/) 22 以上（不需要安裝任何套件，沒有 `npm install` 這一步）

## 執行測試

```bash
npm test
```

測試只透過「日記核心」的公開操作進行，使用記憶體版資料儲存和固定時間，不需要瀏覽器，也不會呼叫任何外部 API。

## 在本機開啟 App

```bash
npm start
```

然後用瀏覽器打開 <http://localhost:8787>。IndexedDB 和 service worker 需要透過網頁伺服器才能運作，直接雙擊 `index.html` 打不開。

## 架構

```
畫面層（src/ui）          只處理畫面，不寫自動測試
   ↓
日記核心（src/core）      所有業務規則，唯一的測試 seam
   ↓
轉接器（src/adapters）    資料儲存：IndexedDB 版（正式）／記憶體版（測試）
```

日記核心不直接建立資料儲存或取得時間，而是由外部注入（dependency injection），所以測試可以換成記憶體版和固定時間。
