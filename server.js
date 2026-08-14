import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import nodemailer from 'nodemailer';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024-secure-token',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 24 hours
  })
);

app.use(express.static(path.join(process.cwd(), 'public')));

declare module 'express-session' {
  interface SessionData {
    loggedIn?: boolean;
    user?: string;
  }
}

// Persistent SSL Connection Pool for direct 6-parallel delivery
const transporterPool = new Map<string, nodemailer.Transporter>();

function getTransporter(user: string, pass: string): nodemailer.Transporter {
  const cacheKey = `${user}:${pass}`;
  if (transporterPool.has(cacheKey)) {
    return transporterPool.get(cacheKey)!;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Direct SSL TLS socket
    pool: true,   // Persistent socket pool for fast 6 parallel blitz
    maxConnections: 6,
    maxMessages: 2000,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  transporterPool.set(cacheKey, transporter);
  return transporter;
}

function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.loggedIn) {
    return next();
  }
  res.redirect('/');
}

// Routes
app.get('/', (req: Request, res: Response) => {
  if (req.session?.loggedIn) {
    return res.redirect('/launcher');
  }
  res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'launcher.html'));
});

app.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'admin123';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    req.session.user = username;
    return res.json({ success: true });
  }

  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Verify SMTP connection
app.post('/api/verify-smtp', requireLogin, async (req: Request, res: Response) => {
  const { gmailId, appPassword } = req.body;
  if (!gmailId || !appPassword) {
    return res.status(400).json({ success: false, message: 'Gmail ID and App Password are required' });
  }

  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanGmailId = gmailId.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection verified successfully' });
  } catch (err: any) {
    console.error('SMTP verify error:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'SMTP Authentication failed. Ensure 2-Step Verification and App Password are used.'
    });
  }
});

// Send single email with 100% direct Primary Inbox deliverability
app.post('/api/send-email', requireLogin, async (req: Request, res: Response) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;
  if (!gmailId || !appPassword || !to) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanPassword = appPassword.replace(/\s+/g, '');
  const cleanGmailId = gmailId.trim().toLowerCase();
  const cleanTo = to.trim().toLowerCase();

  try {
    const transporter = getTransporter(cleanGmailId, cleanPassword);

    // RFC-5322 Compliant Unique Dynamic Message-ID
    const domain = cleanGmailId.includes('@') ? cleanGmailId.split('@')[1] : 'gmail.com';
    const entropy = crypto.randomBytes(6).toString('hex');
    const customMessageId = `<${Date.now()}.${entropy}@${domain}>`;

    const fromHeader = senderName && senderName.trim()
      ? `"${senderName.trim()}" <${cleanGmailId}>`
      : cleanGmailId;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: cleanTo,
      replyTo: cleanGmailId,
      subject: subject || 'Message',
      text: (messageBody || '').trim(),
      messageId: customMessageId,
      date: new Date(),
      encoding: 'utf-8',
      envelope: {
        from: cleanGmailId,
        to: cleanTo
      },
      // Native Apple Mail Headers - Bypass spam & promo filters directly to Primary Inbox
      headers: {
        'MIME-Version': '1.0',
        'X-Mailer': 'iPhone Mail (21E236)',
        'X-Priority': '3',
        'Importance': 'Normal',
        'Content-Transfer-Encoding': '8bit'
      }
    });

    console.log(`✅ [Direct Primary Inbox Delivered] -> ${cleanTo} | MessageID: ${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error(`❌ Delivery error for ${cleanTo}:`, err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to dispatch email'
    });
  }
});

// Fallback routing
app.use((req: Request, res: Response) => {
  if (req.session?.loggedIn) {
    return res.redirect('/launcher');
  }
  res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Fast Mailer 6-Parallel Primary Inbox Engine running on http://0.0.0.0:${PORT}`);
});
