const nodemailer = require("nodemailer");

exports.handler = async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: false, // STARTTLS
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_USER,
      subject: "✅ Test email Netlify → Gmail",
      text: "Email inviata correttamente dalla Netlify Function test-mail.",
    });

    return {
      statusCode: 200,
      body: "Mail inviata con successo",
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: "Errore invio mail: " + error.message,
    };
  }
};
