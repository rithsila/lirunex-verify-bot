# Proxmox LXC Deployment Guide — Lirunex Verify Bot

Step-by-step setup to host `lirunex-verify-bot` on a Proxmox LXC container (Ubuntu/Debian) from scratch.

---

## 1. Proxmox Container Requirements

- **OS Template:** Ubuntu 22.04 / 24.04 or Debian 12
- **Memory (RAM):** 1024 MB (1 GB)
- **CPU:** 1 or 2 vCPUs
- **Disk:** 8 GB or more
- **Nesting:** Enabled (in Proxmox LXC Options -> Features -> Nesting: tick YES)

---

## 2. Install Node.js, Git, and PM2

Open your LXC root console and run:

```bash
# Update packages
apt update && apt upgrade -y
apt install -y curl git build-essential

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 process manager
npm install -g pm2
```

---

## 3. Clone Repository & Install Dependencies

```bash
# Clone repo to /opt
git clone https://github.com/rithsila/lirunex-verify-bot.git /opt/lirunex-verify-bot
cd /opt/lirunex-verify-bot

# Install npm dependencies
npm install

# Install Playwright browser and system OS libraries
npx playwright install --with-deps chromium
```

---

## 4. Configure Environment Variables

Create the `.env` file:

```bash
nano /opt/lirunex-verify-bot/.env
```

Paste your configuration template and fill in your values:

```env
PORT=3000
LIRUNEX_PORTAL_URL=https://client.lirunex.online
LIRUNEX_LOGIN_EMAIL=<your-lirunex-login-email>
LIRUNEX_LOGIN_PASSWORD=<your-lirunex-login-password>
LIRUNEX_REFERRER_NAME=<your-expected-referrer-name>
SESSION_ENCRYPTION_KEY=<your-64-hex-char-aes-key>
LIRUNEX_BOT_HMAC_SECRET=<your-64-hex-char-hmac-secret>
```

Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit nano.

---

## 5. Start Service with PM2

```bash
cd /opt/lirunex-verify-bot
pm2 start src/server.js --name lirunex-verify-bot
pm2 startup
pm2 save
```

### Health check:

```bash
curl http://localhost:3000/health
# Expected output: {"ok":true}
```

---

## 6. Expose to Internet via Cloudflare Tunnel (HTTPS)

Supabase Edge Functions need a public HTTPS endpoint to talk to your LXC container.

### Option A: Quick Free Cloudflare Tunnel (for testing)

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
pm2 start "cloudflared tunnel --url http://localhost:3000" --name cloudflare-tunnel
pm2 save
```

Get the URL:
```bash
grep -o 'https://.*\.trycloudflare\.com' /root/.pm2/logs/cloudflare-tunnel-error.log | tail -n 1
```

### Option B: Cloudflare Zero Trust Named Tunnel (Recommended for 24/7 Production)

1. Go to Cloudflare Zero Trust Dashboard -> **Networks** -> **Tunnels**.
2. Click **Create a Tunnel** -> select `Cloudflared`.
3. Copy the run command on your LXC (installs cloudflared as a systemd service).
4. Add a Public Hostname (e.g. `lirunex-bot.yourdomain.com`) routing to `http://localhost:3000`.

---

## 7. Connect to Supabase

Update your Supabase Edge Function secrets with your public tunnel URL:

```bash
supabase secrets set LIRUNEX_BOT_URL="https://lirunex-bot.yourdomain.com"
```

---

## 8. Useful Maintenance Commands

```bash
# View live logs
pm2 logs lirunex-verify-bot

# Restart bot
pm2 restart lirunex-verify-bot

# Check bot status
pm2 status
```
