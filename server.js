const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parser Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Secure Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-secure-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 12 // 12 Hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Login Middleware Guard
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// Routes Setup
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
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Precise Delay Helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// SMTP Connection Pool Cache
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,            // Reuses SMTP socket connections
      maxConnections: 4,     // Optimal concurrent channels
      maxMessages: 150,      // Max messages per socket connection
      rateDelta: 1000,
      rateLimit: 5           // Safe threshold for Gmail AI filters
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

// Optimized Primary Inbox Dispatcher
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const recipient = to.trim();
  const cleanGmail = gmailId.trim();

  try {
    // Dynamic Micro-Jitter (150ms - 300ms) for natural human-like sending rhythm
    const jitter = Math.floor(Math.random() * 150) + 150;
    await sleep(jitter);

    const transporter = getTransporter(cleanGmail, appPassword);

    const fromHeader = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmail}>`
      : cleanGmail;

    // Direct Plain Text Delivery (No HTML wrappers or tracking headers = 100% Primary Inbox)
    const info = await transporter.sendMail({
      from: fromAddress = fromHeader,
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

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on http://localhost:${PORT}`));
