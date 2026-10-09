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
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.use(session({
  secret: "xianfire-secret-key",
  resave: false,
  saveUninitialized: false
}));
app.use(flash());
app.use((req, res, next) => {
  res.setHeader("X-Powered-By", "XianFire Framework");
  next();
});
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
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");

// Register Handlebars helpers
hbs.registerHelper('eq', function(a, b, options) {
  if (!options || !options.fn) {
    return a === b;
  }
  return a === b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('dateFormat', function(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
});

hbs.registerHelper('substr', function(str, start, length) {
  if (!str) return '';
  return str.substring(parseInt(start), parseInt(start) + parseInt(length));
});

hbs.registerHelper('gt', function(a, b, options) {
  if (!options || !options.fn) {
    return a > b;
  }
  return a > b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('lt', function(a, b, options) {
  if (!options || !options.fn) {
    return a < b;
  }
  return a < b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('gte', function(a, b, options) {
  if (!options || !options.fn) {
    return a >= b;
  }
  return a >= b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('lte', function(a, b, options) {
  if (!options || !options.fn) {
    return a <= b;
  }
  return a <= b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('add', function(a, b) {
  return parseInt(a) + parseInt(b);
});

hbs.registerHelper('subtract', function(a, b) {
  return parseInt(a) - parseInt(b);
});

hbs.registerHelper('range', function(start, end) {
  const result = [];
  for (let i = start; i < end; i++) {
    result.push(i);
  }
  return result;
});

hbs.registerHelper('dateTimeFormat', function(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
});

hbs.registerHelper('actionColor', function(action) {
  const colors = {
    'LOGIN': 'bg-blue-100 text-blue-800',
    'LOGOUT': 'bg-gray-100 text-gray-800',
    'USER_CREATED': 'bg-green-100 text-green-800',
    'USER_UPDATED': 'bg-yellow-100 text-yellow-800',
    'USER_ACTIVATED': 'bg-green-100 text-green-800',
    'USER_DEACTIVATED': 'bg-red-100 text-red-800',
    'ROLE_ASSIGNED': 'bg-purple-100 text-purple-800',
    'PASSWORD_RESET': 'bg-orange-100 text-orange-800',
    'PASSWORD_CHANGED': 'bg-orange-100 text-orange-800',
    'LOGIN_FAILED': 'bg-red-100 text-red-800',
    'PROFILE_UPDATED': 'bg-blue-100 text-blue-800'
  };
  return colors[action] || 'bg-gray-100 text-gray-800';
});

const partialsDir = path.join(__dirname, "views/partials");
fs.readdir(partialsDir, (err, files) => {
  if (err) {
    console.error("❌ Could not read partials directory:", err);
    return;
  }

   files
    .filter(file => file.endsWith('.xian'))
    .forEach(file => {
      const partialName = file.replace('.xian', ''); 
      const fullPath = path.join(partialsDir, file);

      fs.readFile(fullPath, 'utf8', (err, content) => {
        if (err) {
          console.error(`❌ Failed to read partial: ${file}`, err);
          return;
        }
        hbs.registerPartial(partialName, content);
        
      });
    });
});

app.use("/", router);

export default app;

if (!process.env.ELECTRON) {
  app.listen(PORT, () => console.log(`🔥 XianFire running at http://localhost:${PORT}`));
}
