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
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!senderName || !gmailId || !appPassword || !subject || !messageBody || !to) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    // Gmail SMTP Setup
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    // Unique Message-ID generation to look organic to spam filters
    const randomHex = crypto.randomBytes(16).toString('hex');
    const domain = gmailId.split('@')[1] || 'gmail.com';
    const messageId = `<${randomHex}@${domain}>`;

    const mailOptions = {
        from: `"${senderName}" <${gmailId}>`,
        to: to,
        subject: subject,
        text: messageBody,
        headers: {
            'Message-ID': messageId,
            'X-Mailer': 'Nodemailer/FastMailer-Engine',
            'X-Priority': '3', // Normal Priority
            'List-Unsubscribe': `<mailto:${gmailId}?subject=unsubscribe>` // Anti-Spam factor
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
    console.log(`Optimized Server running on port ${PORT}`);
});
