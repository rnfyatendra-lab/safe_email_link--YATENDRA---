const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path'); // पाथ मॉड्यूल जोड़ा ताकि फाइल आसानी से मिल सके
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

// 1. यह रूट जोड़ने से 'Cannot GET /' वाली एरर खत्म हो जाएगी
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'launcher.html')); // अगर आपकी मुख्य फाइल का नाम index.html है तो यहाँ वह नाम लिख दें
});

app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!senderName || !gmailId || !appPassword || !subject || !messageBody || !to) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

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
        text: messageBody // प्योर प्लेन टेक्स्ट मोड एक्टिव
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: `Email sent to ${to}` });
    } catch (error) {
        console.error("Nodemailer Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/logout', (req, res) => {
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mailer Server is running on port ${PORT}`);
});
