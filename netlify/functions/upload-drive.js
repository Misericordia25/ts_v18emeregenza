const { google } = require("googleapis");
const nodemailer = require("nodemailer");

/* =====================================================
   ROOT DRIVE PER SOCIETÀ
===================================================== */
const ROOTS = {
  MIS_OSIMO: "1bsPNJ2BFJIP9Q3WwDSVNy32u-Qu2qMjr",
  MIS_MONTEGIORGIO: "1PCvF76LJwD6T_OaPtkWg6dh1Tg-DG6or",
  MIS_GROTTAMMARE: "12Nj8o942uedxByJOtcSKXvkTBH6ShNNA"
};

/* =====================================================
   UTILS DRIVE
===================================================== */
async function getOrCreateFolder(drive, name, parentId) {
  const q = [
    `'${parentId}' in parents`,
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${name}'`,
    `trashed=false`
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive"
  });

  if (res.data.files.length) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    fields: "id"
  });

  return folder.data.id;
}

function meseFolder(data) {
  const mesi = [
    "01_GENNAIO","02_FEBBRAIO","03_MARZO","04_APRILE",
    "05_MAGGIO","06_GIUGNO","07_LUGLIO","08_AGOSTO",
    "09_SETTEMBRE","10_OTTOBRE","11_NOVEMBRE","12_DICEMBRE"
  ];
  return mesi[new Date(data).getMonth()];
}

async function buildTree(drive, societa, modulo, data) {
  const rootId = ROOTS[societa];
  if (!rootId) throw new Error("Società non riconosciuta");

  const anno = new Date(data).getFullYear().toString();
  const mese = meseFolder(data);

  const annoId = await getOrCreateFolder(drive, anno, rootId);
  const modId  = await getOrCreateFolder(drive, modulo, annoId);
  const meseId = await getOrCreateFolder(drive, mese, modId);

  return meseId;
}

/* =====================================================
   HANDLER
===================================================== */
exports.handler = async (event) => {
  try {
    if (!event.body) throw new Error("Body mancante");

    const {
      societa,
      modulo,
      tipo,               // "TS" | "CHECKLIST"
      data_servizio,      // YYYY-MM-DD
      deposito_drive,     // true | false  (FLAG UNICO DEFINITIVO)
      email,              // { to:[], cc:[] }
      pdf,                // { name, data(base64) }
      excel               // opzionale (TS)
    } = JSON.parse(event.body);

    if (!societa || !modulo || !tipo || !data_servizio)
      throw new Error("Parametri obbligatori mancanti");

    /* =====================================================
       AUTH GOOGLE (usata SOLO se deposito_drive === true)
    ===================================================== */
    let drive = null;
    if (deposito_drive === true) {
      const auth = new google.auth.JWT(
        process.env.GCP_CLIENT_EMAIL,
        null,
        process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
        ["https://www.googleapis.com/auth/drive"]
      );
      drive = google.drive({ version: "v3", auth });
    }

    /* =====================================================
       UPLOAD DRIVE (SOLO SE DEFINITIVO)
    ===================================================== */
    let pdfLink = null;
    let excelLink = null;

    if (deposito_drive === true && drive) {
      const parentId = await buildTree(drive, societa, modulo, data_servizio);

      if (pdf) {
        const resPdf = await drive.files.create({
          requestBody: { name: pdf.name, parents: [parentId] },
          media: {
            mimeType: "application/pdf",
            body: Buffer.from(pdf.data, "base64")
          },
          fields: "id"
        });
        pdfLink = `https://drive.google.com/file/d/${resPdf.data.id}/view`;
      }

      if (tipo === "TS" && excel) {
        const resXls = await drive.files.create({
          requestBody: { name: excel.name, parents: [parentId] },
          media: {
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            body: Buffer.from(excel.data, "base64")
          },
          fields: "id"
        });
        excelLink = `https://drive.google.com/file/d/${resXls.data.id}/view`;
      }
    }

    /* =====================================================
       INVIO EMAIL
    ===================================================== */
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PWD
      }
    });

    // Allegati: SOLO checklist (sempre), TS mai
    const attachments = [];
    if (tipo === "CHECKLIST" && pdf) {
      attachments.push({
        filename: pdf.name,
        content: Buffer.from(pdf.data, "base64")
      });
    }

    let text = `Documento: ${modulo}\nSocietà: ${societa}\nData: ${data_servizio}\n`;

    if (deposito_drive === true) {
      if (pdfLink)   text += `\nPDF su Drive: ${pdfLink}`;
      if (excelLink) text += `\nExcel su Drive: ${excelLink}`;
    } else {
      text += `\nModalità TEST / SCUOLA (nessun deposito su Drive)`;
    }

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email?.to || [],
      cc: email?.cc || [],
      subject: `${modulo} – ${societa}`,
      text,
      attachments
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        definitivo: deposito_drive === true,
        pdfLink,
        excelLink
      })
    };

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
