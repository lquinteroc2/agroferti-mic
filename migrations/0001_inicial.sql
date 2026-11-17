-- AgroFerti MIC: datos en la nube (Cloudflare D1, plan gratuito).
-- Cada usuario es una cuenta de Google, identificada por `sub` (nunca por el correo).

CREATE TABLE usuarios (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT,
  -- Autorización de tratamiento de datos (Ley 1581 de 2012): sin ella no se guarda nada.
  consentimiento_at TEXT NOT NULL,
  creado_at TEXT NOT NULL
);

-- Copia en la nube de los registros del teléfono, tal como están guardados allí (JSON).
-- El servidor no interpreta los datos: la app los verifica al leerlos, como con la copia JSON.
CREATE TABLE registros (
  usuario TEXT NOT NULL,
  tabla TEXT NOT NULL,
  id TEXT NOT NULL,
  -- JSON del registro; NULL si se eliminó (marca de borrado para los demás dispositivos).
  datos TEXT,
  -- updatedAt del registro en el teléfono: gana la versión más reciente.
  actualizado TEXT NOT NULL,
  -- Contador por usuario: cada cambio recibe uno mayor. Los dispositivos piden "lo posterior a N".
  version INTEGER NOT NULL,
  PRIMARY KEY (usuario, tabla, id)
);

CREATE INDEX registros_por_version ON registros (usuario, version);
