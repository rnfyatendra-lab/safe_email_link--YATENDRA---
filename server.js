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

// 8-Socket Persistent SSL SMTP Pool
const transporterPool = new Map();

function getTransporter(user, pass) {
  const cacheKey = `${user}:${pass}`;
  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 8,
    maxMessages: 500,
    auth: { user, pass }
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

// Strip HTML for fallback plain text
function htmlToPlainText(html) {
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// Universal High-Deliverability Dispatcher (UTF-8 Multilingual + Rich Formatting)
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, htmlBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !htmlBody) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim();

  try {
    const microDelay = Math.floor(Math.random() * 50) + 170;
    await sleep(microDelay);

    const transporter = getTransporter(cleanGmailId, cleanPassword);

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    const plainFallback = htmlToPlainText(htmlBody);

    // Standardized Clean Email Container with full UTF-8 Support
    const styledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.65;">
<div style="padding:4px 0;white-space:normal;word-break:break-word;">
${htmlBody}
</div>
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
