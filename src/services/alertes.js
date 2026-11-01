const db = require('../config/database');

// Appelée après la publication d'un trajet : une notification par alerte correspondante
async function verifierAlertes(trajet) {
  const { rows: alertes } = await db.query(
    `SELECT idalerte, iduser FROM alerte a
     WHERE a.actif = true AND a.deleted_at IS NULL
       AND $1 ILIKE '%' || a.lieu_depart || '%'
       AND $2 ILIKE '%' || a.lieu_arrivee || '%'
       AND (a.jours_semaine IS NULL
            OR extract(isodow from $3::date)::int = ANY(a.jours_semaine))
       AND (a.heure_min IS NULL OR $4::time >= a.heure_min)
       AND (a.heure_max IS NULL OR $4::time <= a.heure_max)`,
    [trajet.lieu_depart, trajet.lieu_arrivee, trajet.datedepart, trajet.heuredepart]
  );

  const message =
    `Nouveau trajet ${trajet.lieu_depart} → ${trajet.lieu_arrivee} ` +
    `le ${trajet.datedepart} à ${String(trajet.heuredepart).slice(0, 5)}`;

  for (const a of alertes) {
    await db.query(
      `INSERT INTO notification (iduser, idalerte, idtrajet, message)
       VALUES ($1, $2, $3, $4)`,
      [a.iduser, a.idalerte, trajet.idtrajet || null, message]
    );
  }
  return alertes.length;
}

module.exports = { verifierAlertes };