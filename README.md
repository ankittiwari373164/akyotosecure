# AKYOTO Secure — Online Store

A complete e-commerce website for **Akyoto Secure** (akyotosecure.com): an animated multi-page storefront, an admin panel for products / orders / coupons, and **Razorpay** payments with server-side verification.

Pure JavaScript (Node.js 18+). **No native modules and no build step**, so it runs on Hostinger shared Node.js hosting, any VPS, Render or Railway.

Live demo: https://akyoto.sites.tab.bot/ · Admin: https://akyoto.sites.tab.bot/admin/

---

## 1. What's inside

**Storefront** (`public/`)
- Home: animated hero (siren / radar motif), trust badges, categories, bestsellers, an interactive "How it works" (sensor → siren → phone alert) with a break-in simulation, a comparison table and the Patrol Management section.
- Shop: category and brand filters, price range, on-sale and in-stock filters, live search, 6 sort options, URL-synced filters and a mobile filter drawer.
- Product page: image gallery with zoom and swipe, a variant picker (for example the siren dB options), quantity, Buy now, PIN-code delivery estimate, description, specs, customer reviews (moderated) and related products.
- Cart with a free-shipping progress bar and coupon field. Checkout with validation, coupon, Razorpay or Cash on Delivery.
- Order success page and **order tracking** by order ID + mobile number.
- **Kit builder** (pick a panel + sensors, with a live protection score and a house map), a **protection quiz** that recommends a kit, and a **compare** page.
- About, Contact (the form saves to Admin → Enquiries), FAQ, and Shipping, Returns, Privacy and Terms pages.
- A WhatsApp button on every page, scroll animations, parallax and micro-interactions. Mobile-first.

**Admin panel** (`/admin/`)
- Dashboard: revenue, orders, average order value, a 14-day sales chart, orders by status, recent orders, top products and low stock.
- Products: add, edit and delete, image upload (resized automatically), price, MRP, stock, active and featured toggles, specs editor, variants. Price and stock can be edited inline.
- Orders: search and filters (status, payment, method, date), detail view, status updates (pending / paid / shipped / delivered / cancelled), payment status, courier tracking number, notes shown to the customer, a WhatsApp-the-customer button, print and CSV export.
- Coupons: percent or flat, minimum order, max discount, expiry date, usage limit and an active toggle. **Enforced on the server** at checkout.
- Reviews (approve or hide), Enquiries, and Settings (Razorpay keys, shipping fee, COD, store details, admin password).

**Backend** (`src/`)
- `server.js` is the entry file. `src/app.mjs` holds all the API routes, `src/db.mjs` is the database layer, `src/schema.mjs` the tables.
- Database: **MySQL** when `DB_HOST`/`DB_NAME` are set, otherwise a built-in SQLite file (`data/akyoto.sqlite`). Tables are created and products seeded **automatically on first start**.
- Prices, stock and coupons are always recalculated on the server. The browser can't change what a customer pays.

---

## 2. Admin login

Default (created on first start): **admin@akyotosecure.com / Akyoto@Admin2026**

➡️ **Change it right away** in Admin → Settings → Admin login. You can also set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before the first start. Forgot it? Run `ADMIN_PASSWORD='NewPass123' npm run reset-admin` in the app folder.

---

## 3. Deploy on Hostinger (hPanel → Node.js app)

### Step 1: Create the MySQL database
1. hPanel → **Databases → MySQL Databases**.
2. Create a database and a user (for example `u123456789_akyoto`) with a strong password. Note the **database name, user, password and host**. The host is usually `localhost`; Hostinger shows it on that page.
3. (Optional) Open **phpMyAdmin**, select the database, choose **Import** and upload `schema.sql`. You can skip this, because the app creates the tables itself on first start.

### Step 2: Create the Node.js app
1. hPanel → **Websites → Add website → Node.js Apps** (or open your site → **Node.js**).
2. Choose **Upload your website files** and upload `akyoto_store.zip`. If the panel asks for a folder, upload the ZIP's contents to the app's root folder.
3. Build settings:
   - **Framework / preset:** Express (or "Other")
   - **Node.js version:** 20.x or 22.x
   - **Entry file / Application startup file:** `server.js`
   - **Install command:** `npm install`  ·  **Build command:** *(leave empty)*  ·  **Start command:** `npm start`
   - **Root directory:** the folder containing `package.json`

### Step 3: Environment variables
Add these in the app's **Environment variables** section. `.env.example` lists them all.

| Name | Value |
|---|---|
| `DB_HOST` | `localhost` (or the host shown by Hostinger) |
| `DB_NAME` / `DB_USER` / `DB_PASS` | from Step 1 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your admin login (used on first start) |
| `SESSION_SECRET` | any long random text |
| `SITE_URL` | `https://akyotosecure.com` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | from Razorpay (see section 4) |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you set on the Razorpay webhook |
| `DEMO_PAYMENTS` | `false` on the real store |

(If the panel has no environment-variable section, copy `.env.example` to `.env` in the app folder with File Manager and fill it in.)

### Step 4: Deploy and check
1. Click **Deploy** (or **Restart**). `npm install` runs automatically.
2. Open your domain. The store should load with all products.
3. Open `https://yourdomain/admin/`, log in, and **change the password**.
4. Point the domain: in hPanel attach `akyotosecure.com` to this Node.js app (and switch off the old WordPress site, or put the store on a subdomain such as `shop.akyotosecure.com` first to test).

> **Uploaded product images** are saved in the `uploads/` folder. **Download a backup of `uploads/`** before re-uploading a new version of the ZIP. With MySQL, all products, orders and coupons are in the database and are not affected by redeploys.

---

## 4. Razorpay setup

1. Log in to **dashboard.razorpay.com** → **Account & Settings → API Keys → Generate key** (in **Test mode** first).
2. Put the Key ID and Key Secret in `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` and restart the app. You can also paste them in **Admin → Settings → Payments**, which takes effect immediately; environment variables take priority over the admin fields.
3. The admin header shows **RAZORPAY TEST**. Place an order on the site using Razorpay's test cards or UPI `success@razorpay`. The order turns **paid** in Admin → Orders.
4. **Webhook** (recommended; it catches payments if the customer closes the browser): Razorpay → **Account & Settings → Webhooks → Add new webhook**
   - URL: `https://akyotosecure.com/api/payments/webhook`
   - Secret: any string. Put the same value in `RAZORPAY_WEBHOOK_SECRET`.
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`
5. **Go live:** complete Razorpay KYC/activation, switch the dashboard to **Live mode**, generate live keys (`rzp_live_…`), replace the two keys, set `DEMO_PAYMENTS=false`, and create the webhook again in Live mode.

How payments work: the server creates a Razorpay order for the exact server-calculated amount, then Razorpay Checkout opens in the browser. After payment, the server **verifies the HMAC signature** with your key secret before marking the order paid. Stock and coupon usage are committed only then. Without keys and with `DEMO_PAYMENTS=true`, checkout shows a clearly labelled **DEMO** payment window and no money moves. Demo payments are refused automatically as soon as real keys are set.

---

## 5. Other hosting

**Any VPS (Ubuntu) with PM2 + nginx**
```bash
# Node 20+:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
unzip akyoto_store.zip -d /var/www/akyoto && cd /var/www/akyoto
cp .env.example .env && nano .env        # fill in DB + Razorpay + admin
npm install --omit=dev
sudo npm i -g pm2 && pm2 start server.js --name akyoto && pm2 save && pm2 startup
```
nginx site:
```nginx
server {
  server_name akyotosecure.com www.akyotosecure.com;
  client_max_body_size 10m;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
}
```
Then run `sudo certbot --nginx -d akyotosecure.com -d www.akyotosecure.com` for HTTPS.

**Render / Railway:** create a Web Service from the code. Build command `npm install`, start command `npm start`. Add the environment variables and a MySQL database (or a persistent disk mounted at `data/` and `uploads/` if you use the built-in SQLite).

**Local test:** `npm install && npm start` → http://localhost:3000. It uses the built-in SQLite file, so no database setup is needed.

---

## 6. Customising

- **Products, prices, stock, coupons, shipping fee, COD:** all from the admin panel.
- **Store phone / WhatsApp / email / address:** Admin → Settings (the footer and contact page text are in `public/*.html`).
- **Colours and fonts:** the variables at the top of `public/assets/style.css`.
- **Initial product catalogue:** `seed/products.json` (only used when the products table is empty).

## 7. Data notes
- The 63 products, prices, MRPs, specs, photos, policies, About text and contact details were taken from the current akyotosecure.com. A few obvious typos in product names were fixed (for example "Buglar" → "Burglar").
- **Sample values, please confirm:** stock is set to 25 for every product; shipping is ₹99 below ₹999 and free above; the coupons WELCOME10, SECURE500 and FESTIVE15 are examples. Edit all of these in the admin.
- Boom barriers have no price on the current site, so they show "Price on request" with a WhatsApp quote button.
