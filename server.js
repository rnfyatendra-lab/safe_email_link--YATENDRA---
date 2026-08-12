const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = process.env.PORT || 3000;
const expressApp = express();

expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: true }));
expressApp.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
expressApp.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

expressApp.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

expressApp.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

expressApp.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || '@#@#@';
  const validPass = process.env.ADMIN_PASS || '@#@#@';
  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

expressApp.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Cache transporters to optimize performance and prevent repeated connection handshakes
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true, // Reuses SMTP connections for higher speed
      maxConnections: 5,
      maxMessages: 100
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

expressApp.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const transporter = getTransporter(gmailId, appPassword);

  const mailOptions = {
    from: senderName ? `"${senderName}" <${gmailId}>` : gmailId,
    to,
    subject: subject || 'No Subject',
    text: messageBody,
    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.5;">
            ${messageBody.replace(/\n/g, '<br>')}
           </div>`,
    headers: {
      'X-Mailer': 'NodeMailer',
      'X-Priority': '3' // Normal priority
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Send error to ${to}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

expressApp.listen(app, () => console.log(`🚀 Mailer server running on port ${app}`));
