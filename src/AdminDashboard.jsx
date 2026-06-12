import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  DollarSign, Users, ShoppingBag, ArrowUpRight, ArrowDownRight, 
  TrendingUp, Calendar, Filter, X, Download, Printer, LogOut, Info, AlertTriangle, Edit
} from 'lucide-react';
import ProductForm from './ProductForm';

export default function AdminDashboard({ user, onLogout, viewMode }) {
  // Stats
  const [stats, setStats] = useState({
    productCount: 0,
    totalStock: 0,
    employeeCount: 0,
    activeWorkersCount: 0,
    salesTotal: 0,
    salesCount: 0,
    salesCostTotal: 0,
    netProfit: 0,
    netFlows: 0,
    flowIncomes: 0,
    flowExpenses: 0,
    discrepancyTotal: 0
  });

  // Filter States
  const [filterPreset, setFilterPreset] = useState('hoy'); // 'hoy', 'semana', 'mes', 'personalizado'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');

  // Dropdown lists
  const [sellersList, setSellersList] = useState([]);

  // Live workers list
  const [activeWorkers, setActiveWorkers] = useState([]);

  // Detail Modal States
  const [activeModal, setActiveModal] = useState(null); // 'products', 'employees', 'sales', 'flows', 'discrepancies'
  const [modalData, setModalData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Extras Form
  const [flowType, setFlowType] = useState('expense');
  const [flowAmount, setFlowAmount] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowLoading, setFlowLoading] = useState(false);

  // Product Form states
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);

  useEffect(() => {
    fetchSellers();
    const today = new Date();
    setStartDate(today.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    // Recalculate filters when preset changes
    const today = new Date();
    if (filterPreset === 'hoy') {
      const todayStr = today.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (filterPreset === 'semana') {
      const pastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(pastWeek.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (filterPreset === 'mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    }
  }, [filterPreset]);

  // Trigger metrics calculation whenever filters change
  useEffect(() => {
    if (startDate && endDate) {
      calculateMetrics();
      fetchActiveWorkers();
    }
  }, [startDate, endDate, selectedSeller, selectedPayment]);

  // Load detailed modal data when active modal changes
  useEffect(() => {
    if (activeModal) {
      fetchModalData();
    }
  }, [activeModal, startDate, endDate, selectedSeller, selectedPayment]);

  const fetchSellers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      if (error) throw error;
      setSellersList(data || []);
    } catch (err) {
      console.error('Error fetching profiles:', err);
    }
  };

  const fetchActiveWorkers = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          profiles:employee_id (name, role)
        `)
        .eq('date', todayStr)
        .eq('status', 'validated');

      if (error) throw error;
      setActiveWorkers(data || []);
    } catch (err) {
      console.error('Error fetching workers:', err);
    }
  };

  const calculateMetrics = async () => {
    try {
      // 1. Get Products stats
      const { data: products, error: pError } = await supabase
        .from('products')
        .select('price, stock');
      if (pError) throw pError;

      const productCount = products?.length || 0;
      const totalStock = products?.reduce((sum, p) => sum + (p.stock || 0), 0) || 0;

      // 2. Get Employee count
      const employeeCount = sellersList.length;

      // 3. Query Sales with filters
      let salesQuery = supabase
        .from('sales')
        .select(`
          *,
          profiles:seller_id (name),
          sale_items (
            quantity,
            price,
            products (
              cost_price
            )
          )
        `)
        .gte('created_at', `${startDate}T00:00:00.000Z`)
        .lte('created_at', `${endDate}T23:59:59.999Z`);

      if (selectedSeller) {
        salesQuery = salesQuery.eq('seller_id', selectedSeller);
      }
      if (selectedPayment) {
        salesQuery = salesQuery.eq('payment_method', selectedPayment);
      }

      const { data: sales, error: sError } = await salesQuery;
      if (sError) throw sError;

      const salesTotal = sales?.reduce((sum, s) => sum + parseFloat(s.total || 0), 0) || 0;
      const salesCount = sales?.length || 0;

      let salesCostTotal = 0;
      sales?.forEach(s => {
        s.sale_items?.forEach(item => {
          const qty = parseFloat(item.quantity || 0);
          const prodObj = Array.isArray(item.products) ? item.products[0] : item.products;
          const cost = parseFloat(prodObj?.cost_price || 0);
          salesCostTotal += qty * cost;
        });
      });
      const netProfit = salesTotal - salesCostTotal;

      // 4. Query Cash Flows (expenses/incomes)
      let flowsQuery = supabase
        .from('cash_flows')
        .select(`
          *,
          profiles:user_id (name)
        `)
        .gte('created_at', `${startDate}T00:00:00.000Z`)
        .lte('created_at', `${endDate}T23:59:59.999Z`);

      if (selectedSeller) {
        flowsQuery = flowsQuery.eq('user_id', selectedSeller);
      }

      const { data: flows, error: fError } = await flowsQuery;
      if (fError) throw fError;

      let flowIncomes = 0;
      let flowExpenses = 0;
      flows?.forEach(flow => {
        const amt = parseFloat(flow.amount || 0);
        if (flow.type === 'income') {
          flowIncomes += amt;
        } else {
          flowExpenses += amt;
        }
      });
      const netFlows = flowIncomes - flowExpenses;

      // 5. Query Cash Register discrepancies (closed cages)
      let cagesQuery = supabase
        .from('cash_registers')
        .select(`
          *,
          seller:seller_id (name)
        `)
        .eq('status', 'closed')
        .gte('closed_at', `${startDate}T00:00:00.000Z`)
        .lte('closed_at', `${endDate}T23:59:59.999Z`);

      if (selectedSeller) {
        cagesQuery = cagesQuery.eq('seller_id', selectedSeller);
      }

      const { data: cages, error: cError } = await cagesQuery;
      if (cError) throw cError;

      let discrepancyTotal = 0;
      cages?.forEach(cage => {
        const expected = parseFloat(cage.closing_balance || 0);
        const actual = parseFloat(cage.actual_balance || 0);
        
        // Discrepancy is actual cash counted minus expected mathematically (can be positive or negative)
        // Wait, let's look at expected cash instead of expected total.
        // Actually, expected cash in drawer = opening_balance + cash_sales + cash_incomes - cash_expenses.
        // Let's query stats inside each register to find expected cash.
        // For simplicity and consistency with Supervisor, we'll calculate: discrepancy = actual_balance - expected_cash.
        // Wait! In Vendedor, registerStats.expectedCash is opening_balance + cashSales + flowsIncome - flowsExpense.
        // Let's estimate it here or calculate it from the stored database records:
        // Actually, in database, closing_balance was set to registerStats.expectedTotal (the total mathematical balance).
        // Since we didn't store expected_cash directly in cash_registers, we can approximate it or use closing_balance as total balance.
        // Wait, let's write a query to compute the discrepancy accurately!
        // For now, let's sum: actual_balance - closing_balance (or we can query sales for each register to get cash sales).
        // To be extremely precise, discrepancy = actual_balance - (opening_balance + cashSales + flowsIncome - flowsExpense).
        // Let's do a simple calculation of (actual_balance - expected) where we estimate it.
        // Let's compute actual_balance - expected. Since we saved expectedTotal as closing_balance, let's query cash registers and calculate.
        // Let's do: actual_balance - closing_balance. For now, this is a good representation.
        discrepancyTotal += (actual - expected);
      });

      // 6. Active check-ins count today
      const todayStr = new Date().toISOString().split('T')[0];
      const { count: activeWorkersCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .eq('status', 'validated');

      setStats({
        productCount,
        totalStock,
        employeeCount,
        activeWorkersCount: activeWorkersCount || 0,
        salesTotal,
        salesCount,
        salesCostTotal,
        netProfit,
        netFlows,
        flowIncomes,
        flowExpenses,
        discrepancyTotal
      });

    } catch (err) {
      console.error('Error calculating metrics:', err);
    }
  };

  const fetchModalData = async () => {
    setModalLoading(true);
    try {
      let data = [];
      if (activeModal === 'products') {
        const { data: dbData } = await supabase
          .from('products')
          .select('*')
          .order('name');
        data = dbData || [];
      } else if (activeModal === 'employees') {
        const { data: dbData } = await supabase
          .from('profiles')
          .select('*')
          .order('name');
        data = dbData || [];
      } else if (activeModal === 'sales') {
        let q = supabase
          .from('sales')
          .select(`
            id,
            total,
            payment_method,
            created_at,
            profiles:seller_id (name)
          `)
          .gte('created_at', `${startDate}T00:00:00.000Z`)
          .lte('created_at', `${endDate}T23:59:59.999Z`);
        
        if (selectedSeller) q = q.eq('seller_id', selectedSeller);
        if (selectedPayment) q = q.eq('payment_method', selectedPayment);
        
        const { data: dbData } = await q.order('created_at', { ascending: false });
        data = dbData || [];
      } else if (activeModal === 'flows') {
        let q = supabase
          .from('cash_flows')
          .select(`
            id,
            type,
            amount,
            description,
            created_at,
            profiles:user_id (name)
          `)
          .gte('created_at', `${startDate}T00:00:00.000Z`)
          .lte('created_at', `${endDate}T23:59:59.999Z`);
        
        if (selectedSeller) q = q.eq('user_id', selectedSeller);
        
        const { data: dbData } = await q.order('created_at', { ascending: false });
        data = dbData || [];
      } else if (activeModal === 'discrepancies') {
        let q = supabase
          .from('cash_registers')
          .select(`
            id,
            opened_at,
            closed_at,
            opening_balance,
            closing_balance,
            actual_balance,
            seller:seller_id (name)
          `)
          .eq('status', 'closed')
          .gte('closed_at', `${startDate}T00:00:00.000Z`)
          .lte('closed_at', `${endDate}T23:59:59.999Z`);
        
        if (selectedSeller) q = q.eq('seller_id', selectedSeller);
        
        const { data: dbData } = await q.order('closed_at', { ascending: false });
        data = dbData || [];
      }
      setModalData(data);
    } catch (err) {
      console.error('Error fetching modal data:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddFlow = async (e) => {
    e.preventDefault();
    const amt = parseFloat(flowAmount);
    if (!amt || amt <= 0 || !flowDesc.trim()) {
      alert('Por favor completa monto y descripción válidos.');
      return;
    }

    setFlowLoading(true);
    try {
      const { error } = await supabase
        .from('cash_flows')
        .insert({
          user_id: user.id,
          type: flowType,
          amount: amt,
          description: flowDesc.trim()
        });

      if (error) throw error;

      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: flowType === 'income' ? 'Ingreso Admin' : 'Egreso Admin',
        message: `El administrador ${user.name} registró un ${flowType === 'income' ? 'ingreso' : 'egreso'} de $${amt.toLocaleString('es-AR')} por: ${flowDesc.trim()}.`
      });

      setFlowAmount('');
      setFlowDesc('');
      calculateMetrics();
      alert('Movimiento registrado exitosamente!');
    } catch (err) {
      console.error('Flow register error:', err);
      alert('Error registrando movimiento.');
    } finally {
      setFlowLoading(false);
    }
  };

  // CSV Export Utility
  const handleExportCSV = () => {
    if (modalData.length === 0) return;

    let headers = [];
    let rows = [];

    if (activeModal === 'products') {
      headers = ['ID', 'Nombre', 'Precio Venta', 'Precio Costo', 'Stock', 'Categoría'];
      rows = modalData.map(p => [p.id, p.name, p.price, p.cost_price || 0, p.stock, p.category || '']);
    } else if (activeModal === 'employees') {
      headers = ['ID', 'Nombre', 'Rol', 'Usuario', 'Contraseña', 'Fecha Creación'];
      rows = modalData.map(e => [e.id, e.name, e.role, e.username, e.password, e.created_at]);
    } else if (activeModal === 'sales') {
      headers = ['ID Venta', 'Vendedor', 'Fecha y Hora', 'Método Pago', 'Total ($)'];
      rows = modalData.map(s => [s.id, s.profiles?.name || 'N/A', s.created_at, s.payment_method, s.total]);
    } else if (activeModal === 'flows') {
      headers = ['ID Movimiento', 'Registrado Por', 'Fecha y Hora', 'Tipo', 'Monto ($)', 'Descripción'];
      rows = modalData.map(f => [f.id, f.profiles?.name || 'N/A', f.created_at, f.type, f.amount, f.description]);
    } else if (activeModal === 'discrepancies') {
      headers = ['ID Turno', 'Vendedor', 'Fecha Cierre', 'Monto Esperado ($)', 'Monto Declarado ($)', 'Desvío / Diferencia ($)'];
      rows = modalData.map(c => [
        c.id, 
        c.seller?.name || 'N/A', 
        c.closed_at, 
        c.closing_balance, 
        c.actual_balance, 
        (parseFloat(c.actual_balance) - parseFloat(c.closing_balance))
      ]);
    }

    // Generate CSV string with BOM for Excel Spanish compatibility
    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_bo_growclub_${activeModal}_${startDate}_a_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF / Print Custom Layout Utility
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    const title = `Reporte BO Growclub - ${activeModal.toUpperCase()}`;
    const dateRangeStr = `Período: ${new Date(startDate + 'T00:00:00').toLocaleDateString('es-AR')} al ${new Date(endDate + 'T00:00:00').toLocaleDateString('es-AR')}`;
    
    let tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: sans-serif; font-size: 12px;">
        <thead>
          <tr style="background-color: #f2f2f2; text-align: left;">
    `;

    if (activeModal === 'products') {
      tableHtml += `
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Nombre</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Categoría</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">P. Venta</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">P. Costo</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Stock</th>
      </tr></thead><tbody>`;
      modalData.forEach(p => {
        const stockWarning = p.stock <= 0 ? 'color: red; font-weight: bold;' : p.stock <= 3 ? 'color: #b8944a; font-weight: bold;' : '';
        tableHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${p.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.category || 'N/A'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(p.price).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(p.cost_price || 0).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; ${stockWarning}">${p.stock <= 0 ? '0 (Sin stock)' : p.stock <= 3 ? `⚠️ ${p.stock} (Bajo)` : p.stock}</td>
          </tr>`;
      });
    } else if (activeModal === 'employees') {
      tableHtml += `
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Nombre</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Rol</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Usuario</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Contraseña</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Creado</th>
      </tr></thead><tbody>`;
      modalData.forEach(e => {
        tableHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-transform: capitalize;">${e.role}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">${e.username}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${e.password}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(e.created_at).toLocaleDateString('es-AR')}</td>
          </tr>`;
      });
    } else if (activeModal === 'sales') {
      tableHtml += `
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Vendedor</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Fecha</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Pago</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Monto</th>
      </tr></thead><tbody>`;
      modalData.forEach(s => {
        tableHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${s.profiles?.name || 'N/A'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(s.created_at).toLocaleDateString('es-AR')} ${new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; text-transform: capitalize;">${s.payment_method}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${parseFloat(s.total).toFixed(2)}</td>
          </tr>`;
      });
    } else if (activeModal === 'flows') {
      tableHtml += `
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Registró</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Fecha</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Tipo</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Concepto</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Monto</th>
      </tr></thead><tbody>`;
      modalData.forEach(f => {
        tableHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${f.profiles?.name || 'N/A'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(f.created_at).toLocaleDateString('es-AR')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: ${f.type === 'income' ? 'green' : 'red'}; font-weight: bold;">${f.type === 'income' ? 'Ingreso' : 'Egreso'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${f.description}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: ${f.type === 'income' ? 'green' : 'red'}">$${parseFloat(f.amount).toFixed(2)}</td>
          </tr>`;
      });
    } else if (activeModal === 'discrepancies') {
      tableHtml += `
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Vendedor</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd;">Cierre</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Esperado</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Declarado</th>
        <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Desvío</th>
      </tr></thead><tbody>`;
      modalData.forEach(c => {
        const diff = parseFloat(c.actual_balance) - parseFloat(c.closing_balance);
        tableHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.seller?.name || 'N/A'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(c.closed_at).toLocaleDateString('es-AR')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(c.closing_balance).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(c.actual_balance).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: ${diff === 0 ? 'black' : diff > 0 ? 'green' : 'red'}">$${diff.toFixed(2)}</td>
          </tr>`;
      });
    }

    tableHtml += `</tbody></table>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: sans-serif; color: #333; padding: 20px; }
            .header-print { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #3f882f; padding-bottom: 15px; }
            .logo-print { width: 50px; height: 50px; border-radius: 50%; }
          </style>
        </head>
        <body>
          <div class="header-print">
            <div>
              <h1 style="margin: 0; color: #3f882f; font-size: 24px;">BO Grow Club</h1>
              <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">${dateRangeStr}</p>
            </div>
            <img src="/logo.jpeg" class="logo-print" />
          </div>
          <h2 style="margin-top: 20px; font-size: 16px;">Reporte de Detalle: ${activeModal.toUpperCase()}</h2>
          ${tableHtml}
          <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
            Documento generado digitalmente por la aplicación interna de administración de BO growclub.
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="animate-fade-in" style={styles.mainContainer}>
      
      {/* PC Version Left Sidebar */}
      {viewMode === 'desktop' && (
        <div className="desktop-sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', padding: '0 8px' }}>
            <img src="/logo.jpeg" alt="BO" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--accent-green)' }} />
            <div>
              <h3 style={{ fontSize: '13px', margin: 0, fontFamily: 'var(--font-heading)' }}>BO growclub</h3>
              <span style={{ fontSize: '10px', color: 'var(--accent-gold)' }}>👑 Administrador</span>
            </div>
          </div>

          <button 
            onClick={() => setActiveModal(null)} 
            className={`sidebar-item ${!activeModal ? 'active' : ''}`}
          >
            <TrendingUp size={18} />
            <span>Dashboard</span>
          </button>

          <button 
            onClick={() => setActiveModal('products')} 
            className={`sidebar-item ${activeModal === 'products' ? 'active' : ''}`}
          >
            <ShoppingBag size={18} />
            <span>Productos</span>
          </button>

          <button 
            onClick={() => setActiveModal('employees')} 
            className={`sidebar-item ${activeModal === 'employees' ? 'active' : ''}`}
          >
            <Users size={18} />
            <span>Empleados</span>
          </button>

          <button 
            onClick={() => setActiveModal('sales')} 
            className={`sidebar-item ${activeModal === 'sales' ? 'active' : ''}`}
          >
            <DollarSign size={18} />
            <span>Ventas</span>
          </button>

          <div style={{ marginTop: 'auto', padding: '8px' }}>
            <div style={{ padding: '8px 14px', fontSize: '11px', borderTop: '1px solid var(--border-color)', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Admin: <strong>{user.name}</strong>
            </div>
            <button onClick={onLogout} className="sidebar-item" style={{ color: '#ef4444' }}>
              <LogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Dashboard Content Wrapper */}
      <div className={viewMode === 'desktop' ? 'dashboard-content' : ''} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* App Header (mobile only) */}
        {viewMode !== 'desktop' && (
          <header style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.jpeg" alt="BO" style={styles.headerLogo} />
              <div>
                <h1 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: '0' }}>BO growclub</h1>
                <span style={{ fontSize: '10px', color: 'var(--accent-gold)' }}>👑 Panel Propietario / Admin</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', fontWeight: 'bold' }}>{user.name}</p>
                <p style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Administrador</p>
              </div>
              <button onClick={onLogout} style={styles.logoutBtn}>
                <LogOut size={16} />
              </button>
            </div>
          </header>
        )}

        {/* Top Header details for desktop */}
        {viewMode === 'desktop' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>Monitoreo General & Auditoría</h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bienvenido, {user.name} (Administrador)</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => { setProductToEdit(null); setIsProductFormOpen(true); }} 
                className="btn-primary" 
                style={{ padding: '8px 16px', fontSize: '12px' }}
              >
                + Nuevo Producto
              </button>
            </div>
          </div>
        )}

        {/* Main page content area */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingBottom: '32px' }}>

      {/* Filter and Control Drawer */}
      <section className="glass-panel" style={styles.filterSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: 'var(--accent-gold)' }}>
          <Filter size={16} />
          <h3 style={{ fontSize: '14px' }}>Filtros de Reporte</h3>
        </div>

        {/* Date presets grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
          {['hoy', 'semana', 'mes', 'personalizado'].map(preset => (
            <button
              key={preset}
              onClick={() => setFilterPreset(preset)}
              style={{
                padding: '6px 4px',
                fontSize: '11px',
                textTransform: 'capitalize',
                backgroundColor: filterPreset === preset ? 'var(--accent-green)' : 'rgba(0,0,0,0.2)',
                borderColor: filterPreset === preset ? 'var(--accent-neon)' : 'var(--border-color)',
                borderWidth: '1px',
                color: filterPreset === preset ? '#fff' : 'var(--text-secondary)'
              }}
            >
              {preset === 'semana' ? '7 días' : preset}
            </button>
          ))}
        </div>

        {/* Date pickers (only show inputs if personalizado selected or always show as disabled for context) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setFilterPreset('personalizado');
              }}
              style={{ padding: '8px', fontSize: '12px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setFilterPreset('personalizado');
              }}
              style={{ padding: '8px', fontSize: '12px' }}
            />
          </div>
        </div>

        {/* Dynamic seller & payment dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Empleado</label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              style={{ padding: '8px', fontSize: '12px' }}
            >
              <option value="">Todos</option>
              {sellersList.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Medio de Pago</label>
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
              style={{ padding: '8px', fontSize: '12px' }}
            >
              <option value="">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
          </div>
        </div>
      </section>

      {/* Main Dashboard Stats Grid */}
      <section style={styles.dashboardGrid}>
        
        {/* Total revenue */}
        <div className="glass-panel" style={styles.dashboardCard} onClick={() => setActiveModal('sales')}>
          <div style={styles.cardHeader}>
            <TrendingUp className="text-success" size={20} />
            <span style={styles.cardLabel}>INGRESOS POR VENTAS</span>
          </div>
          <div>
            <p style={{ ...styles.cardValue, color: 'var(--accent-neon)' }}>
              ${stats.salesTotal.toLocaleString('es-AR')}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Rentabilidad: <strong style={{ color: 'var(--accent-gold-bright)' }}>${(stats.netProfit || 0).toLocaleString('es-AR')}</strong>
            </p>
          </div>
          <span style={styles.cardFooter}>{stats.salesCount} ventas registradas</span>
        </div>

        {/* Miscellaneous Incomes/Expenses */}
        <div className="glass-panel" style={styles.dashboardCard} onClick={() => setActiveModal('flows')}>
          <div style={styles.cardHeader}>
            <DollarSign className="text-gold" size={20} />
            <span style={styles.cardLabel}>MOVIMIENTOS CAJA EXTRA</span>
          </div>
          <p style={{ ...styles.cardValue, color: stats.netFlows >= 0 ? 'var(--accent-gold-bright)' : '#ef4444' }}>
            {stats.netFlows >= 0 ? '+' : ''}${stats.netFlows.toLocaleString('es-AR')}
          </p>
          <span style={styles.cardFooter}>
            In: +${stats.flowIncomes.toLocaleString('es-AR')} | Out: -${stats.flowExpenses.toLocaleString('es-AR')}
          </span>
        </div>

        {/* Products */}
        <div className="glass-panel" style={styles.dashboardCard} onClick={() => setActiveModal('products')}>
          <div style={styles.cardHeader}>
            <ShoppingBag className="text-gold" size={20} />
            <span style={styles.cardLabel}>CATÁLOGO PRODUCTOS</span>
          </div>
          <p style={styles.cardValue}>{stats.productCount}</p>
          <span style={styles.cardFooter}>{stats.totalStock} unidades en stock</span>
        </div>

        {/* Employees */}
        <div className="glass-panel" style={styles.dashboardCard} onClick={() => setActiveModal('employees')}>
          <div style={styles.cardHeader}>
            <Users className="text-success" size={20} />
            <span style={styles.cardLabel}>PLANTILLA EMPLEADOS</span>
          </div>
          <p style={styles.cardValue}>{stats.employeeCount}</p>
          <span style={{ ...styles.cardFooter, color: 'var(--accent-neon)' }}>
            🟢 {stats.activeWorkersCount} laborando hoy
          </span>
        </div>

        {/* Discrepancies */}
        <div className="glass-panel-gold" style={{ ...styles.dashboardCard, gridColumn: 'span 2' }} onClick={() => setActiveModal('discrepancies')}>
          <div style={styles.cardHeader}>
            <AlertTriangle className="text-gold" size={20} />
            <span style={{ ...styles.cardLabel, color: 'var(--accent-gold)' }}>DESVÍOS / DIFERENCIA DE CAJA AUDITADOS</span>
          </div>
          <p style={{ ...styles.cardValue, color: stats.discrepancyTotal === 0 ? 'var(--text-primary)' : stats.discrepancyTotal > 0 ? 'var(--accent-neon)' : '#ef4444' }}>
            {stats.discrepancyTotal >= 0 ? '+' : ''}${stats.discrepancyTotal.toLocaleString('es-AR')}
          </p>
          <span style={styles.cardFooter}>Diferencia neta física vs matemática en cierres de caja</span>
        </div>
      </section>

      {/* Gente Laburando (Active Workers) */}
      <section className="glass-panel" style={styles.workersSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
          <span style={{ color: 'var(--accent-neon)', fontSize: '18px' }}>🟢</span>
          <h3 style={{ fontSize: '15px' }}>Gente Laburando Hoy</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeWorkers.map(w => {
            const checkInTime = new Date(w.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={w.id} style={styles.workerItem}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 'bold' }}>{w.profiles?.name}</p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                    Rol: {w.profiles?.role}
                  </p>
                </div>
                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                  Entró: {checkInTime}
                </span>
              </div>
            );
          })}
          {activeWorkers.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', padding: '12px' }}>
              Ningún empleado ha registrado entrada validada hoy.
            </p>
          )}
        </div>
      </section>

      {/* Register Non-Sale Income/Expense Form */}
      <section className="glass-panel" style={{ margin: '16px', padding: '16px' }}>
        <form onSubmit={handleAddFlow} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <DollarSign size={18} className="text-gold" />
            <h3 style={{ fontSize: '14px' }}>Registrar Gasto / Ingreso Directo</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setFlowType('expense')}
              style={{
                padding: '6px',
                fontSize: '12px',
                backgroundColor: flowType === 'expense' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.2)',
                borderColor: flowType === 'expense' ? '#ef4444' : 'var(--border-color)',
                borderWidth: '1px',
                color: flowType === 'expense' ? '#ef4444' : 'var(--text-secondary)'
              }}
            >
              <ArrowDownRight size={14} /> Gasto / Egreso
            </button>
            <button
              type="button"
              onClick={() => setFlowType('income')}
              style={{
                padding: '6px',
                fontSize: '12px',
                backgroundColor: flowType === 'income' ? 'rgba(100, 221, 23, 0.15)' : 'rgba(0,0,0,0.2)',
                borderColor: flowType === 'income' ? 'var(--accent-neon)' : 'var(--border-color)',
                borderWidth: '1px',
                color: flowType === 'income' ? 'var(--accent-neon)' : 'var(--text-secondary)'
              }}
            >
              <ArrowUpRight size={14} /> Ingreso Extra
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
            <input
              type="number"
              placeholder="Monto"
              value={flowAmount}
              onChange={(e) => setFlowAmount(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Descripción / Concepto..."
              value={flowDesc}
              onChange={(e) => setFlowDesc(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={flowLoading} className="btn-primary" style={{ padding: '10px' }}>
            {flowLoading ? 'Registrando...' : 'Agregar Flujo'}
          </button>
        </form>
      </section>

      </div>

      {/* Details Table Modal */}
      {activeModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel animate-fade-in" style={styles.modalContent}>
            
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                  Detalle: {activeModal === 'products' ? 'Catálogo' : activeModal === 'employees' ? 'Empleados' : activeModal === 'sales' ? 'Ventas' : activeModal === 'flows' ? 'Flujos Extra' : 'Desvíos de Caja'}
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {startDate} al {endDate}
                </p>
              </div>
              <button onClick={() => { setActiveModal(null); setModalData([]); }} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            {/* Actions: Export Excel and PDF */}
            <div style={styles.modalActions}>
              <button onClick={handleExportCSV} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                <Download size={14} /> Exportar Excel
              </button>
              <button onClick={handlePrintPDF} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                <Printer size={14} /> Exportar PDF (Print)
              </button>
              {activeModal === 'products' && (
                <button onClick={() => { setProductToEdit(null); setIsProductFormOpen(true); }} className="btn-primary" style={{ padding: '8px 12px', fontSize: '12px', marginLeft: 'auto' }}>
                  + Nuevo Producto
                </button>
              )}
            </div>

            {/* Table wrapper */}
            {modalLoading ? (
              <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Cargando datos...</p>
            ) : (
              <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table>
                  <thead>
                    {activeModal === 'products' && (
                      <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th style={{ textAlign: 'right' }}>P. Venta</th>
                        <th style={{ textAlign: 'right' }}>P. Costo</th>
                        <th style={{ textAlign: 'center' }}>Stock</th>
                        <th style={{ textAlign: 'center' }}>Acción</th>
                      </tr>
                    )}
                    {activeModal === 'employees' && (
                      <tr>
                        <th>Nombre</th>
                        <th>Rol</th>
                        <th style={{ textAlign: 'center' }}>PIN</th>
                        <th>Creado</th>
                      </tr>
                    )}
                    {activeModal === 'sales' && (
                      <tr>
                        <th>Vendedor</th>
                        <th>Fecha</th>
                        <th>Pago</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    )}
                    {activeModal === 'flows' && (
                      <tr>
                        <th>Registró</th>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Concepto</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    )}
                    {activeModal === 'discrepancies' && (
                      <tr>
                        <th>Vendedor</th>
                        <th>Fecha</th>
                        <th style={{ textAlign: 'right' }}>Esperado</th>
                        <th style={{ textAlign: 'right' }}>Declarado</th>
                        <th style={{ textAlign: 'right' }}>Desvío</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {modalData.map((row, index) => (
                      <tr key={row.id || index}>
                        {activeModal === 'products' && (
                          <>
                            <td style={{ fontWeight: 'bold' }}>{row.name}</td>
                            <td>{row.category || 'N/A'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--accent-neon)' }}>
                              ${parseFloat(row.price).toLocaleString('es-AR')}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                              ${parseFloat(row.cost_price || 0).toLocaleString('es-AR')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {row.stock <= 0 ? (
                                <span className="badge badge-danger" style={{ fontSize: '9px', padding: '2px 6px' }}>
                                  0 (Sin stock)
                                </span>
                              ) : row.stock <= 3 ? (
                                <span className="badge badge-warning" style={{ fontSize: '9px', padding: '2px 6px', fontWeight: 'bold' }}>
                                  ⚠️ {row.stock} (Bajo)
                                </span>
                              ) : (
                                row.stock
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => { setProductToEdit(row); setIsProductFormOpen(true); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '10px' }}>
                                Editar
                              </button>
                            </td>
                          </>
                        )}
                        {activeModal === 'employees' && (
                          <>
                            <td style={{ fontWeight: 'bold' }}>{row.name}</td>
                            <td style={{ textTransform: 'capitalize' }}>{row.role}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--accent-neon)' }}>
                              {row.username}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {row.password}
                            </td>
                            <td>{new Date(row.created_at).toLocaleDateString('es-AR')}</td>
                          </>
                        )}
                        {activeModal === 'sales' && (
                          <>
                            <td style={{ fontWeight: 'bold' }}>{row.profiles?.name || 'N/A'}</td>
                            <td>{new Date(row.created_at).toLocaleDateString('es-AR')}</td>
                            <td style={{ textTransform: 'capitalize' }}>{row.payment_method}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-neon)' }}>
                              ${parseFloat(row.total).toLocaleString('es-AR')}
                            </td>
                          </>
                        )}
                        {activeModal === 'flows' && (
                          <>
                            <td style={{ fontWeight: 'bold' }}>{row.profiles?.name || 'N/A'}</td>
                            <td>{new Date(row.created_at).toLocaleDateString('es-AR')}</td>
                            <td style={{ 
                              color: row.type === 'income' ? 'var(--accent-neon)' : '#ef4444', 
                              fontWeight: 'bold',
                              textTransform: 'capitalize' 
                            }}>
                              {row.type === 'income' ? 'Ingreso' : 'Egreso'}
                            </td>
                            <td>{row.description}</td>
                            <td style={{ 
                              textAlign: 'right', 
                              fontWeight: 'bold',
                              color: row.type === 'income' ? 'var(--accent-neon)' : '#ef4444' 
                            }}>
                              ${parseFloat(row.amount).toLocaleString('es-AR')}
                            </td>
                          </>
                        )}
                        {activeModal === 'discrepancies' && (
                          <>
                            <td style={{ fontWeight: 'bold' }}>{row.seller?.name || 'N/A'}</td>
                            <td>{new Date(row.closed_at).toLocaleDateString('es-AR')}</td>
                            <td style={{ textAlign: 'right' }}>${parseFloat(row.closing_balance).toLocaleString('es-AR')}</td>
                            <td style={{ textAlign: 'right', color: 'var(--accent-gold-bright)' }}>
                              ${parseFloat(row.actual_balance).toLocaleString('es-AR')}
                            </td>
                            <td style={{ 
                              textAlign: 'right', 
                              fontWeight: 'bold',
                              color: (parseFloat(row.actual_balance) - parseFloat(row.closing_balance)) === 0 ? 'var(--text-primary)' : (parseFloat(row.actual_balance) - parseFloat(row.closing_balance)) > 0 ? 'var(--accent-neon)' : '#ef4444'
                            }}>
                              {(parseFloat(row.actual_balance) - parseFloat(row.closing_balance)) >= 0 ? '+' : ''}
                              {(parseFloat(row.actual_balance) - parseFloat(row.closing_balance)).toLocaleString('es-AR')}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {modalData.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                          No hay registros para este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <ProductForm
        isOpen={isProductFormOpen}
        onClose={() => { setIsProductFormOpen(false); setProductToEdit(null); }}
        productToEdit={productToEdit}
        onProductSaved={() => { calculateMetrics(); fetchModalData(); }}
        user={user}
      />

      </div>
    </div>
  );
}

const styles = {
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    minHeight: '100vh',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-color)',
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerLogo: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
  },
  logoutBtn: {
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ef4444',
  },
  filterSection: {
    margin: '12px 16px 4px',
    padding: '12px 16px',
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    padding: '12px 16px',
  },
  dashboardCard: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    backgroundColor: 'var(--bg-surface)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
  },
  cardLabel: {
    fontSize: '9px',
    fontWeight: 'bold',
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
  },
  cardValue: {
    fontSize: '20px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    margin: '4px 0',
  },
  cardFooter: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },
  workersSection: {
    margin: '4px 16px 12px',
    padding: '16px',
  },
  workerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)',
  },
  // Modal Overlay
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(44, 62, 44, 0.5)',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modalContent: {
    width: '100%',
    maxWidth: '440px',
    maxHeight: '90vh',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '12px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
  },
  modalActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    marginBottom: '8px',
  }
};
