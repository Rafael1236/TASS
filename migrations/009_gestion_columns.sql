-- ── 009: Gestión module — extended schema columns ────────────────────────────
-- Run in Supabase Dashboard > SQL Editor

-- Extended fields for subcontratos_tecnicos
ALTER TABLE subcontratos_tecnicos ADD COLUMN IF NOT EXISTS dui VARCHAR(20);
ALTER TABLE subcontratos_tecnicos ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE subcontratos_tecnicos ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;
ALTER TABLE subcontratos_tecnicos ADD COLUMN IF NOT EXISTS tiene_isss BOOLEAN DEFAULT false;
ALTER TABLE subcontratos_tecnicos ADD COLUMN IF NOT EXISTS fecha_vencimiento_examenes DATE;

-- Leader and address fields for subcontratos_empresas
ALTER TABLE subcontratos_empresas ADD COLUMN IF NOT EXISTS lider_empresa VARCHAR(100);
ALTER TABLE subcontratos_empresas ADD COLUMN IF NOT EXISTS direccion TEXT;

-- CRM fields for clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_sn VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nit VARCHAR(30);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS registro_fiscal VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correo_cliente VARCHAR(200);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cargo_contacto VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS facturar_a VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS segmento VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS sitio_web VARCHAR(200);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_ultimo_contacto DATE;

-- Extended fields for usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dui VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;
