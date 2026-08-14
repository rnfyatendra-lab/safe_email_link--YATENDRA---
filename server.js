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
  secret: process.env.SESSION_SECRET || 'fast-mailer-ultra-secure-token-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// 🏢 Multi-Pattern Website & Professional Footers List (Rotates per email)
const DYNAMIC_FOOTERS = [
  (name, id) => `\n\n---\nBest Regards,\n${name}\nDirect Communication | Verified Dispatch: ${id}\n© ${new Date().getFullYear()} All rights reserved.`,
  (name, id) => `\n\n__________________________________\nSent by: ${name}\nConfidentiality Notice: This message contains confidential information intended solely for the recipient.\nRef: #${id.toUpperCase()}`,
  (name, id) => `\n\n--\n${name}\nClient Services & Support Division\nWebsite Notification Dispatch | Secure Portal Key: ${id}`,
  (name, id) => `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nRegards,\n${name}\nAutomated System Dispatcher • Official Corporate Notice\nSession Token: ${id} • Security Verified`,
  (name, id) => `\n\n--\nWarm Regards,\n${name}\nPriority Client Communication Line\nTicket Identifier: TX-${id.slice(0,8)}`,
  (name, id) => `\n\n---\n${name}\nOperations & Delivery Desk\nNotice: This communication is sent on behalf of client services. Transmission code: ${id}`,
  (name, id) => `\n\n__________________________________\n${name} | Senior Representative\nDirect Message Routing Desk • ID: ${id}\nGlobal Client Relations`,
  (name, id) => `\n\n--\nThank you,\n${name}\nElectronic Mail Verification: Verified [OK] • Ref: ${id.slice(0, 6)}`
];

function getRandomFooter(senderName) {
  const randIndex = Math.floor(Math.random() * DYNAMIC_FOOTERS.length);
  const randomRef = crypto.randomBytes(4).toString('hex');
  return DYNAMIC_FOOTERS[randIndex](senderName || 'Client Desk', randomRef);
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

// Single Direct Delivery Route with Dynamic Footer Rotation
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to, enableFooter } = req.body;
  
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing required credentials' });
  }

  const cleanGmailId  = gmailId.trim().toLowerCase();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim().toLowerCase();

  // Create High-Throughput Google Transport Pool
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 6,
    maxMessages: 200,
    auth: {
      user: cleanGmailId,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Dynamic unique footer for this specific email
  const dynamicFooter = enableFooter !== false ? getRandomFooter(senderName) : '';
  const finalEmailBody = `${messageBody || ''}${dynamicFooter}`;

  // Generate Unique Standard RFC Message-ID
  const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
  const uniqueToken = `${Date.now()}.${crypto.randomBytes(5).toString('hex')}`;
  const uniqueMessageId = `<${uniqueToken}@${domain}>`;

  const fromFormatted = senderName && senderName.trim()
    ? `"${senderName.trim()}" <${cleanGmailId}>`
    : `"${cleanGmailId}" <${cleanGmailId}>`;

  try {
    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject || 'Notice',
      text: finalEmailBody,
      messageId: uniqueMessageId,
      date: new Date(),
      encoding: 'utf-8',
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'Apple Mail (2.3654.120.0.1)',
        'X-Priority': '3',
        'Importance': 'Normal'
      }
    });

    console.log(`✅ [Delivered to Primary Inbox] -> ${cleanTo} | ID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ [Delivery Failed] -> ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Inbox Master 6-Parallel Engine active on port ${PORT}`);
});
