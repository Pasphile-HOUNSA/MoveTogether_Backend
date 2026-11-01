require('dotenv').config();

const { Pool, types } = require('pg');
types.setTypeParser(1082, (val) => val); // 1082 = type DATE : garder le texte tel quel

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Nécessaire pour les connexions distantes sécurisées comme Supabase
  }
});

pool.on('connect', () => {
  console.log('Connecté à la base de données PostgreSQL (Supabase) avec succès !');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};