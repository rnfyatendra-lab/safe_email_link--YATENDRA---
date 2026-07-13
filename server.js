const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// मिडलवेयर सेटअप
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'fastmailer_super_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 दिन का सेशन
}));

// ऑथेंटिकेशन मिडलवेयर
const checkAuth = (req, res, next) => {
    if (req.session.loggedIn) return next();
    res.redirect('/');
};

// लॉगिन रूट (सिंपल और सेफ)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // आप अपने हिसाब से यूजरनेम/पासवर्ड बदल सकते हैं
    if (username === 'y' && password === 'y') {
        req.session.loggedIn = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

// लॉगआउट रूट
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// डैशबोर्ड रूट सुरक्षा
app.get('/launcher', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// 🚀 हाई-इन्बॉक्स डिलीवरी ईमेल सेंडिंग एपीआई
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    // ट्रांसपोर्टर कॉन्फ़िगरेशन (Gmail SMTP)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    // रैंडम मेसेज-आईडी जेनरेट करना ताकि जीमेल ट्रैश न करे
    const randomHex = Math.random().toString(16).substring(2, 10);
    const domain = gmailId.split('@')[1] || 'gmail.com';
    const messageId = `<${randomHex}-${Date.now()}@${domain}>`;

    // ईमेल ऑप्शंस + प्रो इनबॉक्स हेडर्स (बिना कंटेंट बदले)
    const mailOptions = {
        from: `"${senderName}" <${gmailId}>`,
        to: to,
        subject: subject,
        text: messageBody,
        headers: {
            'Message-ID': messageId,
            'X-Mailer': 'Nodemailer/FastMailerPro',
            'X-Priority': '3', // Normal priority जो रियल इनबॉक्स मेल्स की होती है
            'Priority': 'normal',
            'Precedence': 'bulk'
        }
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Delivered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`🚀 FastMailer Engine running on http://localhost:${PORT}`);
});
