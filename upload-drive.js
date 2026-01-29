const { google } = require('googleapis');

/* =====================================================
   CONFIGURAZIONE ROOT DRIVE PER SOCIETÀ
   (questi ID sono quelli che mi hai fornito)
===================================================== */
const ROOTS = {
  MIS_OSIMO: "1bsPNJ2BFJIP9Q3WwDSVNy32u-Qu2qMjr",
  MIS_MONTEGIORGIO: "1PCvF76LJwD6T_OaPtkWg6dh1Tg-DG6or",
  MIS_GROTTAMMARE: "12Nj8o942uedxByJOtcSKXvkTBH6ShNNA"
};

/* =====================================================
   UTILITY: ottiene o crea una cartella
===================================================== */
async function getOrCreateFolder(drive, name, parentId) {
  const q = [
    `'${parentId}' in parents`,
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${name}'`,
    `trashed=false`
  ].join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    spaces: 'drive'
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });

  return folder.data.id;
}

/* =====================================================
   HANDLER NETLIFY
===================================================== */
exports.handler = async (event) => {
  try {
    if (!event.body) {
      throw new Error("Body mancante");
    }

    const body = JSON.parse(event.body);

    const {
      societa,
      modulo,          // es: TS_EMERGENZA | TS_PRIVATI | TS_TRASPORTO | CHECKLIST
      data_servizio,   // es: 2026-01-29
      pdf,
      excel
    } = body;

    if (!societa || !ROOTS[societa]) {
      throw new Error("Società non valida o non configurata");
    }

    if (!pdf || !excel) {
      throw new Error("File PDF o Excel mancanti");
    }

    /* =====================================================
       AUTENTICAZIONE GOOGLE (SERVICE ACCOUNT)
       (le env le configureremo DOPO)
    ===================================================== */
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

    /* =====================================================
       COSTRUZIONE STRUTTURA CARTELLE
    ===================================================== */
    const rootId = ROOTS[societa];

    const year = new Date(data_servizio).getFullYear().toString();

    const annoId = await getOrCreateFolder(drive, year, rootId);
    const moduloId = await getOrCreateFolder(drive, modulo, annoId);

    const pdfFolderId = await getOrCreateFolder(drive, 'PDF', moduloId);
    const excelFolderId = await getOrCreateFolder(drive, 'EXCEL', moduloId);

    /* =====================================================
       UPLOAD FILE
    ===================================================== */
    async function uploadFile(name, mimeType, base64, parentId) {
      const buffer = Buffer.from(base64, 'base64');

      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [parentId]
        },
        media: {
          mimeType,
          body: buffer
        },
        fields: 'id,name'
      });

      return res.data;
    }

    const pdfRes = await uploadFile(
      pdf.name,
      'application/pdf',
      pdf.data,
      pdfFolderId
    );

    const excelRes = await uploadFile(
      excel.name,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      excel.data,
      excelFolderId
    );

    /* =====================================================
       RISPOSTA OK
    ===================================================== */
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        societa,
        anno: year,
        modulo,
        pdfId: pdfRes.id,
        excelId: excelRes.id
      })
    };

  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
