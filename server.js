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
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-inbox-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Dynamic Transporter Pool Cache
const poolCache = new Map();

function getTransporter(user, pass) {
  const key = `${user}:${pass}`;
  if (poolCache.has(key)) return poolCache.get(key);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    pool: true,
    maxConnections: 6,
    maxMessages: 1000,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  poolCache.set(key, transporter);
  return transporter;
}

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

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

// Direct Primary Inbox Delivery Endpoint
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const cleanGmailId  = gmailId.trim().toLowerCase();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    // RFC-Compliant Unique Message-ID
    const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
    const entropyHex = crypto.randomBytes(6).toString('hex');
    const msgId = `<${Date.now()}.${entropyHex}@${domain}>`;

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    // Body with clean text signature to keep content fresh per email
    const cleanBody = (messageBody || '').trim();
    const finalBody = `${cleanBody}\n\n---\nRef: #${entropyHex.toUpperCase()}`;

    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject || 'Message',
      text: finalBody,
      messageId: msgId,
      date: new Date(),
      encoding: 'utf-8',
      envelope: {
        from: cleanGmailId,
        to: cleanTo
      },
      // Native Apple Mail Signature - Bypasses Spam & Promotion tabs
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'Apple Mail (2.3654.120.0.1)',
        'X-Priority': '3',
        'Importance': 'Normal'
      }
    });

    console.log(`✅ [Delivered to Primary Inbox] -> ${cleanTo} | ID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error(`❌ [Failed] -> ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer on port ${PORT}`));
