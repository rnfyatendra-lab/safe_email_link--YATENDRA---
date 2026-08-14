const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
const crypto     = require('crypto');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-secure-inbox-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 1000 * 60 * 60 * 24 
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Transporter Cache - Reuses warm TLS sockets for zero-delay delivery & high inbox reputation
const transportCache = new Map();

function getTransporter(user, pass) {
  const cacheKey = `${user}:${pass}`;
  if (transportCache.has(cacheKey)) {
    return transportCache.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    pool: true,   // Persistent socket connections
    maxConnections: 6,
    maxMessages: 500,
    rateLimit: 15, // Smooth throughput
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    }
  });

  transportCache.set(cacheKey, transporter);
  return transporter;
}

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'admin123';
  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Direct Primary Inbox Delivery Engine
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing required credentials' });
  }

  const cleanGmailId  = gmailId.trim().toLowerCase();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    // RFC-5322 Standard Message-ID Generator
    const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
    const entropy = crypto.randomBytes(7).toString('hex');
    const customMessageId = `<${Date.now()}.${entropy}@${domain}>`;

    const fromHeader = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    // Direct Dispatch with High-Deliverability Headers
    const info = await transporter.sendMail({
      from: fromHeader,
      to: cleanTo,
      subject: subject || '',
      text: messageBody || '',
      messageId: customMessageId,
      date: new Date(),
      encoding: 'utf-8',
      envelope: {
        from: cleanGmailId,
        to: cleanTo
      },
      // Native Mobile Client Fingerprint (Bypasses bot/bulk detection filters)
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'iPhone Mail (21E236)',
        'X-Priority': '3',
        'Importance': 'Normal',
        'Content-Transfer-Encoding': '8bit'
      }
    });

    console.log(`🎯 [Primary Inbox Dispatched] -> ${cleanTo} | ID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error(`❌ [Failed to Deliver] -> ${cleanTo}:`, err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'SMTP Transmission failed' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Fast Mailer Ultra-Inbox Engine listening on port ${PORT}`);
});
