const { google } = require('googleapis');

/* =====================================================
   ROOT DRIVE PER SOCIETÀ
===================================================== */
const ROOTS = {
  MIS_OSIMO: "1bsPNJ2BFJIP9Q3WwDSVNy32u-Qu2qMjr",
  MIS_MONTEGIORGIO: "1PCvF76LJwD6T_OaPtkWg6dh1Tg-DG6or",
  MIS_GROTTAMMARE: "12Nj8o942uedxByJOtcSKXvkTBH6ShNNA"
};

/* =====================================================
   CREA O RECUPERA CARTELLA
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

  if (res.data.files.length) {
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
   MESE FORMATTATO
===================================================== */
function getMeseFolder(data) {
  const mesi = [
    "01_GENNAIO","02_FEBBRAIO","03_MARZO","04_APRILE",
    "05_MAGGIO","06_GIUGNO","07_LUGLIO","08_AGOSTO",
    "09_SETTEMBRE","10_OTTOBRE","11_NOVEMBRE","12_DICEMBRE"
  ];
  return mesi[new Date(data).getMonth()];
}

/* =====================================================
   COSTRUZIONE ALBERO:
   ROOT / ANNO / MODULO / PDF|EXCEL / MESE
===================================================== */
async function buildFolderTree(drive, societa, modulo, tipoFile, data_servizio) {
  const rootId = ROOTS[societa];
  if (!rootId) throw new Error("Società non riconosciuta");

  const anno = new Date(data_servizio).getFullYear().toString();
  const mese = getMeseFolder(data_servizio);

  const annoId   = await getOrCreateFolder(drive, anno, rootId);
  const moduloId = await getOrCreateFolder(drive, modulo, annoId);
  const tipoId   = await getOrCreateFolder(drive, tipoFile, moduloId);
  const meseId   = await getOrCreateFolder(drive, mese, tipoId);

  return meseId;
}

/* =====================================================
   HANDLER NETLIFY
===================================================== */
exports.handler = async (event) => {
  try {
    if (!event.body) throw new Error("Body mancante");

    const {
      societa,
      modulo,        // TS_EMERGENZA | TS_TRASPORTO | TS_PRIVATI | CHECKLIST
      data_servizio, // YYYY-MM-DD
      pdf,
      excel
    } = JSON.parse(event.body);

    if (!societa || !modulo || !data_servizio) {
      throw new Error("Parametri obbligatori mancanti");
    }

if (isNaN(new Date(data_servizio))) {
  throw new Error("data_servizio non valida");
}


    /* =====================================================
       AUTH GOOGLE (SERVICE ACCOUNT)
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
       CARTELLE PDF / EXCEL (CON ANNO + MESE)
    ===================================================== */
    const pdfFolderId = pdf
      ? await buildFolderTree(drive, societa, modulo, "PDF", data_servizio)
      : null;

    const excelFolderId = excel
      ? await buildFolderTree(drive, societa, modulo, "EXCEL", data_servizio)
      : null;

    /* =====================================================
       UPLOAD FILE
    ===================================================== */
    async function uploadFile(file, mimeType, parentId) {
      const buffer = Buffer.from(file.data, 'base64');

      const res = await drive.files.create({
        requestBody: {
          name: file.name,
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

    const pdfRes = pdf
      ? await uploadFile(pdf, 'application/pdf', pdfFolderId)
      : null;

    const excelRes = excel
      ? await uploadFile(
          excel,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          excelFolderId
        )
      : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        societa,
        modulo,
        anno: new Date(data_servizio).getFullYear(),
        pdfId: pdfRes?.id || null,
        excelId: excelRes?.id || null
      })
    };

  } catch (err) {
    console.error("UPLOAD DRIVE ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
