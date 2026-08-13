const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render / Cloud Hosting Reverse Proxy Trust (Required for HTTPS session cookies)
app.set('trust proxy', 1);

// Body Parser Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Production Ready Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-secure-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12 // 12 Hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Authentication Guard
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  res.redirect('/');
}

// UI Routes
app.get('/', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.redirect('/launcher');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Login Endpoint (Fixed Session Race Condition)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || '@#@#@';
  const validPass = process.env.ADMIN_PASS || '@#@#@';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    
    // Force session write to memory before returning JSON to frontend
    return req.session.save((err) => {
      if (err) {
        console.error('Session Save Error:', err);
        return res.status(500).json({ success: false, message: 'Session storage error' });
      }
      return res.json({ success: true });
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

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Transporter Cache
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 3
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

// Direct Inbox Optimized Email Endpoint
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const recipient = to.trim();
  const cleanGmail = gmailId.trim();

  try {
    const microDelay = Math.floor(Math.random() * 200) + 250;
    await sleep(microDelay);

    const transporter = getTransporter(cleanGmail, appPassword);

    const fromHeader = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmail}>`
      : cleanGmail;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: recipient,
      subject: subject ? subject.trim() : '',
      text: messageBody
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error for ${recipient}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
