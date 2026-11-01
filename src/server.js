const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Route de test de l'API et de la BDD
app.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      message: "Bienvenue sur l'API de MoveTogether !",
      dbTime: result.rows[0].now
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur de connexion à la base de données" });
  }
});

const trajetsRouter = require('./routes/trajets');
app.use('/trajets', trajetsRouter);

const lieuxRouter = require('./routes/lieux');
app.use('/lieux', lieuxRouter);

const recurrentsRouter = require('./routes/recurrents');
app.use('/recurrents', recurrentsRouter);

const alertesRouter = require('./routes/alertes');
app.use('/alertes', alertesRouter);

app.listen(PORT, () => {
  console.log(`Serveur backend démarré sur le port ${PORT}`);
});