const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fast-mailer-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// Login Check Middleware
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
  const validUser = process.env.ADMIN_USER || '##';
  const validPass = process.env.ADMIN_PASS || '##';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Dynamic Message-ID Generator
function generateMessageId(domain) {
  const randomStr = Math.random().toString(36).substring(2, 11);
  return `<${Date.now()}.${randomStr}@${domain}>`;
}

// Send Email API Endpoint
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const cleanEmail = gmailId.toLowerCase().trim();
  const domainPart = cleanEmail.split('@')[1] || 'gmail.com';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: cleanEmail,
      pass: appPassword.replace(/\s+/g, '').trim()
    }
  });

  const mailOptions = {
    from: senderName ? `"${senderName.trim()}" <${cleanEmail}>` : cleanEmail,
    to: to.trim(),
    subject: subject || 'No Subject',
    text: messageBody, // Pure Plain-Text format
    messageId: generateMessageId(domainPart),
    headers: {
      'Date': new Date().toUTCString(),
      'X-Mailer': 'Nodemailer'
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Sent to ${to}: ${info.messageId}`);
    return res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Error (${to}):`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
