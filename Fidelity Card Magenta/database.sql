-- Esquema relacional para migrar la app a SQLite, PostgreSQL o Supabase.
-- La versión actual de la interfaz persiste este mismo modelo en localStorage.

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checkin_key TEXT NOT NULL UNIQUE,
  promotions_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (promotions_redeemed >= 0)
);

CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX visits_client_id_idx ON visits(client_id);

-- Consulta que alimenta la pantalla "Registros".
CREATE VIEW client_loyalty_records AS
SELECT
  c.id AS client_id,
  c.name,
  COUNT(v.id) AS visits_registered,
  c.promotions_redeemed
FROM clients c
LEFT JOIN visits v ON v.client_id = c.id
GROUP BY c.id, c.name, c.promotions_redeemed;
