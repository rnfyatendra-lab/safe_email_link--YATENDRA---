const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser configuration
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 1000 * 60 * 60 * 8 // 8 Hours
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Login Middleware
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// Page Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Authentication Routes
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
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Transporter Cache: Keeps connection alive for high speed
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,          // Connection pooling for fast delivery
      maxConnections: 5,   // Parallel connection pool
      maxMessages: 100
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

// Direct Inbox Email Sending Endpoint
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const recipient = to.trim();

  try {
    const transporter = getTransporter(gmailId, appPassword);

    // Exact text format without bulk headers = Natural Inbox Delivery
    const mailOptions = {
      from: senderName ? `"${senderName.trim()}" <${gmailId.trim()}>` : `"${gmailId.trim()}" <${gmailId.trim()}>`,
      to: recipient,
      subject: subject || '',
      text: messageBody
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error [${recipient}]:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Mailer active on http://localhost:${PORT}`));
