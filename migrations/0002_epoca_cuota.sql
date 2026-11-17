-- Correcciones de la revisión del backend (17 de noviembre de 2026).

-- Época de la cuenta: cambia si la cuenta se borra y se vuelve a crear. Va dentro de la sesión, así
-- las sesiones anteriores al borrado dejan de servir, y los dispositivos saben que deben subir todo de nuevo.
ALTER TABLE usuarios ADD COLUMN epoca TEXT NOT NULL DEFAULT '';
UPDATE usuarios SET epoca = lower(hex(randomblob(16))) WHERE epoca = '';

-- Versión del texto de autorización (Ley 1581) que aceptó el usuario.
ALTER TABLE usuarios ADD COLUMN consentimiento_version TEXT NOT NULL DEFAULT '';

-- Uso de cada cuenta, para la cuota que protege el almacenamiento gratuito compartido. Lo mantienen
-- los disparadores: así no hay que contar las filas de la cuenta en cada sincronización.
ALTER TABLE usuarios ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN filas INTEGER NOT NULL DEFAULT 0;
UPDATE usuarios SET
  bytes = COALESCE((SELECT SUM(COALESCE(length(datos), 0)) FROM registros WHERE registros.usuario = usuarios.sub), 0),
  filas = (SELECT COUNT(*) FROM registros WHERE registros.usuario = usuarios.sub);

CREATE TRIGGER registros_al_insertar AFTER INSERT ON registros BEGIN
  UPDATE usuarios SET bytes = bytes + COALESCE(length(NEW.datos), 0), filas = filas + 1 WHERE sub = NEW.usuario;
END;

CREATE TRIGGER registros_al_actualizar AFTER UPDATE OF datos ON registros BEGIN
  UPDATE usuarios SET bytes = bytes + COALESCE(length(NEW.datos), 0) - COALESCE(length(OLD.datos), 0) WHERE sub = NEW.usuario;
END;

CREATE TRIGGER registros_al_borrar AFTER DELETE ON registros BEGIN
  UPDATE usuarios SET bytes = bytes - COALESCE(length(OLD.datos), 0), filas = filas - 1 WHERE sub = OLD.usuario;
END;
