const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/send-email', async (req, res) => {
    const { gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!gmailId || !appPassword || !subject || !messageBody || !to) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    // Content Rotation Engine to bypass fingerprint filtering
    const uniqueID = crypto.randomBytes(4).toString('hex');
    const randomizedSubject = `${subject} (Ref: #${uniqueID})`;
    
    // Invisible space and unique footer injection so Google reads it as a fresh human email
    const organicBody = `${messageBody}\n\n---\nSent securely via client channel [ID: ${uniqueID}]`;

    const randomHex = crypto.randomBytes(16).toString('hex');
    const domain = gmailId.split('@')[1] || 'gmail.com';

    const mailOptions = {
        from: gmailId, // Only Gmail ID used as sender source
        to: to,
        subject: randomizedSubject,
        text: organicBody,
        headers: {
            'Message-ID': `<${randomHex}@${domain}>`,
            'X-Mailer': 'Gmail-Web-Interface-Mobile', // Spoofing as regular mobile layout
            'X-Priority': '3',
            'MIME-Version': '1.0'
        }
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error(`SMTP Error for ${to}:`, error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/logout', (req, res) => {
    res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Anti-Spam Multi-Thread Server running on port ${PORT}`);
});
