# 部署指南（HTTPS）

Web Crypto 需要**安全環境**：本機用 `http://localhost` 即可，但要分享給手機或他人，
遠端網址**必須是 HTTPS**。以下提供由易到正式的做法。

伺服器可用環境變數設定：

```bash
PORT=8787        # 監聽埠（預設 8787）
HOST=0.0.0.0     # 監聽介面（預設 0.0.0.0）
```

---

## 方案 A：Cloudflare Tunnel（最快，臨時分享）

一鍵（同時起伺服器 + 隧道，並印出網址）：
```bash
npm run share
```
（等同於 `node tools/share.js`；未安裝 `cloudflared` 時會提示安裝方式。）

手動兩個終端機：
```bash
# 終端機 1
node server/server.js
# 終端機 2（安裝 cloudflared 後）
cloudflared tunnel --url http://localhost:8787
```
取得 `https://xxxx.trycloudflare.com`，手機直接開。關掉即失效，適合臨時揪團。

---

## 方案 A2：GitHub + Render（免費雲端常駐，電腦不用開機）

程式碼放 GitHub，[Render](https://render.com) 免費方案幫你跑伺服器，得到永久固定網址。

1. 把本專案 push 到 GitHub（repo 內含 `render.yaml`，Render 會自動讀取設定）。
2. 到 <https://dashboard.render.com> 用 GitHub 帳號登入。
3. **New → Blueprint** → 選擇你的 repo → **Deploy**。
4. 完成後得到 `https://<名稱>.onrender.com`，直接分享即可（HTTPS、WebSocket 都原生支援）。

之後每次 `git push`，Render 會自動重新部署。

> 免費方案限制：閒置 15 分鐘會休眠，下次開啟需等約 1 分鐘喚醒（App 會自動重連）；每月 750 小時免費額度（單一服務整月夠用）。

---

## 方案 B：自有網域 + Caddy（正式、自動 HTTPS）

`Caddyfile`：
```
chat.example.com {
    reverse_proxy 127.0.0.1:8787
}
```
```bash
node server/server.js &
caddy run
```
Caddy 會自動申請並續期 Let's Encrypt 憑證，並正確轉發 WebSocket（`/ws`）。
本專案的伺服器已送出 HSTS 等安全標頭，走 HTTPS 後即生效。

---

## 方案 C：Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;
    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket 升級
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;                    # 長連線
    }
}
```

---

## 方案 D：以 systemd 常駐（Linux）

`/etc/systemd/system/securechat.service`：
```ini
[Unit]
Description=Secure Chat Relay
After=network.target

[Service]
WorkingDirectory=/opt/securechat
ExecStart=/usr/bin/node server/server.js
Environment=PORT=8787
Restart=always
User=securechat
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now securechat
```

---

## 方案 E：Docker

`Dockerfile`：
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
EXPOSE 8787
USER node
CMD ["node", "server/server.js"]
```
```bash
docker build -t securechat .
docker run -d -p 8787:8787 --name securechat securechat
```
再以方案 B/C 在前面套一層 HTTPS。

---

## Windows 常駐

- 直接執行：`node server\server.js`
- 開機自動：可用「工作排程器」建立登入時執行的工作，或用 `nssm` 註冊為 Windows 服務。
- 對外分享一律建議走方案 A（Cloudflare Tunnel）取得 HTTPS。

---

## 上線前檢查清單
- [ ] 以 HTTPS 開啟，網址列出現鎖頭，且能成功建立房間（代表 Web Crypto 生效）。
- [ ] 反向代理已正確轉發 `/ws`（WebSocket 能連上，狀態燈為綠）。
- [ ] 兩支裝置用同一連結能互收訊息；改動連結任一字元則收不到（金鑰不符）。
- [ ] 回應標頭含 `Content-Security-Policy`、`Strict-Transport-Security`、`X-Content-Type-Options`。
- [ ] 視需求調整伺服器 `MAX_MESSAGE` 與 rate limit。
- [ ] 若面向公眾，考慮加上房間人數上限或存取控管（本版為開放式連結分享）。
