-- Referencias técnicas (19 de noviembre de 2026): fertilizantes comerciales registrados ante el ICA
-- con precios de referencia DANE-SIPSA, reglas de dosis y niveles de interpretación del análisis de
-- suelo, cada una con su fuente publicada. Las mismas para todos los usuarios; solo se leen desde la app.
-- Se cargan con `npm run referencias:nube` a partir de los archivos de data/referencias/.

CREATE TABLE referencias (
  -- fertilizante | dosis | nivel
  tipo TEXT NOT NULL,
  id TEXT NOT NULL,
  -- JSON de la referencia, con su fuente.
  datos TEXT NOT NULL,
  PRIMARY KEY (tipo, id)
);

-- Versión del conjunto: cambia en cada carga, para que los teléfonos solo descarguen si hay cambios.
CREATE TABLE referencias_meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
