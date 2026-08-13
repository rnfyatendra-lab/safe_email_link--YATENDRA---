const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Authentication Guard
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
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
  const validUser = process.env.ADMIN_USER || '@#@#@';
  const validPass = process.env.ADMIN_PASS || '@#@#@';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Sleep Helper for Controlled Speed
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Transporter Cache with Connection Pooling
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,          // Active connection pooling
      maxConnections: 3,   // Balanced connections to prevent rate-limit flags
      maxMessages: 100
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

// Optimized Direct Inbox Email API
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const recipient = to.trim();

  try {
    // 10% Speed Reduction: 150ms - 250ms micro-jitter delay per email for natural human cadence
    const microDelay = Math.floor(Math.random() * 100) + 150;
    await sleep(microDelay);

    const transporter = getTransporter(gmailId, appPassword);

    // Clean Plain Text configuration for Primary Inbox landing
    await transporter.sendMail({
      from: senderName ? `"${senderName.trim()}" <${gmailId.trim()}>` : `"${gmailId.trim()}" <${gmailId.trim()}>`,
      to: recipient,
      subject: subject || '',
      text: messageBody
    });

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Send Error (${recipient}):`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer listening on port ${PORT}`));
