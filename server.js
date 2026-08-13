const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parser Setup
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Secure Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true,
    secure: false, 
    maxAge: 1000 * 60 * 60 * 8 // 8 Hours
  }
}));

// Static Asset Serving
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Guard Middleware
function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// UI Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Authentication Endpoints
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || '@#@#@';
  const validPass = process.env.ADMIN_PASS || '@#@#@';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }

  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cache Map for SMTP Transporters
const transporterCache = new Map();

function getTransporter(gmailId, appPassword) {
  const key = `${gmailId}:${appPassword}`;
  if (!transporterCache.has(key)) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailId, pass: appPassword },
      pool: true,             // Connection pooling for fast execution
      maxConnections: 3,      // Parallel SMTP connections
      maxMessages: 100,       // Connection reuse count
      rateDelta: 1000,        // Time window (1 second)
      rateLimit: 4,           // Max 4 emails/sec per connection (prevents Gmail spam triggers)
      connectionTimeout: 10000,
      socketTimeout: 30000
    });
    transporterCache.set(key, transporter);
  }
  return transporterCache.get(key);
}

// Email Dispatch Endpoint (Primary Inbox Optimized)
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const recipient = to.trim();
  const cleanGmail = gmailId.trim();

  try {
    // Micro-jitter delay (100ms - 200ms) to ensure unique timestamp cadence
    const microJitter = Math.floor(Math.random() * 100) + 100;
    await sleep(microJitter);

    const transporter = getTransporter(cleanGmail, appPassword);

    // Exact sender matching to prevent SPF/DKIM spoofing flag
    const fromHeader = senderName && senderName.trim() 
      ? `"${senderName.trim()}" <${cleanGmail}>` 
      : cleanGmail;

    const mailOptions = {
      from: fromHeader,
      to: recipient,
      subject: subject ? subject.trim() : '',
      text: messageBody,
      headers: {
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Direct delivery failed for [${recipient}]:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer active on http://localhost:${PORT}`));
