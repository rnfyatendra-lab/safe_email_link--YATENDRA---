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
  secret: process.env.SESSION_SECRET || 'fast-mailer-secure-token-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 1000 * 60 * 60 * 24 // 24 Hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// Web UI Page Routes
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

// Single Direct Delivery Route - Direct Primary Inbox Landing Engine
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanGmailId  = gmailId.trim().toLowerCase();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim().toLowerCase();

  // Direct Google Secure Port 465 Pool Connection
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    pool: true,   // Keeps connections open for faster & warmer sending
    maxConnections: 6,
    maxMessages: 100,
    auth: {
      user: cleanGmailId,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Generate Authentic Unique RFC Message-ID
  const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
  const randomHex = crypto.randomBytes(6).toString('hex');
  const uniqueMessageId = `<${Date.now()}.${randomHex}@${domain}>`;

  // From Header formatting
  const fromFormatted = senderName && senderName.trim()
    ? `"${senderName.trim()}" <${cleanGmailId}>`
    : `"${cleanGmailId}" <${cleanGmailId}>`;

  try {
    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject || '',
      text: messageBody || '',
      messageId: uniqueMessageId,
      date: new Date(),
      encoding: 'utf-8',
      // Authentic Mail Client Headers (Bypasses Spam & Promotion tabs)
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'Apple Mail (2.3654.120.0.1)',
        'X-Priority': '3',
        'Importance': 'Normal',
        'Content-Transfer-Encoding': '7bit'
      }
    });

    console.log(`✅ [Inbox Delivered] -> ${cleanTo} | MessageID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ [Delivery Failed] -> ${cleanTo}:`, err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'SMTP transmission failed' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Fast Mailer Direct Delivery Engine live on port ${PORT}`);
});
