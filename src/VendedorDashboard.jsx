import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Search, ShoppingCart, CreditCard, DollarSign, 
  ArrowUpRight, ArrowDownRight, RefreshCw, X, Check,
  TrendingUp, TrendingDown, BookOpen, Send, User, LogOut, Barcode, Plus,
  Edit, Printer, ShoppingBag, Home, ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import ProductForm from './ProductForm';
import BarcodeScannerModal from './BarcodeScannerModal';

export default function VendedorDashboard({ user, onLogout, viewMode }) {
  // Tabs: 'inicio', 'ventas', 'movimientos', 'mi_caja'
  const [activeTab, setActiveTab] = useState('inicio');
  const [visibleCount, setVisibleCount] = useState(12);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('Servicio de luz (EDET)');
  const [incomeCategory, setIncomeCategory] = useState('Cobro de Cuenta Corriente (Cliente)');
  const [customFlowAmount, setCustomFlowAmount] = useState('');
  const [customFlowDesc, setCustomFlowDesc] = useState('');
  const [customFlowLoading, setCustomFlowLoading] = useState(false);
  const [selectedProductToEdit, setSelectedProductToEdit] = useState(null);
  
  // Scanners and Product Form toggles
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [prefilledBarcode, setPrefilledBarcode] = useState('');
  
  // Register state
  const [register, setRegister] = useState(null);
  const [openBalanceInput, setOpenBalanceInput] = useState('0');
  const [registerStats, setRegisterStats] = useState({
    salesTotal: 0,
    cashSales: 0,
    bankSales: 0, // transfer, debit, credit
    flowsIncome: 0,
    flowsExpense: 0,
    expectedCash: 0,
    expectedTotal: 0
  });

  // Catalog state
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [quickFilter, setQuickFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewLayout, setViewLayout] = useState('grid');

  // Cart state
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [customerPhone, setCustomerPhone] = useState('');

  // Extras Form
  const [flowType, setFlowType] = useState('expense');
  const [flowAmount, setFlowAmount] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowLoading, setFlowLoading] = useState(false);

  // Close register state
  const [actualBalanceInput, setActualBalanceInput] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  // Success Modal (Checkout completion)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [salesList, setSalesList] = useState([]);

  // Loading indicator for queries
  const [loading, setLoading] = useState(false);

  const [dollarRate, setDollarRate] = useState(1400);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [quickFlowType, setQuickFlowType] = useState('expense');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchActiveRegister();
    fetchProducts();
    fetchDollarRate();
  }, []);

  async function fetchDollarRate() {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/tarjeta');
      if (res.ok) {
        const data = await res.json();
        if (data && data.venta) {
          setDollarRate(parseFloat(data.venta));
        }
      }
    } catch (e) {
      console.error('Error fetching dollar rate:', e);
    }
  }

  useEffect(() => {
    setVisibleCount(12);
  }, [searchQuery, selectedCategory, quickFilter, sortBy]);

  const handleAddCustomFlow = async (type) => {
    const amt = parseFloat(customFlowAmount);
    if (!amt || amt <= 0) {
      alert('Por favor ingresa un monto válido.');
      return;
    }

    const categoryText = type === 'expense' ? expenseCategory : incomeCategory;
    const finalDesc = customFlowDesc.trim() 
      ? `${categoryText} - ${customFlowDesc.trim()}`
      : categoryText;

    setCustomFlowLoading(true);
    try {
      const { error } = await supabase
        .from('cash_flows')
        .insert({
          cash_register_id: register.id,
          user_id: user.id,
          type: type,
          amount: amt,
          description: finalDesc
        });

      if (error) throw error;

      // Log notification
      await supabase.from('notifications').insert({
        recipient_role: 'supervisor',
        title: type === 'expense' ? 'Egreso Registrado' : 'Ingreso Registrado',
        message: `${user.name} registró un ${type === 'expense' ? 'gasto' : 'ingreso'} extra de $${amt.toLocaleString('es-AR')}: ${finalDesc}.`
      });

      alert('Movimiento registrado con éxito.');
      setCustomFlowAmount('');
      setCustomFlowDesc('');
      setIsExpenseModalOpen(false);
      setIsIncomeModalOpen(false);
      fetchRegisterStats();
    } catch (err) {
      console.error('Error adding custom flow:', err);
      alert('Error al registrar el movimiento.');
    } finally {
      setCustomFlowLoading(false);
    }
  };

  useEffect(() => {
    if (register) {
      fetchRegisterStats();
    }
  }, [register]);

  async function fetchActiveRegister() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('seller_id', user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
        setRegister(data[0]);
      } else {
        setRegister(null);
      }
    } catch (err) {
      console.error('Error fetching register:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenRegister = async () => {
    const openingAmt = parseFloat(openBalanceInput) || 0;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .insert({
          seller_id: user.id,
          opening_balance: openingAmt,
          status: 'open',
          validation_status: 'pending'
        })
        .select();

      if (error) throw error;
      setRegister(data[0]);

      // Trigger notification
      await supabase.from('notifications').insert({
        recipient_role: 'supervisor',
        title: 'Caja Abierta',
        message: `${user.name} abrió caja con un saldo inicial de $${openingAmt.toLocaleString('es-AR')}.`
      });
    } catch (err) {
      console.error('Error opening register:', err);
      alert('Error al abrir la caja.');
    } finally {
      setLoading(false);
    }
  };

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) throw error;
      setProducts(data || []);

      // Extract unique categories
      const cats = [...new Set(data.map(p => p.category).filter(Boolean))];
      setCategories(cats);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }

  const handleBarcodeMatched = (matchedProduct) => {
    setIsBarcodeOpen(false);
    addToCart(matchedProduct);
    alert(`Añadido al carrito: ${matchedProduct.name}`);
  };

  const handleNewBarcodeScanned = (barcodeText) => {
    setIsBarcodeOpen(false);
    setPrefilledBarcode(barcodeText);
    setIsProductFormOpen(true);
  };


  async function fetchRegisterStats() {
    if (!register) return;
    try {
      // 1. Get Sales ordered by date descending
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('cash_register_id', register.id)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;
      setSalesList(sales || []);

      // 2. Get Cash Flows
      const { data: flows, error: flowsError } = await supabase
        .from('cash_flows')
        .select('*')
        .eq('cash_register_id', register.id);

      if (flowsError) throw flowsError;

      // Calculate totals (excluding cancelled sales)
      let salesTotal = 0;
      let cashSales = 0;
      let bankSales = 0;
      
      sales.forEach(sale => {
        if (sale.status === 'cancelled') return;
        salesTotal += parseFloat(sale.total);
        if (sale.payment_method === 'efectivo') {
          cashSales += parseFloat(sale.total);
        } else {
          bankSales += parseFloat(sale.total);
        }
      });

      let flowsIncome = 0;
      let flowsExpense = 0;

      flows.forEach(flow => {
        const amt = parseFloat(flow.amount);
        if (flow.type === 'income') {
          flowsIncome += amt;
        } else {
          flowsExpense += amt;
        }
      });

      const openBal = parseFloat(register.opening_balance);
      const expectedCash = openBal + cashSales + flowsIncome - flowsExpense;
      const expectedTotal = openBal + salesTotal + flowsIncome - flowsExpense;

      setRegisterStats({
        salesTotal,
        cashSales,
        bankSales,
        flowsIncome,
        flowsExpense,
        expectedCash,
        expectedTotal
      });
      setActualBalanceInput(String(Math.round(expectedCash)));
    } catch (err) {
      console.error('Error fetching register stats:', err);
    }
  }

  const handleCancelSale = async (sale) => {
    if (!window.confirm(`¿Estás seguro de que deseas cancelar la venta por $${parseFloat(sale.total).toLocaleString('es-AR')}? Esta acción devolverá los productos al stock.`)) {
      return;
    }
    
    setLoading(true);
    try {
      // 1. Update sale status to 'cancelled'
      const { error: updateError } = await supabase
        .from('sales')
        .update({ status: 'cancelled' })
        .eq('id', sale.id);

      if (updateError) throw updateError;

      // 2. Fetch sale items to know what products were sold and their quantities
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('product_id, quantity, product_name')
        .eq('sale_id', sale.id);

      if (itemsError) throw itemsError;

      // 3. Restore stock for each item
      if (items && items.length > 0) {
        for (const item of items) {
          if (!item.product_id) continue;
          
          // Get current stock
          const { data: prodData, error: prodErr } = await supabase
            .from('products')
            .select('stock, name')
            .eq('id', item.product_id)
            .single();
            
          if (prodErr) {
            console.error(`Error fetching product stock for ID ${item.product_id}:`, prodErr);
            continue;
          }
          
          const currentStock = parseInt(prodData?.stock || 0, 10);
          const newStock = currentStock + parseInt(item.quantity || 0, 10);
          
          // Update product stock
          const { error: stockErr } = await supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', item.product_id);
            
          if (stockErr) {
            console.error(`Error updating stock for product ID ${item.product_id}:`, stockErr);
            continue;
          }

          // Write log to product_logs
          await supabase.from('product_logs').insert({
            product_id: item.product_id,
            product_name: prodData.name || item.product_name,
            user_id: user.id,
            user_name: user.name,
            action: 'edited',
            details: {
              reason: 'Venta cancelada (Stock devuelto)',
              sale_id: sale.id,
              quantity_returned: item.quantity,
              previous_stock: currentStock,
              new_stock: newStock
            }
          });
        }
      }

      // 4. Create in-app notification
      await supabase.from('notifications').insert({
        recipient_role: 'supervisor',
        title: 'Venta Cancelada',
        message: `${user.name} canceló la venta ${sale.id.substring(0, 8)} por un total de $${parseFloat(sale.total).toLocaleString('es-AR')}.`
      });

      alert('La venta ha sido cancelada y el stock ha sido restaurado.');
      
      // 5. Refresh stats, sales list and product catalog
      await fetchRegisterStats();
      await fetchProducts();
    } catch (err) {
      console.error('Error cancelling sale:', err);
      alert('Error al cancelar la venta.');
    } finally {
      setLoading(false);
    }
  };

  // Cart Management
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert('Sin stock disponible');
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Llegaste al límite de stock disponible (${product.stock})`);
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (!item) return prev;
      
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return prev.filter(i => i.product.id !== productId);
      }
      if (newQty > item.product.stock) {
        alert(`Llegaste al límite de stock (${item.product.stock})`);
        return prev;
      }
      return prev.map(i => 
        i.product.id === productId ? { ...i, quantity: newQty } : i
      );
    });
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const total = getCartTotal();

    setLoading(true);
    try {
      // 1. Insert Sale record
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          seller_id: user.id,
          cash_register_id: register.id,
          total,
          payment_method: paymentMethod
        })
        .select();

      if (saleError) throw saleError;
      const sale = saleData[0];

      // 2. Insert items and update product stocks
      for (const item of cart) {
        const { error: itemError } = await supabase
          .from('sale_items')
          .insert({
            sale_id: sale.id,
            product_id: item.product.id,
            quantity: item.quantity,
            price: item.product.price
          });

        if (itemError) throw itemError;

        // Decrement stock
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: item.product.stock - item.quantity })
          .eq('id', item.product.id);

        if (stockError) throw stockError;
      }

      // Confetti action!
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#4e9f3d', '#8ed35b', '#ffd700', '#ffffff']
      });

      // Save sale details for receipt
      setLastSale({
        id: sale.id,
        date: new Date(),
        items: [...cart],
        total,
        payment_method: paymentMethod
      });

      // Clear cart
      setCart([]);
      setShowSuccessModal(true);
      fetchRegisterStats();
      fetchProducts(); // Refresh catalog stock
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Error procesando la venta.');
    } finally {
      setLoading(false);
    }
  };

  const getBase64ImageFromUrl = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('Error fetching base64 image:', e);
      return null;
    }
  };

  const handleGenerateBudget = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const doc = new jsPDF();
      
      // Load company logo
      const logoBase64 = await getBase64ImageFromUrl('/logo.jpeg');
      if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', 15, 12, 22, 22);
      }
      
      // Header details
      doc.setTextColor(44, 62, 44); // Zen green dark
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('BOEGROWCLUB', 42, 20);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(95, 122, 95);
      doc.text('Growshop & Sacred Geometry Manager', 42, 25);
      doc.text('Spin Active Active Seller Session', 42, 29);
      
      // Divider
      doc.setDrawColor(226, 235, 213);
      doc.setLineWidth(0.5);
      doc.line(15, 38, 195, 38);
      
      // Budget Title / Metadata
      const budgetCode = `PRE-${Math.floor(100000 + Math.random() * 900000)}`;
      const dateStr = new Date().toLocaleDateString('es-AR');
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PRESUPUESTO ESTIMADO', 15, 48);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Nro: ${budgetCode}`, 150, 48);
      doc.text(`Fecha: ${dateStr} ${timeStr}`, 150, 53);
      
      doc.text(`Vendedor: ${user.name}`, 15, 54);
      if (customerPhone) {
        doc.text(`Cliente (WhatsApp): +${customerPhone}`, 15, 59);
      }
      
      // Table Header Background
      doc.setFillColor(74, 124, 63); // Zen Green Accent
      doc.rect(15, 68, 180, 8, 'F');
      
      // Table Header text
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.text('Producto', 18, 73);
      doc.text('Cant.', 120, 73);
      doc.text('P. Unitario', 140, 73);
      doc.text('Subtotal', 170, 73);
      
      // Table Rows
      let yPosition = 83;
      doc.setTextColor(44, 62, 44);
      doc.setFont('Helvetica', 'normal');
      
      cart.forEach((item, index) => {
        // Alternating row background
        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 246);
          doc.rect(15, yPosition - 5, 180, 7, 'F');
        }
        
        doc.text(item.product.name.substring(0, 42), 18, yPosition);
        doc.text(String(item.quantity), 122, yPosition);
        doc.text(`$${parseFloat(item.product.price).toLocaleString('es-AR')}`, 140, yPosition);
        
        const subtotal = item.product.price * item.quantity;
        doc.text(`$${subtotal.toLocaleString('es-AR')}`, 170, yPosition);
        
        // Underline row
        doc.setDrawColor(240, 244, 236);
        doc.line(15, yPosition + 2, 195, yPosition + 2);
        
        yPosition += 8;
      });
      
      // Totals
      const totalAmt = getCartTotal();
      yPosition += 6;
      doc.setDrawColor(74, 124, 63);
      doc.setLineWidth(1);
      doc.line(15, yPosition, 195, yPosition);
      
      yPosition += 8;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('TOTAL ESTIMADO:', 120, yPosition);
      doc.text(`$${totalAmt.toLocaleString('es-AR')}`, 170, yPosition);
      
      // Footer
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(143, 165, 143);
      doc.text('Este documento es un presupuesto estimativo y no representa una factura fiscal.', 15, yPosition + 20);
      doc.text('Válido por 15 días a partir de la fecha de emisión. ¡Muchas gracias! 🌱', 15, yPosition + 24);
      
      // Save/Download PDF locally
      const filename = `Presupuesto_${budgetCode}.pdf`;
      doc.save(filename);
      
      // Create WhatsApp Text
      const dateString = new Date().toLocaleDateString('es-AR');
      const waMsg = `*BOEGROWCLUB* 🌿%0A` +
        `---------------------------%0A` +
        `*PRESUPUESTO DE COMPRA*%0A` +
        `Nro: ${budgetCode}%0A` +
        `Fecha: ${dateString}%0A` +
        `---------------------------%0A` +
        `Se ha descargado el archivo PDF *${filename}* en tu dispositivo para enviarlo.%0A%0A` +
        `*Total Estimado: $${totalAmt.toLocaleString('es-AR')}*%0A` +
        `¡Gracias por tu consulta! 🌱%0A` +
        `_boegrowclub_`;
        
      const targetPhone = customerPhone.replace(/\D/g, '') || '543816490060';
      const waLink = `https://wa.me/${targetPhone}?text=${waMsg}`;
      
      // Trigger share link in new window
      window.open(waLink, '_blank');
      alert(`¡Presupuesto ${budgetCode} generado correctamente! El PDF ha sido descargado y se abrió WhatsApp para compartir los detalles.`);
    } catch (e) {
      console.error('Error generating PDF budget:', e);
      alert('Error al generar el PDF del presupuesto.');
    } finally {
      setLoading(false);
    }
  };

  // Extras Income/Expense Flow
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
          cash_register_id: register.id,
          type: flowType,
          amount: amt,
          description: flowDesc.trim()
        });

      if (error) throw error;

      // Notification
      await supabase.from('notifications').insert({
        recipient_role: 'supervisor',
        title: flowType === 'income' ? 'Ingreso Caja' : 'Egreso Caja',
        message: `${user.name} registró un ${flowType === 'income' ? 'ingreso' : 'egreso'} de $${amt.toLocaleString('es-AR')} por: ${flowDesc.trim()}.`
      });

      // Reset Form
      setFlowAmount('');
      setFlowDesc('');
      fetchRegisterStats();
      alert('Movimiento registrado exitosamente!');
    } catch (err) {
      console.error('Flow register error:', err);
      alert('Error registrando movimiento.');
    } finally {
      setFlowLoading(false);
    }
  };

  // Close Caja Workflow
  const handleCloseRegister = async () => {
    const actualAmt = parseFloat(actualBalanceInput);
    if (isNaN(actualAmt)) {
      alert('Por favor ingresa el monto físico de cierre.');
      return;
    }

    setCloseLoading(true);
    try {
      const now = new Date();
      const difference = actualAmt - registerStats.expectedCash;

      // 1. Update cash_registers table
      const { error: dbError } = await supabase
        .from('cash_registers')
        .update({
          status: 'closed',
          closed_at: now.toISOString(),
          closing_balance: registerStats.expectedTotal,
          actual_balance: actualAmt,
          validation_status: 'pending'
        })
        .eq('id', register.id);

      if (dbError) throw dbError;

      // 2. Notification for Admin/Supervisor
      await supabase.from('notifications').insert({
        recipient_role: 'supervisor',
        title: 'Cierre de Caja',
        message: `${user.name} cerró la caja. Esperado: $${registerStats.expectedCash.toLocaleString('es-AR')}, Declarado: $${actualAmt.toLocaleString('es-AR')}. Diferencia: $${difference.toLocaleString('es-AR')}.`
      });

      // 3. Trigger WhatsApp to Supervisor
      const dateStr = now.toLocaleDateString('es-AR');
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const openTimeStr = new Date(register.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const waMessage = `*BO GROWCLUB* 🌿%0A` +
        `---------------------------%0A` +
        `*CIERRE DE CAJA DIARIO*%0A` +
        `Fecha: ${dateStr}%0A` +
        `Vendedor: ${user.name}%0A` +
        `Apertura: ${openTimeStr} | Cierre: ${timeStr}%0A` +
        `---------------------------%0A` +
        `(+) Saldo Inicial: $${parseFloat(register.opening_balance).toFixed(2)}%0A` +
        `(+) Ventas Efectivo: $${registerStats.cashSales.toFixed(2)}%0A` +
        `(+) Ventas Banco: $${registerStats.bankSales.toFixed(2)}%0A` +
        `(+) Ingresos Extras: $${registerStats.flowsIncome.toFixed(2)}%0A` +
        `(-) Egresos Extras: $${registerStats.flowsExpense.toFixed(2)}%0A` +
        `---------------------------%0A` +
        `*Efectivo Esperado: $${registerStats.expectedCash.toFixed(2)}*%0A` +
        `*Efectivo Declarado: $${actualAmt.toFixed(2)}*%0A` +
        `*Diferencia: $${difference.toFixed(2)}*%0A` +
        `---------------------------%0A` +
        `Estado: *PENDIENTE DE VALIDACIÓN*%0A` +
        `_Enviado desde App BO Growclub_`;

      const supervisorPhone = '543816490060'; // Test supervisor phone
      const waLink = `https://wa.me/${supervisorPhone}?text=${waMessage}`;

      // Open WhatsApp deep link in new window
      window.open(waLink, '_blank');

      // Logout and go to login screen
      onLogout();
    } catch (err) {
      console.error('Close register error:', err);
      alert('Error al cerrar la caja.');
    } finally {
      setCloseLoading(false);
    }
  };

  const getWaReceiptLink = () => {
    if (!lastSale) return '';
    const dateStr = lastSale.date.toLocaleDateString('es-AR');
    const timeStr = lastSale.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let itemsStr = '';
    lastSale.items.forEach(item => {
      itemsStr += `${item.quantity}x ${item.product.name} ($${(item.product.price * item.quantity).toFixed(2)})%0A`;
    });

    const receiptMessage = `*BO GROWCLUB* 🌿%0A` +
      `---------------------------%0A` +
      `*COMPROBANTE DE COMPRA*%0A` +
      `Fecha: ${dateStr} ${timeStr}%0A` +
      `Vendedor: ${user.name}%0A` +
      `---------------------------%0A` +
      `${itemsStr}` +
      `---------------------------%0A` +
      `*TOTAL: $${lastSale.total.toFixed(2)}*%0A` +
      `Pago: ${lastSale.payment_method.toUpperCase()}%0A` +
      `---------------------------%0A` +
      `¡Gracias por tu compra! 🌱%0A` +
      `_BO Growclub_`;

    const cleanPhone = customerPhone.replace(/\D/g, '') || '543816490060';
    return `https://wa.me/${cleanPhone}?text=${receiptMessage}`;
  };

  // Catalog filtering and sorting
  const getProcessedProducts = () => {
    let list = [...products];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
    }

    // Category dropdown
    if (selectedCategory) {
      list = list.filter(p => p.category === selectedCategory);
    }

    // Quick filter sidebar
    if (quickFilter === 'offer') {
      // simulate offer for products with price > 15000
      list = list.filter(p => p.price > 15000);
    } else if (quickFilter === 'low_stock') {
      list = list.filter(p => p.stock > 0 && p.stock <= 3);
    } else if (quickFilter === 'no_stock') {
      list = list.filter(p => p.stock <= 0);
    } else if (quickFilter === 'favorites') {
      // simulate favorites by id character sum
      list = list.filter(p => p.id && p.id.charCodeAt(0) % 3 === 0);
    }

    // Sorting
    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'sold') {
      // mock popularity
      list.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  };

  const filteredProducts = getProcessedProducts();

  // Render open register form if no register active
  if (!register) {
    return (
      <div style={styles.openCajaContainer} className="animate-fade-in">
        <div style={styles.brandingHeader}>
          <img src="/logo.jpeg" alt="Logo" style={styles.miniLogo} />
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', color: 'var(--text-primary)' }}>BO growclub</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sesión de {user.name}</p>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', width: '100%', maxWidth: '360px', marginTop: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <BookOpen size={32} className="text-gold" style={{ marginBottom: '8px' }} />
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Apertura de Caja</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ingresa el saldo inicial físico disponible en tu caja para comenzar la jornada laboral.</p>
          </div>

          <div className="mb-4">
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Monto Inicial ($ ARS)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
              <input
                type="number"
                value={openBalanceInput}
                onChange={(e) => setOpenBalanceInput(e.target.value)}
                style={{ paddingLeft: '32px' }}
                placeholder="0.00"
              />
            </div>
          </div>

          <button
            onClick={handleOpenRegister}
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? 'Abriendo...' : 'Iniciar Turno'}
          </button>
        </div>

        <button onClick={onLogout} className="btn-secondary" style={{ marginTop: '24px', gap: '8px' }}>
          <LogOut size={16} /> Salir
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={styles.mainContainer}>
      
      {/* PC Version Left Sidebar */}
      {viewMode === 'desktop' && (
        <div className="desktop-sidebar" style={{ backgroundColor: '#ffffff', borderRight: '1px solid #eef2eb', width: '230px', padding: '24px 16px', display: 'flex', flexDirection: 'column' }}>
          {/* Logo / Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', padding: '0 4px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '2px solid #e2ebd5',
              backgroundColor: '#f1f7ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a7c3f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '15px', margin: 0, fontWeight: '700', color: '#2c3e2c', fontFamily: 'var(--font-heading)' }}>boegrowclub</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4a7c3f', display: 'inline-block' }}></span>
                <span style={{ fontSize: '11px', color: '#4a7c3f', fontWeight: '500' }}>Spin Active</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => setActiveTab('inicio')} 
              className={`sidebar-item ${activeTab === 'inicio' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                backgroundColor: activeTab === 'inicio' ? '#ecf3e6' : 'transparent',
                color: activeTab === 'inicio' ? '#4a7c3f' : '#5f7a5f',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <Home size={18} strokeWidth={2.5} style={{ color: activeTab === 'inicio' ? '#4a7c3f' : '#8fa58f' }} />
              <span>Inicio</span>
            </button>
            <button 
              onClick={() => setActiveTab('ventas')} 
              className={`sidebar-item ${activeTab === 'ventas' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                backgroundColor: activeTab === 'ventas' ? '#ecf3e6' : 'transparent',
                color: activeTab === 'ventas' ? '#4a7c3f' : '#5f7a5f',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <ShoppingCart size={18} strokeWidth={2.5} style={{ color: activeTab === 'ventas' ? '#4a7c3f' : '#8fa58f' }} />
              <span>Vender</span>
            </button>

            <button 
              onClick={() => setActiveTab('movimientos')} 
              className={`sidebar-item ${activeTab === 'movimientos' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                backgroundColor: activeTab === 'movimientos' ? '#ecf3e6' : 'transparent',
                color: activeTab === 'movimientos' ? '#4a7c3f' : '#5f7a5f',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <ArrowUpRight size={18} strokeWidth={2.5} style={{ color: activeTab === 'movimientos' ? '#4a7c3f' : '#8fa58f' }} />
              <span>Movimientos</span>
            </button>

            <button 
              onClick={() => setActiveTab('mi_caja')} 
              className={`sidebar-item ${activeTab === 'mi_caja' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                backgroundColor: activeTab === 'mi_caja' ? '#ecf3e6' : 'transparent',
                color: activeTab === 'mi_caja' ? '#4a7c3f' : '#5f7a5f',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <BookOpen size={18} strokeWidth={2.5} style={{ color: activeTab === 'mi_caja' ? '#4a7c3f' : '#8fa58f' }} />
              <span>Mi Caja</span>
            </button>
          </div>

          {/* Sidebar Footer */}
          <div style={{ marginTop: 'auto', padding: '12px 4px 0', borderTop: '1px solid #f0f4ec' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#8fa58f', marginBottom: '12px' }}>
              <span>Versión: Vendedor 1</span>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4a7c3f' }}></span>
            </div>
            <button 
              onClick={onLogout} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 'none',
                color: '#8fa58f',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                padding: '4px 0',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <span>&lt;&lt; Colapsar</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className={viewMode === 'desktop' ? 'dashboard-content' : ''} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* App Header (mobile only) */}
        {viewMode !== 'desktop' && (
          <header style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.jpeg" alt="BO" style={styles.headerLogo} />
              <div>
                <h1 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: '0' }}>BO growclub</h1>
                <span style={{ fontSize: '10px', color: 'var(--accent-neon)' }} className="pulse-neon">🟢 Caja Activa</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', fontWeight: 'bold' }}>{user.name}</p>
                <p style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Vendedor</p>
              </div>
              <button onClick={onLogout} style={styles.logoutBtn}>
                <LogOut size={16} />
              </button>
            </div>
          </header>
        )}

        {/* Top Header details for desktop */}
        {viewMode === 'desktop' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #eef2eb', background: '#ffffff' }}>
            <div>
              <h2 style={{ fontSize: '22px', fontFamily: 'var(--font-heading)', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                {activeTab === 'inicio' && 'Inicio y Acciones'}
                {activeTab === 'ventas' && 'Catálogo de Ventas'}
                {activeTab === 'movimientos' && 'Registros de Caja Extra'}
                {activeTab === 'mi_caja' && 'Mi Caja y Ventas'}
              </h2>
              <p style={{ fontSize: '12px', color: '#8fa58f', margin: '4px 0 0 0' }}>Vendedor • Vendedor 1</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Dollar Rate Card */}
              <div style={{ 
                padding: '10px 16px', 
                borderRadius: '12px', 
                border: '1px solid #eef2eb', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                background: '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
              }}>
                <span style={{ fontSize: '11px', color: '#8fa58f', fontWeight: '700', letterSpacing: '0.05em' }}>DÓLAR TARJETA</span>
                <strong style={{ fontSize: '15px', color: '#4a7c3f', fontWeight: '800' }}>
                  ${dollarRate.toLocaleString('es-AR')}
                </strong>
              </div>

              {/* Sales Today Card */}
              <div style={{ 
                padding: '10px 16px', 
                borderRadius: '12px', 
                border: '1px solid #eef2eb', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                background: '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
              }}>
                <span style={{ fontSize: '11px', color: '#8fa58f', fontWeight: '700', letterSpacing: '0.05em' }}>VENTAS HOY</span>
                <strong style={{ fontSize: '15px', color: '#4a7c3f', fontWeight: '800' }}>
                  ${registerStats.salesTotal.toLocaleString('es-AR')}
                </strong>
              </div>

              {/* Cash Expected Card */}
              <div style={{ 
                padding: '10px 16px', 
                borderRadius: '12px', 
                border: '1px solid #eef2eb', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                background: '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
              }}>
                <span style={{ fontSize: '11px', color: '#8fa58f', fontWeight: '700', letterSpacing: '0.05em' }}>EFECTIVO CAJA</span>
                <strong style={{ fontSize: '15px', color: '#b8944a', fontWeight: '800' }}>
                  ${registerStats.expectedCash.toLocaleString('es-AR')}
                </strong>
              </div>

              {/* Notification icon */}
              <div style={{ position: 'relative', cursor: 'pointer', padding: '8px', borderRadius: '50%', border: '1px solid #eef2eb', backgroundColor: '#ffffff' }}>
                <span style={{ position: 'absolute', top: '6px', right: '6px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#dc3535', border: '1.5px solid #ffffff' }}></span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f7a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Caja Quick Info Stats (mobile only) */}
        {viewMode !== 'desktop' && (
          <section className="glass-panel" style={styles.quickStats}>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Ventas Hoy</span>
              <span style={styles.statValue}>${registerStats.salesTotal.toLocaleString('es-AR')}</span>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)', alignSelf: 'stretch' }} />
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Efectivo Caja</span>
              <span style={{ ...styles.statValue, color: 'var(--accent-gold)' }}>
                ${registerStats.expectedCash.toLocaleString('es-AR')}
              </span>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)', alignSelf: 'stretch' }} />
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Dólar Tarjeta</span>
              <span style={{ ...styles.statValue, color: '#4a7c3f' }}>
                ${dollarRate.toLocaleString('es-AR')}
              </span>
            </div>
          </section>
        )}

        {/* Main Content Area based on Tab */}
        <main style={{ padding: '24px', flex: 1, backgroundColor: '#fafaf9', minWidth: 0 }}>
          
          {/* Tab Content: INICIO / ACCIONES */}
          {activeTab === 'inicio' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, width: '100%' }}>
              
              {/* Header: Greeting + Digital clock */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#2c3e2c', margin: 0, fontFamily: 'var(--font-heading)' }}>
                    ¡Hola, {user.name}! 🌱
                  </h2>
                  <p style={{ fontSize: '13px', color: '#5f7a5f', margin: '4px 0 0 0' }}>
                    Bienvenido al panel de control de <strong>boegrowclub</strong>. ¿Qué deseas hacer hoy?
                  </p>
                </div>
                {viewMode === 'desktop' && (
                  <div style={{ textAlign: 'right', padding: '12px 18px', backgroundColor: '#ffffff', border: '1px solid #eef2eb', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#4a7c3f', fontFamily: 'monospace' }}>
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', textTransform: 'capitalize', marginTop: '2px' }}>
                      {currentTime.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                )}
              </div>

              {/* PC Version Quick Metrics Strip */}
              {viewMode === 'desktop' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px',
                  width: '100%'
                }}>
                  {/* Metric 1: Ventas del Turno */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 63, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c3f' }}>
                      <ShoppingCart size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Ventas del Turno</span>
                      <strong style={{ fontSize: '16px', color: '#2c3e2c', fontWeight: '800' }}>
                        ${registerStats.salesTotal.toLocaleString('es-AR')}
                      </strong>
                    </div>
                  </div>

                  {/* Metric 2: Efectivo en Caja */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(184, 148, 74, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8944a' }}>
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Efectivo Estimado</span>
                      <strong style={{ fontSize: '16px', color: '#b8944a', fontWeight: '800' }}>
                        ${registerStats.expectedCash.toLocaleString('es-AR')}
                      </strong>
                    </div>
                  </div>

                  {/* Metric 3: Banco / Transferencias */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 63, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c3f' }}>
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Cobros Banco</span>
                      <strong style={{ fontSize: '16px', color: '#2c3e2c', fontWeight: '800' }}>
                        ${registerStats.bankSales.toLocaleString('es-AR')}
                      </strong>
                    </div>
                  </div>

                  {/* Metric 4: Cotización Dólar Tarjeta */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 63, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c3f' }}>
                      <DollarSign size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Dólar Tarjeta</span>
                      <strong style={{ fontSize: '16px', color: '#4a7c3f', fontWeight: '800' }}>
                        ${dollarRate.toLocaleString('es-AR')}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Responsive Cards Grid: 4 columns on PC, 2 columns on mobile */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'desktop' ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
                gap: '20px',
                width: '100%',
                maxWidth: viewMode === 'desktop' ? '800px' : '100%',
                margin: viewMode === 'desktop' ? '0 auto' : '0'
              }}>
                {/* Card 1: Ingresar Venta */}
                <div 
                  onClick={() => setActiveTab('ventas')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_venta.png" alt="Ventas" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Ingresar Venta</h4>
                  <p style={styles.cardText}>Abrir catálogo y registrar ventas</p>
                </div>

                {/* Card 2: Ingresar Gasto */}
                <div 
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_gasto.png" alt="Gastos" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Ingresar Gasto</h4>
                  <p style={styles.cardText}>Registrar egresos de Tucumán</p>
                </div>

                {/* Card 3: Ingresar Dinero */}
                <div 
                  onClick={() => setIsIncomeModalOpen(true)}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_dinero.png" alt="Dinero" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Ingresar Dinero</h4>
                  <p style={styles.cardText}>Registrar depósitos en caja</p>
                </div>

                {/* Card 4: Solicitar Compras */}
                <div 
                  onClick={() => window.open('https://boeweb.netlify.app/vendedor', '_blank')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_compras.png" alt="Compras" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Solicitar Compras</h4>
                  <p style={styles.cardText}>Acceder a BOE compras web</p>
                  <ExternalLink size={12} style={{ position: 'absolute', top: '12px', right: '12px', color: '#b8944a' }} />
                </div>
              </div>

              {/* PC Version Content Filler: Shift Summary & Recent Sales */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'desktop' ? '1.2fr 1fr' : '1fr',
                gap: '24px',
                marginTop: '12px',
                width: '100%'
              }}>
                {/* Panel 1: Movimientos de Caja Rápido (Inline) */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                      <BookOpen size={16} style={{ color: '#4a7c3f' }} />
                      <span>Movimientos Rápidos de Caja</span>
                    </h3>
                    
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f0f4ee', padding: '3px', borderRadius: '8px' }}>
                      <button 
                        onClick={() => setQuickFlowType('expense')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: quickFlowType === 'expense' ? '#ef4444' : 'transparent',
                          color: quickFlowType === 'expense' ? '#ffffff' : '#5f7a5f',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Gasto
                      </button>
                      <button 
                        onClick={() => setQuickFlowType('income')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: quickFlowType === 'income' ? '#4a7c3f' : 'transparent',
                          color: quickFlowType === 'income' ? '#ffffff' : '#5f7a5f',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Ingreso
                      </button>
                    </div>
                  </div>

                  {!register ? (
                    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                      <p style={{ color: '#8fa58f', fontSize: '13px', margin: '0 0 12px 0' }}>No tienes una sesión de caja abierta activa.</p>
                      <button 
                        onClick={() => setActiveTab('mi_caja')} 
                        className="btn-primary" 
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        Abrir Caja Turno
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {quickFlowType === 'expense' ? (
                        <>
                          <div>
                            <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Concepto de Gasto (Tucumán)</label>
                            <select
                              value={expenseCategory}
                              onChange={(e) => setExpenseCategory(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #eef2eb', fontSize: '12px', backgroundColor: '#ffffff' }}
                            >
                              <option value="Servicio de luz (EDET)">Servicio de luz (EDET)</option>
                              <option value="Servicio de agua (SAT)">Servicio de agua (SAT)</option>
                              <option value="Servicio de gas (Gasnor)">Servicio de gas (Gasnor)</option>
                              <option value="Alquiler comercial (Local)">Alquiler comercial (Local)</option>
                              <option value="Internet / Teléfono (Telecom/Fibertel)">Internet / Teléfono (Telecom/Fibertel)</option>
                              <option value="Impuestos Provinciales (DGR Rentas)">Impuestos Provinciales (DGR Rentas)</option>
                              <option value="Impuestos Municipales (TEM S.M. de Tucumán)">Impuestos Municipales (TEM S.M. de Tucumán)</option>
                              <option value="Insumos de oficina y librería">Insumos de oficina y librería</option>
                              <option value="Productos de limpieza y bazar">Productos de limpieza y bazar</option>
                              <option value="Sueldos / Comisiones de personal">Sueldos / Comisiones de personal</option>
                              <option value="Otros Gastos de Operación">Otros Gastos de Operación</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Concepto de Ingreso</label>
                            <select
                              value={incomeCategory}
                              onChange={(e) => setIncomeCategory(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #eef2eb', fontSize: '12px', backgroundColor: '#ffffff' }}
                            >
                              <option value="Cobro de Cuenta Corriente (Cliente)">Cobro de Cuenta Corriente (Cliente)</option>
                              <option value="Aporte de Socios / Capital">Aporte de Socios / Capital</option>
                              <option value="Devolución de Mercadería (Proveedor)">Devolución de Mercadería (Proveedor)</option>
                              <option value="Venta Mayorista Especial">Venta Mayorista Especial</option>
                              <option value="Cambio de Caja Inicial">Cambio de Caja Inicial</option>
                              <option value="Otros Ingresos de Operación">Otros Ingresos de Operación</option>
                            </select>
                          </div>
                        </>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Monto ($ ARS)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={customFlowAmount}
                            onChange={(e) => setCustomFlowAmount(e.target.value)}
                            style={{ width: '100%', height: '36px', borderRadius: '10px', border: '1px solid #eef2eb', padding: '0 10px', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Detalles (Opcional)</label>
                          <input
                            type="text"
                            placeholder="Ej. Factura..."
                            value={customFlowDesc}
                            onChange={(e) => setCustomFlowDesc(e.target.value)}
                            style={{ width: '100%', height: '36px', borderRadius: '10px', border: '1px solid #eef2eb', padding: '0 10px', fontSize: '12px' }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddCustomFlow(quickFlowType)}
                        disabled={customFlowLoading}
                        style={{
                          width: '100%',
                          height: '36px',
                          borderRadius: '10px',
                          border: 'none',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          color: '#ffffff',
                          cursor: 'pointer',
                          backgroundColor: quickFlowType === 'expense' ? '#ef4444' : '#4a7c3f',
                          marginTop: '4px',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        {customFlowLoading ? 'Registrando...' : `Confirmar ${quickFlowType === 'expense' ? 'Gasto' : 'Ingreso'}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Panel 2: Últimas Ventas de la Sesión */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                      <ShoppingCart size={16} style={{ color: '#4a7c3f' }} />
                      <span>Últimas Ventas Registradas (Sesión)</span>
                    </h3>
                    <button 
                      onClick={() => setActiveTab('mi_caja')}
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '10px', height: 'auto', width: 'auto', borderRadius: '6px', borderColor: '#4a7c3f', color: '#4a7c3f', fontWeight: 'bold' }}
                    >
                      Ver Todas
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '185px', overflowY: 'auto' }}>
                    {salesList.slice(0, 4).map(sale => {
                      const saleTime = new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const isCancelled = sale.status === 'cancelled';
                      return (
                        <div key={sale.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          border: '1px solid #f5f5f4',
                          borderRadius: '10px',
                          fontSize: '12px',
                          opacity: isCancelled ? 0.6 : 1,
                          backgroundColor: '#fbfbfa'
                        }}>
                          <div>
                            <span style={{ fontWeight: '700', color: '#2c3e2c', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                              ${parseFloat(sale.total).toLocaleString('es-AR')}
                            </span>
                            <span style={{ color: '#8fa58f', marginLeft: '8px', fontSize: '11px' }}>
                              Hora: {saleTime} | Pago: <span style={{ textTransform: 'capitalize' }}>{sale.payment_method}</span>
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isCancelled ? (
                              <span className="badge badge-danger" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>Cancelada</span>
                            ) : (
                              <>
                                <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>Cobrada</span>
                                <button 
                                  onClick={() => handleCancelSale(sale)}
                                  className="btn-danger"
                                  style={{ padding: '2px 6px', fontSize: '9px', height: 'auto', width: 'auto', borderRadius: '4px' }}
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {salesList.length === 0 && (
                      <p style={{ textAlign: 'center', color: '#8fa58f', fontSize: '12px', padding: '24px 0', margin: 0 }}>
                        No has registrado ventas en este turno todavía.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: VENTAS / CATALOG */}
          {activeTab === 'ventas' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              
              {/* Search, Filter & Controls Row */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 2.2, minWidth: '240px' }}>
                  <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: '#8fa58f' }} />
                  <input
                    type="text"
                    placeholder="Buscar producto, referencia o categoria..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                      paddingLeft: '42px', 
                      height: '42px', 
                      borderRadius: '12px', 
                      border: '1px solid #eef2eb', 
                      backgroundColor: '#ffffff',
                      boxShadow: 'none',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Categories Dropdown */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{ 
                    flex: 1, 
                    minWidth: '150px', 
                    height: '42px', 
                    borderRadius: '12px', 
                    border: '1px solid #eef2eb', 
                    backgroundColor: '#ffffff',
                    boxShadow: 'none',
                    fontSize: '13px',
                    color: '#5f7a5f'
                  }}
                >
                  <option value="">Todas las categorias</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Sort Dropdown */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ 
                    flex: 1, 
                    minWidth: '150px', 
                    height: '42px', 
                    borderRadius: '12px', 
                    border: '1px solid #eef2eb', 
                    backgroundColor: '#ffffff',
                    boxShadow: 'none',
                    fontSize: '13px',
                    color: '#5f7a5f'
                  }}
                >
                  <option value="sold">Ordenar: Más vendidos</option>
                  <option value="name">Ordenar: Nombre</option>
                  <option value="price_asc">Ordenar: Menor precio</option>
                  <option value="price_desc">Ordenar: Mayor precio</option>
                </select>

                {/* Layout Grid/List Toggle */}
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f4ef', padding: '4px', borderRadius: '10px' }}>
                  <button 
                    onClick={() => setViewLayout('grid')}
                    style={{ 
                      padding: '6px 10px', 
                      borderRadius: '8px', 
                      border: 'none', 
                      cursor: 'pointer',
                      backgroundColor: viewLayout === 'grid' ? '#ffffff' : 'transparent',
                      color: viewLayout === 'grid' ? '#4a7c3f' : '#8fa58f',
                      boxShadow: viewLayout === 'grid' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                    }}
                    title="Grid layout"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setViewLayout('list')}
                    style={{ 
                      padding: '6px 10px', 
                      borderRadius: '8px', 
                      border: 'none', 
                      cursor: 'pointer',
                      backgroundColor: viewLayout === 'list' ? '#ffffff' : 'transparent',
                      color: viewLayout === 'list' ? '#4a7c3f' : '#8fa58f',
                      boxShadow: viewLayout === 'list' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                    }}
                    title="List layout"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Add product button */}
                <button
                  onClick={() => { setPrefilledBarcode(''); setIsProductFormOpen(true); }}
                  style={{ 
                    height: '42px', 
                    borderRadius: '12px', 
                    backgroundColor: '#4a7c3f', 
                    color: '#ffffff',
                    padding: '0 18px',
                    fontSize: '13px',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: 'none'
                  }}
                >
                  <Plus size={16} strokeWidth={3} /> Nuevo producto
                </button>
              </div>

              {/* Active filters display (Dograveda mockup format) */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: '#5f7a5f' }}>
                <span style={{ fontWeight: '700', color: '#2c3e2c' }}>Filtros activos:</span>
                
                {/* Category Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f6ed', border: '1px solid #e0ebd5', padding: '4px 12px', borderRadius: '20px', color: '#4a7c3f', fontWeight: '500' }}>
                  <span>Categoría: {selectedCategory || 'Todas'}</span>
                  {selectedCategory && (
                    <span style={{ cursor: 'pointer', fontWeight: '800', marginLeft: '4px' }} onClick={() => setSelectedCategory('')}>×</span>
                  )}
                </div>

                {/* Brand Pill (Static template filler matching screenshot) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f6ed', border: '1px solid #e0ebd5', padding: '4px 12px', borderRadius: '20px', color: '#4a7c3f', fontWeight: '500' }}>
                  <span>Marca: Todas</span>
                </div>

                {/* Availability Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f6ed', border: '1px solid #e0ebd5', padding: '4px 12px', borderRadius: '20px', color: '#4a7c3f', fontWeight: '500' }}>
                  <span>Disponibilidad: {quickFilter === 'no_stock' ? 'Sin stock' : 'Disponible'}</span>
                  {quickFilter !== 'all' && (
                    <span style={{ cursor: 'pointer', fontWeight: '800', marginLeft: '4px' }} onClick={() => setQuickFilter('all')}>×</span>
                  )}
                </div>

                <span 
                  style={{ cursor: 'pointer', color: '#8fa58f', textDecoration: 'underline', marginLeft: '12px', fontWeight: '500' }} 
                  onClick={() => { setSelectedCategory(''); setSearchQuery(''); setQuickFilter('all'); }}
                >
                  Limpiar filtros
                </span>
              </div>

              {/* Banners row */}
              {viewMode === 'desktop' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {/* Banner 1: Promociones */}
                  <div style={{ backgroundColor: '#f4faf0', border: '1px solid #e5f2de', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#ecf6e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                      🏷️
                    </div>
                    <div>
                      <h4 style={{ fontSize: '13px', margin: 0, fontWeight: '700', color: '#4a7c3f' }}>Productos en promoción</h4>
                      <p style={{ fontSize: '11px', color: '#8fa58f', margin: '2px 0 0 0' }}>5 productos con descuento activo</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#4a7c3f', fontWeight: '700', cursor: 'pointer' }} onClick={() => setQuickFilter('offer')}>Ver todos</span>
                  </div>

                  {/* Banner 2: Más vendidos */}
                  <div style={{ backgroundColor: '#f0f6ff', border: '1px solid #e0ecff', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e5f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                      ⭐
                    </div>
                    <div>
                      <h4 style={{ fontSize: '13px', margin: 0, fontWeight: '700', color: '#2b6cb0' }}>Más vendidos</h4>
                      <p style={{ fontSize: '11px', color: '#8fa58f', margin: '2px 0 0 0' }}>Los favoritos de tus clientes</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#2b6cb0', fontWeight: '700', cursor: 'pointer' }} onClick={() => setSortBy('sold')}>Ver todos</span>
                  </div>

                  {/* Banner 3: Nuevos productos */}
                  <div style={{ backgroundColor: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                      📦
                    </div>
                    <div>
                      <h4 style={{ fontSize: '13px', margin: 0, fontWeight: '700', color: '#6b46c1' }}>Nuevos productos</h4>
                      <p style={{ fontSize: '11px', color: '#8fa58f', margin: '2px 0 0 0' }}>Descubre las últimas novedades</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b46c1', fontWeight: '700', cursor: 'pointer' }} onClick={() => { setSelectedCategory(''); setQuickFilter('all'); }}>Ver todos</span>
                  </div>
                </div>
              )}

              {/* Two columns layout for PC view */}
              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', minWidth: 0 }}>
                {/* Left Column: Product Cards */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={viewMode === 'desktop' ? (viewLayout === 'grid' ? 'desktop-product-grid' : 'list-layout-rows') : styles.catalogGrid} style={{ display: viewLayout === 'list' && viewMode === 'desktop' ? 'flex' : undefined, flexDirection: 'column', gap: '12px' }}>
                    {filteredProducts.slice(0, visibleCount).map(prod => {
                      const hasLowStock = prod.stock > 0 && prod.stock <= 3;
                      const hasNoStock = prod.stock <= 0;
                      const isOnOffer = prod.price > 15000; // Mock offers

                      return (
                        <div 
                          key={prod.id} 
                          style={{ 
                            padding: '16px',
                            backgroundColor: '#ffffff',
                            borderRadius: '16px',
                            border: '1px solid #eef2eb',
                            boxShadow: 'none',
                            opacity: hasNoStock ? 0.7 : 1,
                            transition: 'all 0.2s ease',
                            display: viewLayout === 'list' && viewMode === 'desktop' ? 'flex' : 'block',
                            alignItems: 'center',
                            gap: '16px',
                            position: 'relative'
                          }}
                        >
                          {/* Card Top Header Information Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', width: '100%' }}>
                            {hasNoStock ? (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#ef4444' }}>SIN STOCK</span>
                            ) : hasLowStock ? (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#d97706' }}>STOCK BAJO</span>
                            ) : isOnOffer ? (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#ffedd5', color: '#ea580c' }}>OFERTA -8%</span>
                            ) : (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#ecfdf5', color: '#10b981' }}>NUEVO</span>
                            )}

                            <span style={{ fontSize: '11px', color: '#8fa58f', fontWeight: '500' }}>
                              Stock: {prod.stock}
                            </span>

                            <span style={{ fontSize: '11px', color: '#8fa58f', fontWeight: '600' }}>
                              {prod.category || 'Varios'}
                            </span>
                          </div>

                          {/* Image Container */}
                          <div style={{ 
                            height: '110px', 
                            width: '100%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            marginBottom: '12px',
                            backgroundColor: '#fafaf9',
                            borderRadius: '12px',
                            padding: '8px',
                            overflow: 'hidden'
                          }}>
                            <img 
                              src={prod.image_url || "/logo.jpeg"} 
                              alt={prod.name} 
                              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} 
                            />
                          </div>

                          {/* Product Details */}
                          <div style={{ textAlign: 'left', minHeight: '52px' }}>
                            <h4 style={{ fontSize: '14px', color: '#2c3e2c', fontWeight: '700', margin: '0 0 4px 0', lineHeight: '1.3' }}>
                              {prod.name}
                            </h4>
                            <p style={{ fontSize: '11px', color: '#8fa58f', margin: 0 }}>
                              {prod.category || 'Otros'}
                            </p>
                          </div>

                          {/* Price details & Add button section */}
                          <div style={{ borderTop: '1px solid #f5f5f4', paddingTop: '12px', marginTop: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                              {isOnOffer ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '12px', color: '#8fa58f', textDecoration: 'line-through' }}>
                                    ${Math.round(prod.price * 1.08).toLocaleString('es-AR')}
                                  </span>
                                  <strong style={{ fontSize: '16px', color: '#4a7c3f', fontWeight: '800' }}>
                                    ${parseFloat(prod.price).toLocaleString('es-AR')}
                                  </strong>
                                </div>
                              ) : (
                                <strong style={{ fontSize: '16px', color: '#4a7c3f', fontWeight: '800' }}>
                                  ${parseFloat(prod.price).toLocaleString('es-AR')}
                                </strong>
                              )}
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                US$ {(prod.price_usd ? parseFloat(prod.price_usd) : (parseFloat(prod.price) / dollarRate)).toFixed(2)}
                              </div>
                            </div>

                            {/* Footer controls: Like heart + Add */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductToEdit(prod);
                                  setIsProductFormOpen(true);
                                }}
                                style={{ 
                                  background: 'none', 
                                  padding: '8px', 
                                  border: '1px solid #eef2eb', 
                                  borderRadius: '10px', 
                                  color: '#4a7c3f', 
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="Editar producto (Foto, GPS, Escáner)"
                              >
                                <Edit size={15} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); !hasNoStock && addToCart(prod); }}
                                disabled={hasNoStock}
                                style={{ 
                                  padding: '8px 12px', 
                                  fontSize: '12px', 
                                  border: '1px solid #4a7c3f',
                                  color: '#4a7c3f',
                                  backgroundColor: '#ffffff',
                                  borderRadius: '10px',
                                  flex: 1,
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px'
                                }}
                              >
                                + Agregar
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <p style={{ textAlign: 'center', width: '100%', color: '#8fa58f', padding: '48px 24px' }}>
                        No se encontraron productos en el catálogo.
                      </p>
                    )}
                  </div>

                  {filteredProducts.length > visibleCount && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
                      <button
                        onClick={() => setVisibleCount(prev => prev + 12)}
                        className="btn-secondary"
                        style={{
                          padding: '10px 24px',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderColor: '#4a7c3f',
                          color: '#4a7c3f',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        <RefreshCw size={14} /> Ver Más ({filteredProducts.length - visibleCount} restantes)
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Column: Order Summary & Filters (only desktop) */}
                {viewMode === 'desktop' && (
                  <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '20px', flexShrink: 0, position: 'sticky', top: '24px' }}>
                     {/* Card 1: Resumen de Venta */}
                     <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '18px', border: '1px solid #eef2eb' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#2c3e2c', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                          <ShoppingCart size={16} style={{ color: '#4a7c3f' }} /> Resumen de venta
                        </h3>
                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '13px', color: '#5f7a5f', marginBottom: '8px' }}>
                          <span>Productos</span>
                          <span style={{ fontWeight: '700', color: '#2c3e2c' }}>{cart.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '13px', color: '#5f7a5f', marginBottom: '14px' }}>
                          <span>Items</span>
                          <span style={{ fontWeight: '700', color: '#2c3e2c' }}>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f5f5f4', paddingTop: '14px', marginBottom: '16px' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: '#2c3e2c' }}>Total</span>
                          <strong style={{ fontSize: '20px', color: '#4a7c3f', fontWeight: '800' }}>${getCartTotal().toLocaleString('es-AR')}</strong>
                        </div>
                        <button 
                          onClick={() => setActiveTab('mi_caja')}
                          style={{ 
                            width: '100%', 
                            borderRadius: '10px', 
                            height: '42px', 
                            backgroundColor: '#4a7c3f', 
                            color: '#ffffff',
                            fontWeight: '700',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <ShoppingCart size={16} /> Ver carrito
                        </button>
                     </div>

                     {/* Card 2: Filtros rápidos */}
                     <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '18px', border: '1px solid #eef2eb' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#2c3e2c', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px', marginBottom: '12px', margin: 0 }}>
                          Filtros rápidos
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: quickFilter === 'all' ? '#4a7c3f' : '#2c3e2c', fontWeight: quickFilter === 'all' ? '700' : '500' }} onClick={() => setQuickFilter('all')}>
                            <span>Todos los productos</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f1f4ef', color: '#4a7c3f', fontWeight: '700' }}>{products.length}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: quickFilter === 'offer' ? '#4a7c3f' : '#2c3e2c', fontWeight: quickFilter === 'offer' ? '700' : '500' }} onClick={() => setQuickFilter('offer')}>
                            <span>En oferta</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ffedd5', color: '#ea580c', fontWeight: '700' }}>{products.filter(p => p.price > 15000).length}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: quickFilter === 'low_stock' ? '#4a7c3f' : '#2c3e2c', fontWeight: quickFilter === 'low_stock' ? '700' : '500' }} onClick={() => setQuickFilter('low_stock')}>
                            <span>Stock bajo</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#d97706', fontWeight: '700' }}>{products.filter(p => p.stock > 0 && p.stock <= 3).length}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: quickFilter === 'no_stock' ? '#4a7c3f' : '#2c3e2c', fontWeight: quickFilter === 'no_stock' ? '700' : '500' }} onClick={() => setQuickFilter('no_stock')}>
                            <span>Sin stock</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#ef4444', fontWeight: '700' }}>{products.filter(p => p.stock <= 0).length}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: quickFilter === 'favorites' ? '#4a7c3f' : '#2c3e2c', fontWeight: quickFilter === 'favorites' ? '700' : '500' }} onClick={() => setQuickFilter('favorites')}>
                            <span>Favoritos</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f5f5f4', color: '#8fa58f', fontWeight: '700' }}>{products.filter(p => p.id && p.id.charCodeAt(0) % 3 === 0).length}</span>
                          </div>
                        </div>
                     </div>

                     {/* Card 3: Categorías */}
                     <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '18px', border: '1px solid #eef2eb' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#2c3e2c', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px', marginBottom: '12px', margin: 0 }}>
                          Categorías
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: selectedCategory === '' ? '#4a7c3f' : '#2c3e2c', fontWeight: selectedCategory === '' ? '700' : '500' }} onClick={() => setSelectedCategory('')}>
                            <span>Todas</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f1f4ef', color: '#4a7c3f', fontWeight: '700' }}>{products.length}</span>
                          </div>
                          {categories.map(cat => {
                            const count = products.filter(p => p.category === cat).length;
                            return (
                              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: selectedCategory === cat ? '#4a7c3f' : '#2c3e2c', fontWeight: selectedCategory === cat ? '700' : '500' }} onClick={() => setSelectedCategory(cat)}>
                                <span>{cat}</span>
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#fafaf9', color: '#5f7a5f', fontWeight: '700' }}>{count}</span>
                              </div>
                            );
                          })}
                          <span style={{ color: '#4a7c3f', fontWeight: '700', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }} onClick={() => setSelectedCategory('')}>Ver todas</span>
                        </div>
                     </div>
                  </div>
                )}
              </div>

            </div>
          )}

        {/* Tab Content: MOVIMIENTOS EXTRA (Gastos / Ingresos) */}
        {activeTab === 'movimientos' && (
          <form onSubmit={handleAddFlow} className="glass-panel animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} className="text-gold" />
              <span>Registrar Caja Extra</span>
            </h3>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Tipo de Movimiento</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setFlowType('expense')}
                  style={{
                    backgroundColor: flowType === 'expense' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.2)',
                    borderColor: flowType === 'expense' ? '#ef4444' : 'var(--border-color)',
                    borderWidth: '1px',
                    color: flowType === 'expense' ? '#ef4444' : 'var(--text-secondary)'
                  }}
                >
                  <ArrowDownRight size={16} /> Gasto / Egreso
                </button>
                <button
                  type="button"
                  onClick={() => setFlowType('income')}
                  style={{
                    backgroundColor: flowType === 'income' ? 'rgba(100, 221, 23, 0.15)' : 'rgba(0,0,0,0.2)',
                    borderColor: flowType === 'income' ? 'var(--accent-neon)' : 'var(--border-color)',
                    borderWidth: '1px',
                    color: flowType === 'income' ? 'var(--accent-neon)' : 'var(--text-secondary)'
                  }}
                >
                  <ArrowUpRight size={16} /> Ingreso Extra
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Monto ($ ARS)</label>
              <input
                type="number"
                placeholder="0.00"
                value={flowAmount}
                onChange={(e) => setFlowAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Descripción / Concepto</label>
              <textarea
                placeholder="Ej. Compra de rollos de ticket, Cambio de caja..."
                value={flowDesc}
                onChange={(e) => setFlowDesc(e.target.value)}
                rows={3}
                required
              />
            </div>

            <button type="submit" disabled={flowLoading} className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              {flowLoading ? 'Registrando...' : 'Confirmar Movimiento'}
            </button>
          </form>
        )}

        {/* Tab Content: CART CHECKOUT & CIERRE DE CAJA */}
        {activeTab === 'mi_caja' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Split layout in Desktop mode, stacked on mobile */}
            <div style={{
              display: viewMode === 'desktop' ? 'grid' : 'flex',
              gridTemplateColumns: viewMode === 'desktop' ? '1.2fr 1fr' : undefined,
              flexDirection: 'column',
              gap: '24px',
              alignItems: 'flex-start',
              width: '100%'
            }}>
              
              {/* Left Column: Cart Section */}
              <div style={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '16px', 
                border: '1px solid #eef2eb', 
                padding: '24px', 
                width: '100%',
                boxShadow: 'none'
              }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f5f5f4', paddingBottom: '14px', marginBottom: '16px', fontSize: '16px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                  <ShoppingCart size={18} style={{ color: '#4a7c3f' }} />
                  <span>Carrito de Ventas ({cart.length})</span>
                </h3>

                {cart.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#8fa58f', padding: '32px 0', fontSize: '14px' }}>
                    El carrito está vacío. Agrega productos desde el Catálogo.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    {/* Cart Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                      {cart.map(item => (
                        <div key={item.product.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          border: '1px solid #f5f5f4',
                          borderRadius: '12px',
                          backgroundColor: '#fafaf9'
                        }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                            <p style={{ fontSize: '13px', fontWeight: '700', color: '#2c3e2c', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product.name}</p>
                            <p style={{ fontSize: '11px', color: '#4a7c3f', fontWeight: '600', margin: 0 }}>
                              ${parseFloat(item.product.price).toLocaleString('es-AR')} c/u
                            </p>
                          </div>
                          
                          {/* Manual Quantity Input + controls */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button onClick={() => updateQuantity(item.product.id, -1)} style={styles.qtyBtn}>-</button>
                            <input
                              type="number"
                              value={item.quantity}
                              min="1"
                              max={item.product.stock}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  if (val > item.product.stock) {
                                    alert(`Llegaste al límite de stock disponible (${item.product.stock})`);
                                    updateQuantity(item.product.id, item.product.stock - item.quantity);
                                  } else if (val <= 0) {
                                    updateQuantity(item.product.id, -item.quantity);
                                  } else {
                                    updateQuantity(item.product.id, val - item.quantity);
                                  }
                                }
                              }}
                              style={{
                                width: '55px',
                                textAlign: 'center',
                                padding: '4px',
                                borderRadius: '8px',
                                border: '1px solid #eef2eb',
                                fontWeight: '700',
                                fontSize: '13px',
                                height: '28px',
                                margin: '0 2px',
                                backgroundColor: '#ffffff',
                                boxShadow: 'none'
                              }}
                            />
                            <button onClick={() => updateQuantity(item.product.id, 1)} style={styles.qtyBtn}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: '1px solid #f5f5f4', paddingTop: '16px', marginTop: '8px' }}>
                      
                      {/* Payment Method Selector */}
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', color: '#5f7a5f', fontWeight: '700', display: 'block', marginBottom: '8px' }}>Método de Pago</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                          {['efectivo', 'transferencia', 'debito', 'credito'].map(method => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setPaymentMethod(method)}
                              style={{
                                padding: '10px 4px',
                                fontSize: '11px',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                borderRadius: '10px',
                                border: paymentMethod === method ? '1px solid #4a7c3f' : '1px solid #eef2eb',
                                backgroundColor: paymentMethod === method ? '#ecf3e6' : '#ffffff',
                                color: paymentMethod === method ? '#4a7c3f' : '#8fa58f',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Customer Phone (WhatsApp) */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '12px', color: '#5f7a5f', fontWeight: '700', display: 'block', marginBottom: '8px' }}>Celular del Cliente (WhatsApp)</label>
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="Ej: 5493816490060"
                          style={{ 
                            width: '100%',
                            height: '42px',
                            borderRadius: '12px',
                            border: '1px solid #eef2eb',
                            fontSize: '13px'
                          }}
                        />
                      </div>

                      {/* Total details card */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '20px',
                        padding: '12px 16px',
                        backgroundColor: '#f4faf0',
                        borderRadius: '12px',
                        border: '1px solid #e5f2de'
                      }}>
                        <span style={{ fontWeight: '700', fontSize: '14px', color: '#2c3e2c' }}>Total a Cobrar:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: '22px', fontWeight: '800', color: '#4a7c3f' }}>
                            ${getCartTotal().toLocaleString('es-AR')}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                            US$ {(getCartTotal() / dollarRate).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={handleCheckout} 
                        disabled={loading} 
                        style={{ 
                          width: '100%',
                          height: '44px',
                          backgroundColor: '#4a7c3f',
                          color: '#ffffff',
                          fontWeight: '700',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '14px'
                        }}
                      >
                        <CreditCard size={18} /> Confirmar y Cobrar
                      </button>

                      <button 
                        onClick={handleGenerateBudget} 
                        disabled={loading || cart.length === 0} 
                        style={{ 
                          width: '100%',
                          height: '44px',
                          backgroundColor: '#ffffff',
                          color: '#4a7c3f',
                          fontWeight: '700',
                          border: '1.5px solid #4a7c3f',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '14px',
                          marginTop: '10px'
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <line x1="10" y1="9" x2="8" y2="9" />
                        </svg>
                        Presupuestar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Cierre de Caja Section */}
              <div style={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '16px', 
                border: '1px solid #eef2eb', 
                padding: '24px', 
                width: '100%'
              }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f5f5f4', paddingBottom: '14px', marginBottom: '16px', fontSize: '16px', fontWeight: '700', color: '#b8944a', margin: 0 }}>
                  <DollarSign size={18} style={{ color: '#b8944a' }} />
                  <span>Cierre de Caja Diario</span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#5f7a5f' }}>Saldo Inicial:</span>
                    <span style={{ fontWeight: '600', color: '#2c3e2c' }}>${parseFloat(register.opening_balance).toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#5f7a5f' }}>Ventas Efectivo:</span>
                    <span style={{ color: '#4a7c3f', fontWeight: '700' }}>+${registerStats.cashSales.toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#5f7a5f' }}>Otros Ingresos Caja:</span>
                    <span style={{ color: '#4a7c3f', fontWeight: '700' }}>+${registerStats.flowsIncome.toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#5f7a5f' }}>Otros Egresos Caja:</span>
                    <span style={{ color: '#ef4444', fontWeight: '700' }}>-${registerStats.flowsExpense.toLocaleString('es-AR')}</span>
                  </div>
                  
                  <div style={{ height: '1px', background: '#f5f5f4', margin: '8px 0' }} />
                  
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '14px', 
                    fontWeight: '700',
                    backgroundColor: '#fffdf5',
                    border: '1px solid #fef3c7',
                    padding: '10px 14px',
                    borderRadius: '10px'
                  }}>
                    <span style={{ color: '#b8944a' }}>Efectivo Esperado:</span>
                    <span style={{ color: '#b8944a', fontSize: '16px', fontWeight: '800' }}>${registerStats.expectedCash.toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8fa58f', padding: '2px 0 0 0' }}>
                    <span>* Ventas Bancarias (Transf/Tarjetas):</span>
                    <span>${registerStats.bankSales.toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f5f5f4', paddingTop: '16px' }}>
                  <label style={{ fontSize: '12px', color: '#5f7a5f', fontWeight: '700', display: 'block', marginBottom: '8px' }}>Efectivo Real Físico Contado</label>
                  <div style={{ position: 'relative', marginBottom: '20px' }}>
                    <span style={{ position: 'absolute', left: '16px', top: '11px', color: '#8fa58f', fontWeight: '700' }}>$</span>
                    <input
                      type="number"
                      value={actualBalanceInput}
                      onChange={(e) => setActualBalanceInput(e.target.value)}
                      style={{ 
                        paddingLeft: '32px', 
                        borderColor: '#eef2eb',
                        height: '42px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#2c3e2c'
                      }}
                      placeholder="0.00"
                    />
                  </div>

                  <button 
                    onClick={handleCloseRegister} 
                    disabled={closeLoading} 
                    style={{ 
                      width: '100%',
                      height: '44px',
                      backgroundColor: '#b8944a',
                      color: '#ffffff',
                      fontWeight: '700',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: 'none'
                    }}
                  >
                    <DollarSign size={18} /> Confirmar y Reportar Cierre
                  </button>
                </div>
              </div>

            </div>

            {/* Ventas de la Sesión Section */}
            <div style={{ 
              backgroundColor: '#ffffff', 
              borderRadius: '16px', 
              border: '1px solid #eef2eb', 
              padding: '24px', 
              width: '100%',
              marginTop: '20px'
            }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f5f5f4', paddingBottom: '14px', marginBottom: '16px', fontSize: '16px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                <ShoppingBag size={18} style={{ color: '#4a7c3f' }} />
                <span>Ventas de la Sesión (Caja Abierta)</span>
              </h3>
              
              {salesList.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#8fa58f', padding: '16px 0', fontSize: '13px' }}>
                  No hay ventas registradas en esta sesión.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                  {salesList.map(sale => {
                    const saleTime = new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const isCancelled = sale.status === 'cancelled';
                    return (
                      <div key={sale.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        border: '1px solid #f5f5f4',
                        borderRadius: '12px',
                        backgroundColor: isCancelled ? '#fafaf9' : '#ffffff',
                        opacity: isCancelled ? 0.6 : 1
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: '#2c3e2c', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                            ${parseFloat(sale.total).toLocaleString('es-AR')}
                          </p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#8fa58f' }}>
                            Hora: {saleTime} | Pago: <span style={{ textTransform: 'capitalize' }}>{sale.payment_method}</span>
                          </p>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isCancelled ? (
                            <span className="badge badge-danger" style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px' }}>Cancelada</span>
                          ) : (
                            <>
                              <span className="badge badge-success" style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px' }}>Cobrada</span>
                              <button 
                                onClick={() => handleCancelSale(sale)}
                                className="btn-danger"
                                style={{ padding: '4px 8px', fontSize: '10px', height: 'auto', width: 'auto', borderRadius: '6px' }}
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Checkout Success Modal */}
      {showSuccessModal && lastSale && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel animate-fade-in" style={styles.modalContent}>
            <div style={styles.successIconContainer}>
              <Check size={32} />
            </div>
            
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>¡Venta Completada!</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>La venta se ha registrado y el stock se actualizó correctamente.</p>

            <div style={styles.receiptSummary}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>Código Venta:</span>
                <span style={{ fontFamily: 'monospace' }}>{lastSale.id.substring(0, 8)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>Método Pago:</span>
                <span style={{ textTransform: 'capitalize' }}>{lastSale.payment_method}</span>
              </div>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Total Cobrado:</span>
                <span className="text-success">${lastSale.total.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Customer Phone adjustment in Success Modal */}
            <div style={{ marginBottom: '16px', width: '100%' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textAlign: 'left' }}>Número de WhatsApp Destino</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Ej: 5493816490060"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <a 
                href={getWaReceiptLink()} 
                target="_blank" 
                rel="noreferrer"
                className="btn-primary" 
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowSuccessModal(false)}
              >
                <Send size={16} /> Enviar Comprobante (Wame)
              </a>
              <button 
                onClick={() => {
                  setShowSuccessModal(false);
                  setCustomerPhone(''); // reset customer phone for next sale
                }} 
                className="btn-secondary" 
                style={{ width: '100%' }}
              >
                Cerrar y Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Tabs (mobile only) */}
      {viewMode !== 'desktop' && (
        <nav style={styles.navbar}>
          <button 
            onClick={() => setActiveTab('inicio')} 
            style={{ 
              ...styles.navItem, 
              color: activeTab === 'inicio' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'inicio' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
            }}
          >
            <Home size={20} />
            <span style={{ fontSize: '10px' }}>Inicio</span>
          </button>

          <button 
            onClick={() => setActiveTab('ventas')} 
            style={{ 
              ...styles.navItem, 
              color: activeTab === 'ventas' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'ventas' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
            }}
          >
            <ShoppingCart size={20} />
            <span style={{ fontSize: '10px' }}>Vender</span>
          </button>

          <button 
            onClick={() => setActiveTab('movimientos')} 
            style={{ 
              ...styles.navItem, 
              color: activeTab === 'movimientos' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'movimientos' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
            }}
          >
            <ArrowUpRight size={20} />
            <span style={{ fontSize: '10px' }}>Movimientos</span>
          </button>

          <button 
            onClick={() => setActiveTab('mi_caja')} 
            style={{ 
              ...styles.navItem, 
              color: activeTab === 'mi_caja' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'mi_caja' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
            }}
          >
            <BookOpen size={20} />
            <span style={{ fontSize: '10px' }}>Mi Caja</span>
          </button>
        </nav>
      )}

      <BarcodeScannerModal
        isOpen={isBarcodeOpen}
        onClose={() => setIsBarcodeOpen(false)}
        onScanMatched={handleBarcodeMatched}
        onScanNewBarcode={handleNewBarcodeScanned}
      />

      <ProductForm
        isOpen={isProductFormOpen}
        onClose={() => { 
          setIsProductFormOpen(false); 
          setPrefilledBarcode(''); 
          setSelectedProductToEdit(null); 
        }}
        productToEdit={selectedProductToEdit}
        onProductSaved={fetchProducts}
        prefilledBarcode={prefilledBarcode}
        user={user}
      />

      {/* Expense Modal (standardized Tucuman) */}
      {isExpenseModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel animate-fade-in" style={{ ...styles.modalContent, maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowDownRight size={18} /> Registrar Gasto Pyme (Tucumán)
              </h3>
              <button onClick={() => { setIsExpenseModalOpen(false); setCustomFlowAmount(''); setCustomFlowDesc(''); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Servicio / Tipo de Gasto</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #eef2eb', fontSize: '13px', backgroundColor: '#ffffff' }}
                >
                  <option value="Servicio de luz (EDET)">Servicio de luz (EDET)</option>
                  <option value="Servicio de agua (SAT)">Servicio de agua (SAT)</option>
                  <option value="Servicio de gas (Gasnor)">Servicio de gas (Gasnor)</option>
                  <option value="Alquiler comercial (Local)">Alquiler comercial (Local)</option>
                  <option value="Internet / Teléfono (Telecom/Fibertel)">Internet / Teléfono (Telecom/Fibertel)</option>
                  <option value="Impuestos Provinciales (DGR Rentas)">Impuestos Provinciales (DGR Rentas)</option>
                  <option value="Impuestos Municipales (TEM S.M. de Tucumán)">Impuestos Municipales (TEM S.M. de Tucumán)</option>
                  <option value="Insumos de oficina y librería">Insumos de oficina y librería</option>
                  <option value="Productos de limpieza y bazar">Productos de limpieza y bazar</option>
                  <option value="Sueldos / Comisiones de personal">Sueldos / Comisiones de personal</option>
                  <option value="Otros Gastos de Operación">Otros Gastos de Operación</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Monto ($ ARS)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={customFlowAmount}
                  onChange={(e) => setCustomFlowAmount(e.target.value)}
                  style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #eef2eb', padding: '0 10px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Detalles Adicionales (Opcional)</label>
                <textarea
                  placeholder="Ej: Factura vencimiento Junio..."
                  value={customFlowDesc}
                  onChange={(e) => setCustomFlowDesc(e.target.value)}
                  rows={2}
                  style={{ width: '100%', borderRadius: '10px', border: '1px solid #eef2eb', padding: '8px 10px', fontSize: '13px' }}
                />
              </div>

              <button
                onClick={() => handleAddCustomFlow('expense')}
                disabled={customFlowLoading}
                className="btn-danger"
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 'bold', fontSize: '13px', marginTop: '6px' }}
              >
                {customFlowLoading ? 'Registrando...' : 'Confirmar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Income Modal (standardized Tucuman) */}
      {isIncomeModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel animate-fade-in" style={{ ...styles.modalContent, maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#4c9f38', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpRight size={18} /> Registrar Ingreso Dinero
              </h3>
              <button onClick={() => { setIsIncomeModalOpen(false); setCustomFlowAmount(''); setCustomFlowDesc(''); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Concepto de Ingreso</label>
                <select
                  value={incomeCategory}
                  onChange={(e) => setIncomeCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #eef2eb', fontSize: '13px', backgroundColor: '#ffffff' }}
                >
                  <option value="Cobro de Cuenta Corriente (Cliente)">Cobro de Cuenta Corriente (Cliente)</option>
                  <option value="Aporte de Socios / Capital">Aporte de Socios / Capital</option>
                  <option value="Devolución de Mercadería (Proveedor)">Devolución de Mercadería (Proveedor)</option>
                  <option value="Venta Mayorista Especial">Venta Mayorista Especial</option>
                  <option value="Cambio de Caja Inicial">Cambio de Caja Inicial</option>
                  <option value="Otros Ingresos de Operación">Otros Ingresos de Operación</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Monto ($ ARS)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={customFlowAmount}
                  onChange={(e) => setCustomFlowAmount(e.target.value)}
                  style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #eef2eb', padding: '0 10px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#5f7a5f', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Detalles Adicionales (Opcional)</label>
                <textarea
                  placeholder="Ej: Cliente Juan Pérez pago..."
                  value={customFlowDesc}
                  onChange={(e) => setCustomFlowDesc(e.target.value)}
                  rows={2}
                  style={{ width: '100%', borderRadius: '10px', border: '1px solid #eef2eb', padding: '8px 10px', fontSize: '13px' }}
                />
              </div>

              <button
                onClick={() => handleAddCustomFlow('income')}
                disabled={customFlowLoading}
                className="btn-primary"
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 'bold', fontSize: '13px', marginTop: '6px' }}
              >
                {customFlowLoading ? 'Registrando...' : 'Confirmar Ingreso'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
const styles = {
  openCajaContainer: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
  },
  brandingHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  miniLogo: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '1px solid var(--accent-green)',
  },
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
  quickStats: {
    display: 'flex',
    margin: '12px 16px 4px',
    padding: '10px',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: '9px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '2px',
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
  },
  contentArea: {
    padding: '24px 16px 80px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  catalogGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  catalogCard: {
    padding: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    backgroundColor: 'var(--bg-surface)',
  },
  cartFloatBtn: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '90%',
    maxWidth: '430px',
    zIndex: 9,
    boxShadow: '0 4px 20px var(--accent-neon-glow)',
  },
  qtyBtn: {
    width: '28px',
    height: '28px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.03)',
    border: '1px solid var(--border-color)',
    fontSize: '16px',
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)',
  },
  navbar: {
    position: 'fixed',
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: '480px',
    height: '64px',
    background: 'rgba(255, 255, 255, 0.95)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 10,
    boxShadow: 'var(--shadow-lg)'
  },
  navItem: {
    background: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    width: '80px',
  },
  badgeCount: {
    position: 'absolute',
    top: '4px',
    right: '20px',
    backgroundColor: 'var(--accent-neon)',
    color: '#000',
    fontSize: '9px',
    fontWeight: 'bold',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal Styles
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
    maxWidth: '360px',
    padding: '24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  successIconContainer: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'rgba(100, 221, 23, 0.15)',
    color: 'var(--accent-neon)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--accent-neon)',
    boxShadow: '0 0 15px var(--accent-neon-glow)',
    marginBottom: '16px',
  },
  receiptSummary: {
    width: '100%',
    backgroundColor: 'var(--bg-base)',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '20px',
    textAlign: 'left',
    border: '1px solid var(--border-color)',
  },
  actionCard: {
    padding: '32px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer',
    borderRadius: '20px',
    backgroundColor: '#ffffff',
    border: '1px solid #eef2eb',
    position: 'relative',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  },
  cardIconContainer: {
    width: '80px',
    height: '80px',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    overflow: 'hidden',
    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
    border: '1px solid rgba(74, 124, 63, 0.15)'
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#2c3e2c',
    margin: '0 0 6px 0',
  },
  cardText: {
    fontSize: '12px',
    color: '#8fa58f',
    margin: 0,
    lineHeight: '1.3',
  }
};
