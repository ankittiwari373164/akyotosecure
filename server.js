// Entry file for Hostinger / Passenger / PM2 / `npm start`.
// CommonJS wrapper so it works with any Node.js app runner; the app itself is ES modules in src/.
import('./src/server.mjs').catch((err) => { console.error('Failed to start AKYOTO store:', err); process.exit(1); });
