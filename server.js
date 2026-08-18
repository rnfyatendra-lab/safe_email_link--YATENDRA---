const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-clean-core-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Persistent Single Transporter Pool
const transporterCache = {};

function getTransporter(gmailId, appPassword) {
  const cacheKey = `${gmailId}:${appPassword}`;
  if (!transporterCache[cacheKey]) {
    transporterCache[cacheKey] = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: { user: gmailId, pass: appPassword }
    });
  }
  return transporterCache[cacheKey];
}

// Direct Routes to prevent "Not Found"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.get('/launcher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Pure 1-by-1 Native Dispatcher
app.post('/api/send-email', async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  if (!gmailId || !appPassword || !to || !messageBody)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const cleanGmailId  = gmailId.trim();
  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanTo       = to.trim();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    const fromFormatted = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    const info = await transporter.sendMail({
      from: fromFormatted,
      to: cleanTo,
      subject: subject ? subject.trim() : '',
      text: messageBody.trim()
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running cleanly on port ${PORT}`));
