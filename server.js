const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Cloud / Reverse Proxy Support (Render/HTTPS session fix)
app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Persistent Transporter Pool (Low Concurrency = High Trust)
const transporterPool = new Map();

function getTransporter(user, pass) {
  const cacheKey = `${user}:${pass}`;
  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 2, // Natural, non-aggressive socket limit
    maxMessages: 100,
    auth: { user, pass }
  });

  transporterPool.set(cacheKey, transporter);
  return transporter;
}

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/');
}

// UI Routes
app.get('/', (req, res) => {
  if (req.session && req.session.loggedIn) return res.redirect('/launcher');
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
    return req.session.save((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Session storage error' });
      res.json({ success: true });
    });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Standard RFC-Compliant Mail Dispatcher
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim();

  try {
    // 300ms - 600ms micro-jitter for unique human arrival stamps
    const microDelay = Math.floor(Math.random() * 300) + 300;
    await sleep(microDelay);

    const transporter = getTransporter(cleanGmailId, cleanPassword);

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    // Direct plain text: No custom headers so Google signs authentic DKIM
    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject ? subject.trim() : '',
      text: messageBody.trim()
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
