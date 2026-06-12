-- =====================================================
-- BO growclub V4 - Database Alignment SQL
-- Ejecutar este script en el SQL Editor de Supabase
-- para alinear las columnas de productos e historial
-- =====================================================

-- 1. Agregar columnas a products si no existen
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_barcode_key'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);
    END IF;
END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price DOUBLE PRECISION DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price_usd DOUBLE PRECISION DEFAULT 0;

-- 2. Asegurar que las columnas de geolocalización e historial existen
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 3. Crear la tabla de historial de inventario si no existe
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

-- Desactivar RLS
ALTER TABLE public.product_logs DISABLE ROW LEVEL SECURITY;

SELECT 'Base de datos alineada correctamente con las columnas de V4' AS status;
