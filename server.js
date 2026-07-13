// package.json के अनुसार dotenv को लोड करना (यदि आप .env फ़ाइल का उपयोग करते हैं)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
// आपकी package.json की डिपेंडेंसी के अनुसार body-parser का उपयोग
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// body-parser मिडिलवेयर कॉन्फ़िगरेशन
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// स्टैटिक फाइल्स (CSS, JS, Images) के लिए public फ़ोल्डर
app.use(express.static(path.join(__dirname, 'public')));

// एक्सप्रेस सेशन कॉन्फ़िगरेशन
app.use(session({
    secret: 'fastmailer_secure_rotate_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 घंटे का सेशन
}));

// इन-मेमोरी लिमिट ट्रैकर (12 घंटे में 26 ईमेल की सख्त लिमिट के लिए)
const accountLimits = {};
const MAX_LIMIT_PER_ACCOUNT = 26;
const TIME_WINDOW = 12 * 60 * 60 * 1000; // 12 घंटे मिलीसेकंड में

// 🔒 [FIXED] होमपेज रूट - जो सीधे आपकी लॉगिन स्क्रीन (index.html) खोलेगा (Cannot GET / एरर का फिक्स)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ऑथेंटिकेशन चेक मिडिलवेयर
const checkAuth = (req, res, next) => {
    if (req.session.loggedIn) return next();
    res.redirect('/');
};

// लॉगिन रूट
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
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

// मुख्य लॉन्चर पेज (डैशबोर्ड) रूट
app.get('/launcher', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// 🛡️ स्मार्ट रोटेशन और एंटी-स्पैम ईमेल सेंडिंग API
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const cleanGmail = gmailId.trim().toLowerCase();
    const now = Date.now();

    // जीमेल अकाउंट के लिए टाइम-विंडो चेक और रीसेट लॉजिक
    if (!accountLimits[cleanGmail]) {
        accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
    } else {
        // अगर 12 घंटे पूरे हो चुके हैं, तो इस अकाउंट का काउंटर वापस 0 कर दें
        if (now - accountLimits[cleanGmail].firstSentAt > TIME_WINDOW) {
            accountLimits[cleanGmail] = { count: 0, firstSentAt: now };
        }
    }

    // यदि यह अकाउंट 12 घंटे में अपनी 26 ईमेल की लिमिट पूरी कर चुका है
    if (accountLimits[cleanGmail].count >= MAX_LIMIT_PER_ACCOUNT) {
        const timeLeft = Math.ceil((TIME_WINDOW - (now - accountLimits[cleanGmail].firstSentAt)) / (60 * 1000));
        return res.status(429).json({ 
            success: false, 
            message: `Limit Exceeded: ${cleanGmail} reached 26 emails limit. Resets in ${timeLeft} mins.` 
        });
    }

    // Nodemailer ट्रांसपोर्टर सेटअप (SSL Port 465)
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

    // जीमेल इनबॉक्स डिलीवरी बूस्ट करने के लिए रैंडम मेसेज-आईडी
    const randomHex = Math.random().toString(36).substring(2, 15);
    const domain = cleanGmail.split('@')[1] || 'gmail.com';
    const messageId = `<${randomHex}.${Date.now()}@${domain}>`;

    const mailOptions = {
        from: `"${senderName}" <${cleanGmail}>`,
        to: to,
        subject: subject,
        text: messageBody,
        // इनबॉक्स लैंडिंग हेडर्स (यह आपके ओरिजिनल टेक्स्ट या सब्जेक्ट को नहीं बदलता)
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
        // सफलता पर काउंटर को 1 बढ़ाएं
        accountLimits[cleanGmail].count += 1;
        res.json({ 
            success: true, 
            message: 'Delivered successfully', 
            currentCount: accountLimits[cleanGmail].count 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`🚀 Smart Mailer Engine running perfectly on port ${PORT}`);
});
