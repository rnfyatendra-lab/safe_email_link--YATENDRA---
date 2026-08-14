const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Built-in Express Middlewares (body-parser ki zaroorat nahi hai)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 2. Session Management
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mailer-secure-session-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Production mein HTTPS ke liye true
      maxAge: 1000 * 60 * 60 * 8 // 8 Hours
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// 3. Transporter Socket Pool (Clean Connection Management)
const transporterPool = new Map();

function getTransporter(user, pass) {
  const cleanUser = user.trim().toLowerCase();
  const cleanPass = pass.replace(/\s+/g, '');
  const cacheKey = `${cleanUser}:${cleanPass}`;

  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey);
  }

  // Standard Gmail SMTP Configuration
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 3, // Safe connection limit
    maxMessages: 100,
    auth: {
      user: cleanUser,
      pass: cleanPass
    }
  });

  transporterPool.set(cacheKey, transporter);
  return transporter;
}

// 4. Authentication Guard Middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.redirect('/');
}

/* ==========================================================================
   ROUTES
   ========================================================================== */

// Page Routes
app.get('/', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.redirect('/launcher');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Login API
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || '##';
  const validPass = process.env.ADMIN_PASS || '##';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Invalid username or password' });
});

// Logout API
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Send Email API
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  // Basic Validation
  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const cleanSender = gmailId.trim().toLowerCase();
  const cleanTo = to.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanSender, appPassword);

    const fromAddress = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanSender}>`
      : cleanSender;

    // Standard RFC-compliant Mail Object (Bina fake headers ke)
    const mailOptions = {
      from: fromAddress,
      to: cleanTo,
      subject: subject || 'No Subject',
      text: messageBody.trim()
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Mail dispatched successfully to ${cleanTo} | ID: ${info.messageId}`);
    return res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`🚀 Server active on http://localhost:${PORT}`);
});
