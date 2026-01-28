/* =====================================================
   load-config.js
   Carica la configurazione della società dal backend
   e la salva in IMPOSTAZIONI_MISERICORDIA (invariata)
===================================================== */

async function loadConfigurazioneSocieta() {
  try {
    // 1️⃣ Codice società salvato sul tablet
    const societa = localStorage.getItem('CODICE_SOCIETA');
    if (!societa) {
      console.warn('⚠️ CODICE_SOCIETA non impostato');
      return false;
    }

    // 2️⃣ Chiamata al backend (Netlify Function)
    const res = await fetch(
      `/.netlify/functions/get-config?societa=${encodeURIComponent(societa)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      console.error('❌ Errore caricamento configurazione:', res.status);
      return false;
    }

    const cfg = await res.json();

    // 3️⃣ Salvataggio IDENTICO a prima
    localStorage.setItem(
      'IMPOSTAZIONI_MISERICORDIA',
      JSON.stringify(cfg)
    );

    console.log('✅ Configurazione società caricata:', societa);
    return true;

  } catch (e) {
    console.error('❌ loadConfigurazioneSocieta error:', e);
    return false;
  }
}

/* =====================================================
   Helper opzionale:
   assicura che la config sia caricata prima di usarla
===================================================== */
async function ensureConfigurazioneSocieta() {
  const raw = localStorage.getItem('IMPOSTAZIONI_MISERICORDIA');
  if (raw) return true;
  return await loadConfigurazioneSocieta();
}
