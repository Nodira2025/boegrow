-- =====================================================
-- BO growclub V5 - Database Migration SQL
-- Ejecutar este script en el SQL Editor de Supabase
-- para habilitar la cancelación de ventas y cajas
-- =====================================================

-- 1. Agregar columna status a la tabla sales si no existe
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled'));

-- 2. Actualizar restricción de estado en cash_registers
-- Para evitar errores de duplicidad, primero eliminamos la restricción si existe
ALTER TABLE public.cash_registers DROP CONSTRAINT IF EXISTS cash_registers_status_check;
ALTER TABLE public.cash_registers ADD CONSTRAINT cash_registers_status_check CHECK (status IN ('open', 'closed', 'cancelled'));

-- 3. Insertar usuario superadmin
INSERT INTO public.profiles (name, role, username, password, phone)
VALUES ('Super Administrador', 'admin', 'superadmin', 'Qwertyui2026', '+5491100000000')
ON CONFLICT (username) 
DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;

SELECT 'Base de datos actualizada con soporte para cancelaciones y superadmin (V5)' AS status;
