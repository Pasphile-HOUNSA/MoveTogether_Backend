const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Dates correspondant aux jours choisis entre deux dates (1 = lundi ... 7 = dimanche)
function genererDates(dateDebut, dateFin, jours) {
  const dates = [];
  const d = new Date(dateDebut + 'T00:00:00Z');
  const fin = new Date(dateFin + 'T00:00:00Z');
  while (d <= fin) {
    const js = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (jours.includes(js)) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// Créer une série et générer ses occurrences
router.post('/', async (req, res) => {
  const {
    idcar, jours_semaine, heuredepart, price, placesdispo,
    lieu_depart, lieu_arrivee, idzone_depart, idzone_arrivee,
    date_debut, date_fin
  } = req.body;

  if (!idcar || !Array.isArray(jours_semaine) || jours_semaine.length === 0 ||
      !heuredepart || price == null || !placesdispo ||
      !lieu_depart || !lieu_arrivee || !date_debut || !date_fin) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  if (jours_semaine.some(j => !Number.isInteger(j) || j < 1 || j > 7)) {
    return res.status(400).json({ error: 'jours_semaine doit contenir des entiers de 1 à 7' });
  }

  const dates = genererDates(date_debut, date_fin, jours_semaine);
  if (dates.length === 0) {
    return res.status(400).json({ error: 'Aucune date générée pour cette période' });
  }
  if (dates.length > 100) {
    return res.status(400).json({ error: 'Période trop longue (100 occurrences maximum)' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const serie = await client.query(
      `INSERT INTO trajet_recurrent
        (idcar, jours_semaine, heuredepart, price, placesdispo,
         lieu_depart, lieu_arrivee, idzone_depart, idzone_arrivee, date_debut, date_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [idcar, jours_semaine, heuredepart, price, placesdispo,
       lieu_depart, lieu_arrivee, idzone_depart || null, idzone_arrivee || null,
       date_debut, date_fin]
    );
    const idrecurrence = serie.rows[0].idrecurrence;

    for (const date of dates) {
      await client.query(
        `INSERT INTO trajet
          (idcar, datedepart, heuredepart, price, placesdispo, statut,
           lieu_depart, lieu_arrivee, idzone_depart, idzone_arrivee, idrecurrence)
         VALUES ($1,$2,$3,$4,$5,'en attente',$6,$7,$8,$9,$10)`,
        [idcar, date, heuredepart, price, placesdispo,
         lieu_depart, lieu_arrivee, idzone_depart || null, idzone_arrivee || null,
         idrecurrence]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ serie: serie.rows[0], occurrences_creees: dates.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la création de la série' });
  } finally {
    client.release();
  }
});

// Détail d'une série avec ses occurrences
router.get('/:id', async (req, res) => {
  try {
    const serie = await db.query(
      'SELECT * FROM trajet_recurrent WHERE idrecurrence = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (serie.rows.length === 0) {
      return res.status(404).json({ error: 'Série introuvable' });
    }
    const occurrences = await db.query(
      `SELECT * FROM trajet
       WHERE idrecurrence = $1 AND deleted_at IS NULL
       ORDER BY datedepart, heuredepart`,
      [req.params.id]
    );
    res.json({ serie: serie.rows[0], occurrences: occurrences.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération de la série' });
  }
});

// Modifier toute la série : modèle + occurrences futures encore "en attente"
// (pour une seule occurrence, utiliser PUT /trajets/:id)
router.put('/:id', async (req, res) => {
  const { heuredepart, price, lieu_depart, lieu_arrivee } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const serie = await client.query(
      `UPDATE trajet_recurrent SET
         heuredepart  = COALESCE($1, heuredepart),
         price        = COALESCE($2, price),
         lieu_depart  = COALESCE($3, lieu_depart),
         lieu_arrivee = COALESCE($4, lieu_arrivee),
         updated_at   = now()
       WHERE idrecurrence = $5 AND deleted_at IS NULL
       RETURNING *`,
      [heuredepart, price, lieu_depart, lieu_arrivee, req.params.id]
    );
    if (serie.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Série introuvable' });
    }

    const occ = await client.query(
      `UPDATE trajet SET
         heuredepart  = COALESCE($1, heuredepart),
         price        = COALESCE($2, price),
         lieu_depart  = COALESCE($3, lieu_depart),
         lieu_arrivee = COALESCE($4, lieu_arrivee),
         updated_at   = now()
       WHERE idrecurrence = $5 AND deleted_at IS NULL
         AND statut = 'en attente' AND datedepart >= current_date`,
      [heuredepart, price, lieu_depart, lieu_arrivee, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ serie: serie.rows[0], occurrences_modifiees: occ.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la modification de la série' });
  } finally {
    client.release();
  }
});

// Annuler la série : suppression logique des occurrences futures
router.delete('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const serie = await client.query(
      `UPDATE trajet_recurrent SET deleted_at = now(), updated_at = now()
       WHERE idrecurrence = $1 AND deleted_at IS NULL
       RETURNING *`,
      [req.params.id]
    );
    if (serie.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Série introuvable' });
    }

    const occ = await client.query(
      `UPDATE trajet SET deleted_at = now(), statut = 'annulé', updated_at = now()
       WHERE idrecurrence = $1 AND deleted_at IS NULL
         AND statut = 'en attente' AND datedepart >= current_date`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Série annulée', occurrences_annulees: occ.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'annulation de la série" });
  } finally {
    client.release();
  }
});

module.exports = router;