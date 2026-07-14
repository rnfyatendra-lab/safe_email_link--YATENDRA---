const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Explicit Route for default root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Standard API Endpoint for Parallel Mail Dispatch
app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!senderName || !gmailId || !appPassword || !subject || !messageBody || !to) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    // Configure SMTP transport layers
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    const mailOptions = {
        from: `"${senderName}" <${gmailId}>`,
        to: to,
        subject: subject,
        text: messageBody
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
    console.log(`Server executing structurally on port ${PORT}`);
});
