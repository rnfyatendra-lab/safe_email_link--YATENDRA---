require('dotenv').config();
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// दोनों केस (स्मॉल और कैपिटल) के लिए स्टैटिक पाथ सेटअप ताकि फ़ाइल नॉट फाउंड न आए
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'Public')));

app.use(session({
    secret: 'fastmailer_original_parallel_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// होमपेज रूट (लॉगिन पेज लोड करने के लिए)
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.resolve(__dirname, 'Public', 'index.html'), (err2) => {
                if (err2) {
                    res.status(404).send('index.html not found inside public folder.');
                }
            });
        }
    });
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
    res.sendFile(path.resolve(__dirname, 'public', 'launcher.html'), (err) => {
        if (err) {
            res.sendFile(path.resolve(__dirname, 'Public', 'launcher.html'));
        }
    });
});

// सुरक्षित इनबॉक्स डिलीवरी ईमेल API
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !to) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const cleanGmail = gmailId.trim().toLowerCase();

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
        // सुरक्षित इनबॉक्स डिलीवरी हेडर्स
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
        res.json({ success: true, message: 'Delivered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Original Parallel Engine running on port ${PORT}`);
});
