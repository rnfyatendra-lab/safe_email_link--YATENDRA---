const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'fastmailer_secure_rotate_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const accountLimits = {};
const MAX_LIMIT_PER_ACCOUNT = 26;
const TIME_WINDOW = 12 * 60 * 60 * 1000;

// 🔒 [FIXED] होमपेज पर जाने पर अब सीधे index.html (लॉगिन पेज) खुलेगा
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const checkAuth = (req, res, next) => {
    if (req.session.loggedIn) return next();
    res.redirect('/');
};

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        req.session.loggedIn = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/launcher', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const cleanGmail = gmailId.trim().toLowerCase();
    const now = Date.now();

    if (!accountLimits[cleanGmail]) {
        accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
    } else {
        if (now - accountLimits[cleanGmail].firstSentAt > TIME_WINDOW) {
            accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
        }
    }

    if (accountLimits[cleanGmail].count >= MAX_LIMIT_PER_ACCOUNT) {
        const timeLeft = Math.ceil((TIME_WINDOW - (now - accountLimits[cleanGmail].firstSentAt)) / (60 * 1000));
        return res.status(429).json({ 
            success: false, 
            message: `Limit Exceeded: ${cleanGmail} reached 26 emails limit. Resets in ${timeLeft} mins.` 
        });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: cleanGmail,
            pass: appPassword.trim()
        }
    });

    const randomHex = Math.random().toString(36).substring(2, 15);
    const domain = cleanGmail.split('@')[1] || 'gmail.com';
    const messageId = `<${randomHex}.${Date.now()}@${domain}>`;

    const mailOptions = {
        from: `"${senderName}" <${cleanGmail}>`,
        to: to,
        subject: subject,
        text: messageBody,
        headers: {
            'Message-ID': messageId,
            'MIME-Version': '1.0',
            'X-Mailer': 'Microsoft Outlook 16.0',
            'X-Priority': '3', 
            'Priority': 'normal',
            'X-Report-Abuse-To': `mailto:${cleanGmail}`,
            'List-Unsubscribe': `<mailto:${cleanGmail}?subject=unsubscribe>`
        }
    };

    try {
        await transporter.sendMail(mailOptions);
        accountLimits[cleanGmail].count += 1;
        res.json({ 
            success: true, 
            message: 'Delivered', 
            currentCount: accountLimits[cleanGmail].count 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Smart Limit Mailer Engine running on port ${PORT}`);
});
