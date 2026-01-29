const { google } = require('googleapis');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const serviceAccount = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\\n/g, '\n')
    );

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ['https://www.googleapis.com/auth/drive.file']
    );

    const drive = google.drive({ version: 'v3', auth });

    async function uploadFile(name, mimeType, base64) {
      const buffer = Buffer.from(base64, 'base64');

      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [process.env.DRIVE_FOLDER_ID]
        },
        media: {
          mimeType,
          body: buffer
        }
      });

      return res.data.id;
    }

    const pdfId = await uploadFile(
      body.pdf.name,
      'application/pdf',
      body.pdf.data
    );

    const xlsId = await uploadFile(
      body.excel.name,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body.excel.data
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ pdfId, xlsId })
    };

  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: e.message
    };
  }
};
