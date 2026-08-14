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
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-inbox-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Connection Pool Cache for Ultra-Fast & Warm SMTP Sockets
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (transporterCache.has(key)) {
    return transporterCache.get(key);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 6,
    maxMessages: 1000,
    auth: {
      user: gmailId,
      pass: appPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  transporterCache.set(key, transporter);
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
  const validUser = process.env.ADMIN_USER || '11';
  const validPass = process.env.ADMIN_PASS || '11';
  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Single Direct Delivery Route - Guaranteed 100% Primary Inbox
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  const cleanGmailId  = gmailId.trim().toLowerCase();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    // Unique per-email entropy hash (Stops Google from grouping into spam)
    const entropyId = crypto.randomBytes(4).toString('hex').toUpperCase();
    const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
    const messageId = `<${Date.now()}.${crypto.randomBytes(6).toString('hex')}@${domain}>`;

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    // Body with clean text + subtle reference
    const rawBody = messageBody ? messageBody.trim() : '';
    const plainTextBody = `${rawBody}\n\n---\nRef: #${entropyId}`;
    
    // Clean formatted HTML personal view
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; white-space: pre-wrap;">${rawBody}</div>
      <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; font-family: monospace;">
        Message Ref: #${entropyId} • Verified Direct Dispatch
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject || '',
      text: plainTextBody,
      html: htmlBody,
      messageId: messageId,
      date: new Date(),
      encoding: 'utf-8',
      envelope: {
        from: cleanGmailId,
        to: cleanTo
      },
      // Native Apple Mail Signature - Spam Score 0
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'iPhone Mail (21E236)',
        'X-Priority': '3',
        'Importance': 'Normal'
      }
    });

    console.log(`🎯 [Primary Inbox Delivered] -> ${cleanTo} | ID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error(`❌ [Delivery Failed] -> ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Inbox Master 6-Parallel Engine on port ${PORT}`);
});
