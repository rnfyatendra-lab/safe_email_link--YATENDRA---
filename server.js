const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-secure-2026',
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

// Persistent Verified SMTP Socket Pool
const transporterPool = new Map();

function getVerifiedTransporter(user, pass) {
  const cacheKey = `${user}:${pass}`;
  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey);
  }

  // Pure Direct SSL Port 465 with Native Google DKIM Signing
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    }
  });

  transporterPool.set(cacheKey, transporter);
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
  const validUser = process.env.ADMIN_USER || 'rrrr';
  const validPass = process.env.ADMIN_PASS || 'rrrr';
  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return req.session.save((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Session error' });
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

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// 1. Google SMTP Pre-Flight Verification Handshake
app.post('/api/verify-smtp', requireLogin, async (req, res) => {
  const { gmailId, appPassword } = req.body;
  if (!gmailId || !appPassword) {
    return res.status(400).json({ success: false, message: 'Gmail ID and App Password required' });
  }

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');

  try {
    const transporter = getVerifiedTransporter(cleanGmailId, cleanPassword);
    await transporter.verify();
    res.json({ success: true, message: 'Google SMTP Handshake Authenticated' });
  } catch (err) {
    console.error('❌ SMTP Verification Failed:', err.message);
    res.status(401).json({ success: false, message: 'SMTP Auth Failed: ' + err.message });
  }
});

// Fixed Universal Avast Antivirus Footer
const avastFooterText = 'Virus-free.www.avast.com';
const avastFooterHtml = `<div style="margin-top:24px;padding-top:10px;font-size:12px;color:#718096;border-top:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="color:#00b0ff;font-weight:bold;margin-right:4px;">&#10003;</span>Virus-free.<a href="https://www.avast.com" style="color:#718096;text-decoration:none;" target="_blank">www.avast.com</a>
</div>`;

// 2. Pure Inbox RFC Multipart Delivery
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, htmlBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !htmlBody) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim();

  try {
    // Human arrival variance micro-delay
    const microDelay = Math.floor(Math.random() * 200) + 300;
    await sleep(microDelay);

    const transporter = getVerifiedTransporter(cleanGmailId, cleanPassword);

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    const plainFallback = `${htmlToPlainText(htmlBody)}\n\n---\n${avastFooterText}`;

    const styledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.65;font-size:15px;">
<div style="padding:2px 0;word-break:break-word;">
${htmlBody}
</div>
${avastFooterHtml}
</body>
</html>`;

    const domain = cleanGmailId.split('@')[1] || 'gmail.com';
    const uniqueMessageId = `<${crypto.randomBytes(12).toString('hex')}@${domain}>`;

    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      replyTo: cleanGmailId,
      subject: subject ? subject.trim() : '',
      text: plainFallback,
      html: styledHtml,
      messageId: uniqueMessageId,
      encoding: 'utf-8'
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer Pro running on port ${PORT}`));
