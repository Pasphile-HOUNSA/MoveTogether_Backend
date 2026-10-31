const express = require('express');
const db = require('../config/database');

const router = express.Router();

// 2.1 Créer un trajet
router.post('/', async (req, res) => {
  const {
    idcar, datedepart, heuredepart, price, placesdispo, statut,
    lieu_depart, lieu_arrivee, idzone_depart, idzone_arrivee
  } = req.body;

  if (!idcar || !datedepart || !heuredepart || price == null ||
      !placesdispo || !lieu_depart || !lieu_arrivee) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO trajet
        (idcar, datedepart, heuredepart, price, placesdispo, statut,
         lieu_depart, lieu_arrivee, idzone_depart, idzone_arrivee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [idcar, datedepart, heuredepart, price, placesdispo, statut || 'en attente',
       lieu_depart, lieu_arrivee, idzone_depart || null, idzone_arrivee || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la création du trajet' });
  }
});

// 2.2 + 2.3 Liste paginée avec recherche par critères
// Exemple : GET /trajets?lieu_depart=Cotonou&lieu_arrivee=Porto-Novo&date=2026-11-05&max_price=3000
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const offset = (page - 1) * limit;

  const { lieu_depart, lieu_arrivee, date, max_price } = req.query;

  const conditions = [
    'deleted_at IS NULL',
    "statut = 'en attente'",
    '(datedepart + heuredepart) > now()',
    'placesdispo > 0'
  ];
  const params = [];

  if (lieu_depart) {
    params.push(`%${lieu_depart}%`);
    conditions.push(`lieu_depart ILIKE $${params.length}`);
  }
  if (lieu_arrivee) {
    params.push(`%${lieu_arrivee}%`);
    conditions.push(`lieu_arrivee ILIKE $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`datedepart = $${params.length}`);
  }
  if (max_price) {
    params.push(max_price);
    conditions.push(`price <= $${params.length}`);
  }

  params.push(limit, offset);

  try {
    const { rows } = await db.query(
      `SELECT * FROM trajet
       WHERE ${conditions.join(' AND ')}
       ORDER BY datedepart ASC, heuredepart ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ page, limit, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des trajets' });
  }
});

// 2.4 Détail d'un trajet
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM trajet WHERE idtrajet = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trajet introuvable' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération du trajet' });
  }
});

// 2.5 Modifier un trajet
router.put('/:id', async (req, res) => {
  const { datedepart, heuredepart, price, placesdispo, statut,
          lieu_depart, lieu_arrivee } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE trajet SET
         datedepart   = COALESCE($1, datedepart),
         heuredepart  = COALESCE($2, heuredepart),
         price        = COALESCE($3, price),
         placesdispo  = COALESCE($4, placesdispo),
         statut       = COALESCE($5, statut),
         lieu_depart  = COALESCE($6, lieu_depart),
         lieu_arrivee = COALESCE($7, lieu_arrivee),
         updated_at   = now()
       WHERE idtrajet = $8 AND deleted_at IS NULL
       RETURNING *`,
      [datedepart, heuredepart, price, placesdispo, statut,
       lieu_depart, lieu_arrivee, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trajet introuvable' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la modification du trajet' });
  }
});

// 2.5 Annuler un trajet (suppression logique)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE trajet SET deleted_at = now(), statut = 'annulé', updated_at = now()
       WHERE idtrajet = $1 AND deleted_at IS NULL
       RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trajet introuvable' });
    }
    res.json({ message: 'Trajet annulé', trajet: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'annulation du trajet" });
  }
});

module.exports = router;