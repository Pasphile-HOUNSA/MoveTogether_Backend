const express = require('express');
const router = express.Router();

const HEADERS = { 'User-Agent': 'MoveTogether/1.0 (movetogether408@gmail.com)' };

// Autocomplétion : GET /lieux/search?q=Coto
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=bj&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    res.json(data.map(p => ({
      nom: p.display_name,
      lat: parseFloat(p.lat),
      lon: parseFloat(p.lon)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la recherche de lieux' });
  }
});

// Distance et durée : GET /lieux/distance?from=Cotonou&to=Porto-Novo
router.get('/distance', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Paramètres from et to requis' });

  try {
    const geocode = async (nom) => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bj&q=${encodeURIComponent(nom)}`;
      const r = await fetch(url, { headers: HEADERS });
      const d = await r.json();
      return d[0] ? { lat: d[0].lat, lon: d[0].lon } : null;
    };

    const a = await geocode(from);
    const b = await geocode(to);
    if (!a || !b) return res.status(404).json({ error: 'Lieu introuvable' });

    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.routes || !d.routes[0]) return res.status(404).json({ error: 'Itinéraire introuvable' });

    res.json({
      distance_km: Math.round(d.routes[0].distance / 100) / 10,
      duree_min: Math.round(d.routes[0].duration / 60)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du calcul de la distance' });
  }
});

module.exports = router;