const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Cloud reverse proxy support (Render/HTTPS session fix)
app.set('trust proxy', 1);

// Base64 images payload support
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

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

// SMTP Connection Pool Cache
const transporterPool = new Map();

function getTransporter(user, pass) {
  const cacheKey = `${user}:${pass}`;
  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 6,
    maxMessages: 200,
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

// Authentication Routes
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
  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Email Dispatcher (Inline CID PNG Delivery)
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, htmlBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !htmlBody) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    let processedHtml = htmlBody;
    const attachments = [];
    const base64Regex = /<img[^>]+src="data:image\/([a-zA-Z]*);base64,([^"]+)"([^>]*)>/g;
    let match;
    let imgIndex = 0;

    // Convert pasted Base64 images to inline CID attachments
    while ((match = base64Regex.exec(htmlBody)) !== null) {
      const ext = match[1] || 'png';
      const base64Data = match[2];
      const cidName = `inline_img_${Date.now()}_${imgIndex++}`;

      attachments.push({
        filename: `${cidName}.${ext}`,
        content: Buffer.from(base64Data, 'base64'),
        cid: cidName
      });

      processedHtml = processedHtml.replace(
        match[0],
        `<img src="cid:${cidName}" width="10" height="10" style="width:10px!important;height:10px!important;display:inline-block;border:none;" />`
      );
    }

    const mailOptions = {
      from: fromFormatted,
      to: cleanTo,
      subject: subject ? subject.trim() : '',
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">${processedHtml}</div>`,
      attachments: attachments
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
