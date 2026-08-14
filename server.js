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
  secret: process.env.SESSION_SECRET || 'fast-mailer-secure-session-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(express.static(path.join(__dirname, 'public')));

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

// Single Direct Delivery Route - 100% Primary Inbox Optimized
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanGmailId = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo = to.trim();

  // Direct Google SSL Connection (Port 465) for direct DKIM/SPF passing
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: cleanGmailId,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const domain = cleanGmailId.split('@')[1] || 'gmail.com';
  const uniqueMsgId = `<${Date.now()}.${crypto.randomBytes(6).toString('hex')}@${domain}>`;
  const fromFormatted = senderName?.trim() 
    ? `"${senderName.trim()}" <${cleanGmailId}>` 
    : cleanGmailId;

  try {
    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject || 'Message',
      text: messageBody || '',
      messageId: uniqueMsgId,
      date: new Date(),
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'Apple Mail (2.3654.120.0.1)',
        'X-Priority': '3',
        'Importance': 'Normal'
      }
    });

    console.log(`✅ [Direct Inbox] Delivered to ${cleanTo} | ID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ [Delivery Failed] ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer Active on port ${PORT}`));
