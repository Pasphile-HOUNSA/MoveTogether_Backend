const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Créer une alerte
router.post('/', async (req, res) => {
  const { iduser, lieu_depart, lieu_arrivee, jours_semaine, heure_min, heure_max } = req.body;

  if (!iduser || !lieu_depart || !lieu_arrivee) {
    return res.status(400).json({ error: 'iduser, lieu_depart et lieu_arrivee sont obligatoires' });
  }
  if (jours_semaine && (!Array.isArray(jours_semaine) ||
      jours_semaine.some(j => !Number.isInteger(j) || j < 1 || j > 7))) {
    return res.status(400).json({ error: 'jours_semaine doit contenir des entiers de 1 à 7' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO alerte (iduser, lieu_depart, lieu_arrivee, jours_semaine, heure_min, heure_max)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [iduser, lieu_depart, lieu_arrivee, jours_semaine || null, heure_min || null, heure_max || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la création de l'alerte" });
  }
});

// Lister les alertes d'un utilisateur : GET /alertes?iduser=1
router.get('/', async (req, res) => {
  const { iduser } = req.query;
  if (!iduser) return res.status(400).json({ error: 'iduser requis' });
  try {
    const { rows } = await db.query(
      `SELECT * FROM alerte WHERE iduser = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [iduser]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des alertes' });
  }
});

// Notifications d'un utilisateur : GET /alertes/notifications?iduser=1
// (déclarée avant /:id pour ne pas être confondue avec un identifiant)
router.get('/notifications', async (req, res) => {
  const { iduser } = req.query;
  if (!iduser) return res.status(400).json({ error: 'iduser requis' });
  try {
    const { rows } = await db.query(
      `SELECT * FROM notification WHERE iduser = $1 ORDER BY created_at DESC LIMIT 50`,
      [iduser]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

// Marquer une notification comme lue
router.put('/notifications/:id/lu', async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE notification SET lu = true WHERE idnotification = $1 RETURNING *',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Notification introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Activer / désactiver ou modifier une alerte : PUT /alertes/1 avec { "actif": false }
router.put('/:id', async (req, res) => {
  const { actif, jours_semaine, heure_min, heure_max } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE alerte SET
         actif         = COALESCE($1, actif),
         jours_semaine = COALESCE($2, jours_semaine),
         heure_min     = COALESCE($3, heure_min),
         heure_max     = COALESCE($4, heure_max),
         updated_at    = now()
       WHERE idalerte = $5 AND deleted_at IS NULL
       RETURNING *`,
      [actif, jours_semaine, heure_min, heure_max, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Alerte introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la modification de l'alerte" });
  }
});

// Supprimer une alerte (suppression logique)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE alerte SET deleted_at = now(), actif = false, updated_at = now()
       WHERE idalerte = $1 AND deleted_at IS NULL RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Alerte introuvable' });
    res.json({ message: 'Alerte supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la suppression de l'alerte" });
  }
});

module.exports = router;