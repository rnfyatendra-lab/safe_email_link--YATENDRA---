const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

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

    // Pure Clean Mail Options - No text modifications
    const mailOptions = {
        from: gmailId, 
        to: to,
        subject: subject, // Bilkul wahi jo aap likhenge
        text: messageBody, // No extra characters, no dynamic text
        headers: {
            'X-Mailer': 'Nodemailer',
            'X-Priority': '3', 
            'MIME-Version': '1.0'
        }
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error(`Error sending to ${to}:`, error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/logout', (req, res) => {
    res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Clean Mailer Server running on port ${PORT}`);
});
