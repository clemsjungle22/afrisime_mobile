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
