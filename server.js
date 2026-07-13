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
    secret: 'fastmailer_secure_inbox_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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

// बैकएंड डिले फंक्शन (जीमेल फिल्टर को शांत रखने के लिए)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🛡️ हाई-इनबॉक्स ट्रस्ट ईमेल सेंडिंग एपीआई
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // पोर्ट 465 के लिए SSL अनिवार्य है (हाई सिक्योरिटी)
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    // असली मेसेज-आईडी स्ट्रक्चर जो जीमेल इनबॉक्स के लिए जरूरी है
    const randomHex = Math.random().toString(36).substring(2, 15);
    const domain = gmailId.split('@')[1] || 'gmail.com';
    const messageId = `<${randomHex}.${Date.now()}@${domain}>`;

    const mailOptions = {
        from: `"${senderName}" <${gmailId}>`,
        to: to,
        subject: subject,
        text: messageBody,
        // इनबॉक्स बूस्टर हेडर्स (बिना आपका टेक्स्ट या सब्जेक्ट बदले)
        headers: {
            'Message-ID': messageId,
            'MIME-Version': '1.0',
            'X-Mailer': 'Microsoft Outlook 16.0', // जीमेल के फिल्टर को लगेगा कि मेल आउटलुक से भेजा गया है
            'X-Priority': '3', 
            'Priority': 'normal',
            'X-Report-Abuse-To': `mailto:${gmailId}`,
            'List-Unsubscribe': `<mailto:${gmailId}?subject=unsubscribe>`
        }
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Delivered to Inbox' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Safe Inbox Mailer Engine running on http://localhost:${PORT}`);
});
