const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Built-in Body Parser with Payload Limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Secure Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secure-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

// Static Asset Serving
app.use(express.static(path.join(__dirname, 'public')));

// Auth Guard Middleware
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.status(401).redirect('/');
}

// UI Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Authentication Endpoints
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    return res.status(500).json({ 
      success: false, 
      message: '.env file me ADMIN_USER ya ADMIN_PASS missing hai.' 
    });
  }

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }

  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Logout error' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Safe Transporter Cache with Connection Pooling for High Speed
const transporterCache = new Map();
const MAX_CACHE_SIZE = 50;

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;

  if (!transporterCache.has(key)) {
    // Memory leak protection: Cache limit exceeds karne par old connections clear karta hai
    if (transporterCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = transporterCache.keys().next().value;
      const oldTransporter = transporterCache.get(oldestKey);
      if (oldTransporter && typeof oldTransporter.close === 'function') {
        oldTransporter.close();
      }
      transporterCache.delete(oldestKey);
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,          // Connection pooling keeps speed fast
      maxConnections: 5,   // Concurrent connections allowed
      maxMessages: 100
    });

    transporterCache.set(key, transporter);
  }

  return transporterCache.get(key);
}

// Email Dispatch Endpoint
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  // Basic recipient validation
  const recipient = to.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipient)) {
    return res.status(400).json({ success: false, message: 'Invalid recipient email' });
  }

  try {
    const transporter = getTransporter(gmailId, appPassword);

    const info = await transporter.sendMail({
      from: senderName ? `"${senderName.trim()}" <${gmailId.trim()}>` : `"${gmailId.trim()}" <${gmailId.trim()}>`,
      to: recipient,
      subject: subject || '',
      text: messageBody
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Send failure [${recipient}]:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer listening on port ${PORT}`));
