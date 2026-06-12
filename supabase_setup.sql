-- =====================================================
-- BO growclub - Database Setup SQL
-- Ejecutar este script COMPLETO en el SQL Editor de Supabase
-- =====================================================

-- 1. PROFILES TABLE (empleados y usuarios)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'vendedor')),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  barcode TEXT UNIQUE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SALES TABLE
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.profiles(id),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  register_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SALE ITEMS
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- 5. CASH REGISTERS
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.profiles(id),
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(12, 2),
  declared_cash NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- 6. ATTENDANCE
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.profiles(id),
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. CASH FLOWS (ingresos/egresos extra)
CREATE TABLE IF NOT EXISTS public.cash_flows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  register_id UUID REFERENCES public.cash_registers(id),
  user_id UUID REFERENCES public.profiles(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. NOTIFICATIONS (in-app)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_role TEXT,
  recipient_id UUID,
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- DISABLE RLS for easy development (enable later for production)
-- =====================================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flows DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- SEED DATA - Usuarios de prueba
-- =====================================================
INSERT INTO public.profiles (name, role, username, password, phone) VALUES
  ('Administrador', 'admin', 'admin', 'admin123', '+5491100000001'),
  ('Supervisor', 'supervisor', 'super', 'super123', '+5491100000002'),
  ('Vendedor 1', 'vendedor', 'vende1', 'vende123', '+5491100000003'),
  ('Vendedor 2', 'vendedor', 'vende2', 'vende456', '+5491100000004')
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- SEED DATA - Productos de ejemplo
-- =====================================================
INSERT INTO public.products (name, price, stock, category) VALUES
  ('Top Crop Big One 250ml', 4500, 20, 'Fertilizantes'),
  ('Sustrato Growmix Multipro 80L', 12000, 15, 'Sustratos'),
  ('LED Galponera 50W', 8500, 10, 'Iluminación'),
  ('Maceta Air Pot 10L', 3200, 30, 'Macetas'),
  ('pH Tester Digital', 6800, 8, 'Medición'),
  ('Tijera de Poda Fiskars', 5500, 12, 'Herramientas')
ON CONFLICT DO NOTHING;
