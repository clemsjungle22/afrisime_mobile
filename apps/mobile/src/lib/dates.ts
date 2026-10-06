/**
 * Formatage de dates sans Intl (support variable selon les moteurs Hermes Android).
 * Affichage en heure locale du téléphone (Africa/Lome = UTC+0 au Togo).
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 06/10 à 14:30 */
export function formatShortDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Durée restante au format 05:42:09 (heures non plafonnées). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * Créneaux : affichés à l'heure de Lomé (UTC+0 toute l'année), quel que soit le fuseau du téléphone.
 * « Aujourd'hui », « Demain », puis « Mer. 8 oct. ».
 */
export function formatSlotDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** « 8h–12h » (heure de Lomé). */
export function formatSlotHours(startIso: string, endIso: string): string {
  const h = (iso: string) => {
    const d = new Date(iso);
    const m = d.getUTCMinutes();
    return `${d.getUTCHours()}h${m ? pad(m) : ''}`;
  };
  return `${h(startIso)}–${h(endIso)}`;
}

/** Clé de regroupement par jour (heure de Lomé). */
export function slotDayKey(iso: string): string {
  return iso.slice(0, 10);
}
