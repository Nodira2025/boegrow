-- =====================================================
-- BO growclub V3 - Migration SQL
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar columna precio de costo (cost_price)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price DOUBLE PRECISION DEFAULT 0;

-- Verificar
SELECT 'Migration V3 completada exitosamente: cost_price agregado' AS status;
