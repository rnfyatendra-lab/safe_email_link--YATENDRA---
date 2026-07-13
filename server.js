const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
const crypto     = require('crypto'); // Random ID generate karne ke liye
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
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
  const validUser = process.env.ADMIN_USER || 'xx';
  const validPass = process.env.ADMIN_PASS || 'xx';
  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  if (!gmailId || !appPassword || !to)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  // 1. POOLING: Isse Gmail baar-baar connection banana block nahi karega
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true, 
    maxConnections: 5,
    maxMessages: 100,
    auth: { user: gmailId, pass: appPassword }
  });

  // 2. RANDOMIZED FOOTER: Har email ka structure alag dikhega (Anti-Spam Rule)
  const randomHex = crypto.randomBytes(4).toString('hex');
  const safeMessageBody = `${messageBody}\n\n---\nRef: [${randomHex}]`; 

  // 3. SECURE HEADERS: Real personal email ki tarah simulate karne ke liye
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@gmail.com>`;

  try {
    await transporter.sendMail({
      from: senderName ? `"${senderName}" <${gmailId}>` : `"${gmailId}" <${gmailId}>`,
      to,
      subject,
      text: safeMessageBody,
      headers: {
        'Message-ID': messageId,
        'X-Mailer': 'FastMailer-Core',
        'MIME-Version': '1.0',
        'X-Priority': '3', // Normal Priority (Inbox friendly)
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ ${to}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer Ultra-Safe on port ${PORT}`));
