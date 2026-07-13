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

// जीमेल अकाउंट्स की लिमिट ट्रैक करने के लिए डेटाबेस (In-Memory Tracking)
// Structure: { "email@gmail.com": { count: 12, lastSent: timestamp } }
const accountLimits = {};
const MAX_LIMIT_PER_ACCOUNT = 26;
const TIME_WINDOW = 12 * 60 * 60 * 1000; // 12 घंटे (मिलीसेकंड में)

const checkAuth = (req, res, next) => {
    if (req.session.loggedIn) return next();
    res.redirect('/');
};

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'rr' && password === 'rr') {
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

// 🛡️ स्मार्ट लिमिट चेकर और कस्टमाइज्ड इनबॉक्स सेंडर
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const cleanGmail = gmailId.trim().toLowerCase();
    const now = Date.now();

    // 12-घंटे की लिमिट की जांच करें
    if (!accountLimits[cleanGmail]) {
        accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
    } else {
        // अगर 12 घंटे बीत चुके हैं, तो लिमिट रीसेट करें
        if (now - accountLimits[cleanGmail].firstSentAt > TIME_WINDOW) {
            accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
        }
    }

    // अगर लिमिट 26 पार कर चुकी है तो ब्लॉक करें
    if (accountLimits[cleanGmail].count >= MAX_LIMIT_PER_ACCOUNT) {
        const timeLeft = Math.ceil((TIME_WINDOW - (now - accountLimits[cleanGmail].firstSentAt)) / (60 * 1000));
        return res.status(429).json({ 
            success: false, 
            message: `Limit Exceeded: ${cleanGmail} has reached 26 emails limit. Resets in ${timeLeft} mins.` 
        });
    }

    // ईमेल भेजने का सेटअप (SSL Port 465 for Highest Security)
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
        // सफलतापूर्वक भेजने पर काउंट बढ़ाएं
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
    console.log(`🚀 Smart Limit Mailer Engine running on http://localhost:${PORT}`);
});
