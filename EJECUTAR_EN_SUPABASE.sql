-- =====================================================
-- EJECUTAR ESTE SQL COMPLETO EN SUPABASE SQL EDITOR
-- (Supabase Dashboard > SQL Editor > New Query > Pegar > Run)
-- =====================================================

-- PASO 1: Desactivar RLS en todas las tablas
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_registers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_flows DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;

-- PASO 2: Agregar columnas username y password si no existen
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;

-- PASO 3: Si tenias columna "pin", la eliminamos
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin;

-- PASO 4: Limpiar e insertar los usuarios de prueba
DELETE FROM public.profiles;

INSERT INTO public.profiles (name, role, username, password) VALUES
  ('Administrador', 'admin', 'admin', 'admin123'),
  ('Supervisor', 'supervisor', 'super', 'super123'),
  ('Vendedor 1', 'vendedor', 'vende1', 'vende123'),
  ('Vendedor 2', 'vendedor', 'vende2', 'vende456');

-- PASO 5: Insertar productos de ejemplo
INSERT INTO public.products (name, price, stock, category) VALUES
  ('Top Crop Big One 250ml', 4500, 20, 'Fertilizantes'),
  ('Sustrato Growmix Multipro 80L', 12000, 15, 'Sustratos'),
  ('LED Galponera 50W', 8500, 10, 'Iluminacion'),
  ('Maceta Air Pot 10L', 3200, 30, 'Macetas'),
  ('pH Tester Digital', 6800, 8, 'Medicion'),
  ('Tijera de Poda Fiskars', 5500, 12, 'Herramientas')
ON CONFLICT DO NOTHING;

-- PASO 6: Verificar que se insertaron bien
SELECT id, name, role, username, password FROM public.profiles;
