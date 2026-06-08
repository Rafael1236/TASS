-- Add "Otros" (custom) activity to the catalog so the wizard "Otros" checkbox works with a real catalog ID
INSERT INTO subcontratos_actividades_catalogo (nombre, descripcion)
VALUES ('Otros', 'Actividad personalizada')
ON CONFLICT (nombre) DO NOTHING;
