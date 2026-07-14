const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

app.use(express.json());
app.use(express.static('public')); // आपकी HTML फाइलें public फोल्डर में होनी चाहिए

app.post('/api/send-email', async (req, res) => {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    if (!senderName || !gmailId || !appPassword || !subject || !messageBody || !to) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // ट्रांसपोर्टर कॉन्फ़िगरेशन (नॉर्मल जीमेल और ऐप पासवर्ड के लिए)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailId,
            pass: appPassword
        }
    });

    // ईमेल ऑप्शंस - प्योर प्लेन टेक्स्ट मोड एक्टिवेटेड
    const mailOptions = {
        from: `"${senderName}" <${gmailId}>`,
        to: to,
        subject: subject,
        text: messageBody // ← यहाँ 'html' की जगह 'text' किया है, जिससे हुबहू वही टेक्स्ट जाएगा और स्पैम बाईपास होगा
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: `Email sent to ${to}` });
    } catch (error) {
        console.error("Nodemailer Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// लॉगआउट एंडपॉइंट
app.post('/logout', (req, res) => {
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mailer Server is running on port ${PORT}`);
});
