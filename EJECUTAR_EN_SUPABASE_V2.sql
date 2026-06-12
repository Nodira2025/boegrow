-- =====================================================
-- BO growclub V2 - Migration SQL
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Nuevas columnas para productos (foto, GPS, tracking)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Tabla de historial de inventario
CREATE TABLE IF NOT EXISTS public.product_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'deleted')),
  details JSONB,
  seen_by_supervisor BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_logs DISABLE ROW LEVEL SECURITY;

-- Verificar
SELECT 'Migration V2 completada exitosamente' AS status;
