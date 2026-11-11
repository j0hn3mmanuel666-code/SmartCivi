/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import path from "path";
import { randomBytes } from "node:crypto";
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { sequelize } from "./models/db.js";
import platformRouter from './routes/platform.js';
import { DatabaseSessionStore, platformSecurity } from './middleware/platformSecurity.js';
import { paymentComplete } from './services/platformRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.use(session({
  secret: sessionSecret,
  store: new DatabaseSessionStore(),
  name: 'smartcivi.sid',
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 30 * 60 * 1000 },
  resave: false,
  saveUninitialized: false
}));
app.use(flash());
app.use(platformSecurity);

app.engine("xian", async (filePath, options, callback) => {
  try {
     const originalPartialsDir = hbs.partialsDir;
    hbs.partialsDir = path.join(__dirname, 'views');

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    hbs.partialsDir = originalPartialsDir;
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  // expose user to templates
  res.locals.user = req.session && req.session.user ? req.session.user : null;
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
const partialsDir = path.join(__dirname, "views/partials");
for (const file of fs.readdirSync(partialsDir).filter(file => file.endsWith('.xian'))) {
  hbs.registerPartial(file.replace('.xian', ''), fs.readFileSync(path.join(partialsDir, file), 'utf8'));
}
hbs.registerHelper('ifEq', function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});
hbs.registerHelper('ifPaid', function(request, options) { return paymentComplete(request) ? options.fn(this) : options.inverse(this); });

app.get('/api/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', service: 'smartcivi', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use('/', platformRouter);
app.use("/", router);
app.use((error, req, res, _next) => {
  console.error('Request failed:', error);
  res.status(error.status || 500).send('The request could not be completed. Reload the page and try again.');
});

export default app;

if (!process.env.ELECTRON) {
  // Attach global error handlers to surface startup/runtime errors in the console
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
    process.exit(1);
  });

  // Start server with retry logic for EADDRINUSE (helps when port is already occupied by another process)
  const startServer = (port, attemptsLeft = 5) => {
    const server = app.listen(port, () => console.log(`🔥 XianFire running at http://localhost:${port}`));

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${port} is already in use.`);
        if (attemptsLeft > 0) {
          const nextPort = Number(port) + 1;
          console.log(`➡️ Trying port ${nextPort} (${attemptsLeft - 1} attempts left)...`);
          // small delay before retrying to avoid tight loop
          setTimeout(() => startServer(nextPort, attemptsLeft - 1), 250);
          return;
        }
        console.error('❌ All retry attempts exhausted. Please stop the process using the port or set a different PORT environment variable.');
        process.exit(1);
      }
      console.error('Server error:', err);
      process.exit(1);
    });
  };

  startServer(PORT);
}
