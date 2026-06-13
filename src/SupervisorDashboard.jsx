import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Check, X, Calendar, DollarSign, ArrowUpRight, 
  ArrowDownRight, Bell, Send, UserCheck, ShieldAlert, LogOut, Plus, ShoppingBag,
  RefreshCw, Home, ExternalLink
} from 'lucide-react';
import ProductForm from './ProductForm';
import InventoryHistory from './InventoryHistory';

export default function SupervisorDashboard({ user, onLogout, viewMode }) {
  // Tabs: 'inicio', 'asistencias', 'cajas', 'movimientos', 'inventario'
  const [activeTab, setActiveTab] = useState('inicio');
  
  // Product form toggle
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);


  // Data state
  const [attendances, setAttendances] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [activeWorkers, setActiveWorkers] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Extra flows form
  const [flowType, setFlowType] = useState('expense');
  const [flowAmount, setFlowAmount] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowLoading, setFlowLoading] = useState(false);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAttendances();
    fetchCajas();
    fetchActiveWorkers();
  }, []);

  async function fetchAttendances() {
    setLoading(true);
    try {
      // Fetch all attendance records join profiles
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          profiles:employee_id (name, role)
        `)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false });

      if (error) throw error;
      setAttendances(data || []);
    } catch (err) {
      console.error('Error fetching attendances:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCajas() {
    try {
      // Fetch all cash registers join profiles (seller)
      const { data, error } = await supabase
        .from('cash_registers')
        .select(`
          *,
          seller:seller_id (name)
        `)
        .order('opened_at', { ascending: false });

      if (error) throw error;
      setCajas(data || []);
    } catch (err) {
      console.error('Error fetching cajas:', err);
    }
  }

  async function fetchActiveWorkers() {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance')
        .select('*, profiles:employee_id(name, role)')
        .eq('date', todayStr)
        .not('check_in', 'is', null);
      if (error) throw error;
      setActiveWorkers(data || []);
    } catch (e) {
      console.error('Error fetching active workers:', e);
    }
  }

  const handleValidateAttendance = async (attendanceId, statusText, employeeName, employeeId, date) => {
    try {
      const now = new Date();
      // 1. Update DB record
      const { error } = await supabase
        .from('attendance')
        .update({
          status: statusText,
          validated_by: user.id,
          validated_at: now.toISOString()
        })
        .eq('id', attendanceId);

      if (error) throw error;

      // 2. Log in-app notification for the specific seller
      await supabase.from('notifications').insert({
        recipient_id: employeeId,
        title: `Asistencia ${statusText === 'validated' ? 'Validada' : 'Rechazada'}`,
        message: `El supervisor ${user.name} ha ${statusText === 'validated' ? 'aprobado' : 'rechazado'} tu asistencia del ${new Date(date).toLocaleDateString('es-AR')}.`
      });

      // 3. Log broadcast notification
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: 'Asistencia Auditada',
        message: `Supervisor ${user.name} ha ${statusText === 'validated' ? 'aprobado' : 'rechazado'} la asistencia de ${employeeName} (${date}).`
      });

      // 4. Trigger WhatsApp link
      const statusTitle = statusText === 'validated' ? 'APROBADA ✅' : 'RECHAZADA ❌';
      const waText = `*BO GROWCLUB* 🌿%0A` +
        `---------------------------%0A` +
        `*CONTROL DE ASISTENCIA*%0A` +
        `Empleado: ${employeeName}%0A` +
        `Fecha: ${new Date(date).toLocaleDateString('es-AR')}%0A` +
        `Estado: *${statusTitle}*%0A` +
        `Auditado por: ${user.name}%0A` +
        `---------------------------%0A` +
        `_Enviado desde App BO Growclub_`;

      const testSupervisorPhone = '543816490060';
      const waLink = `https://wa.me/${testSupervisorPhone}?text=${waText}`;

      // Open WhatsApp
      window.open(waLink, '_blank');

      // Refresh list
      fetchAttendances();
    } catch (err) {
      console.error('Error validating attendance:', err);
      alert('Error al actualizar la asistencia.');
    }
  };

  const handleValidateCaja = async (cajaId, statusText, sellerName, sellerId, expectedCash, actualCash) => {
    try {
      const now = new Date();
      const diff = parseFloat(actualCash || 0) - parseFloat(expectedCash || 0);

      // 1. Update DB record
      const { error } = await supabase
        .from('cash_registers')
        .update({
          validation_status: statusText,
          validated_by: user.id,
          validated_at: now.toISOString()
        })
        .eq('id', cajaId);

      if (error) throw error;

      // 2. Log in-app notification for the seller
      await supabase.from('notifications').insert({
        recipient_id: sellerId,
        title: `Caja ${statusText === 'approved' ? 'Aprobada' : 'Rechazada'}`,
        message: `El supervisor ${user.name} ha ${statusText === 'approved' ? 'aprobado' : 'rechazado'} tu cierre de caja. Diferencia: $${diff.toLocaleString('es-AR')}.`
      });

      // 3. Log broadcast notification for admin
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: 'Cierre de Caja Auditado',
        message: `Supervisor ${user.name} ha ${statusText === 'approved' ? 'aprobado' : 'rechazado'} la caja de ${sellerName}. Diferencia: $${diff.toLocaleString('es-AR')}.`
      });

      // 4. Trigger WhatsApp link
      const statusTitle = statusText === 'approved' ? 'APROBADA ✅' : 'RECHAZADA ❌';
      const waText = `*BO GROWCLUB* 🌿%0A` +
        `---------------------------%0A` +
        `*AUDITORÍA DE CAJA*%0A` +
        `Vendedor: ${sellerName}%0A` +
        `Caja Física: $${parseFloat(actualCash).toFixed(2)}%0A` +
        `Diferencia: $${diff.toFixed(2)}%0A` +
        `Estado Cierre: *${statusTitle}*%0A` +
        `Auditado por: ${user.name}%0A` +
        `---------------------------%0A` +
        `_Enviado desde App BO Growclub_`;

      const testSupervisorPhone = '543816490060';
      const waLink = `https://wa.me/${testSupervisorPhone}?text=${waText}`;

      // Open WhatsApp
      window.open(waLink, '_blank');

      // Refresh list
      fetchCajas();
    } catch (err) {
      console.error('Error validating caja:', err);
      alert('Error al auditar la caja.');
    }
  };

  const handleCancelClosure = async (cajaId, sellerName, sellerId) => {
    if (!window.confirm(`¿Estás seguro de que deseas cancelar el cierre de caja de ${sellerName} y reabrirla? El vendedor podrá continuar vendiendo.`)) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('cash_registers')
        .update({
          status: 'open',
          closed_at: null,
          closing_balance: null,
          actual_balance: null,
          validation_status: 'pending'
        })
        .eq('id', cajaId);

      if (error) throw error;

      // Log in-app notification for the seller
      await supabase.from('notifications').insert({
        recipient_id: sellerId,
        title: 'Caja Reabierta',
        message: `El supervisor ${user.name} ha cancelado tu cierre de caja. Tu caja está abierta nuevamente para continuar operando.`
      });

      // Log broadcast notification for admin
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: 'Cierre de Caja Cancelado',
        message: `El supervisor ${user.name} canceló el cierre de caja de ${sellerName} (Reabierta).`
      });

      alert('El cierre de caja ha sido cancelado y la caja ha sido reabierta.');
      fetchCajas();
    } catch (err) {
      console.error('Error cancelling closure:', err);
      alert('Error al reabrir la caja.');
    }
  };

  const handleCancelCaja = async (cajaId, sellerName, sellerId) => {
    if (!window.confirm(`¿Estás seguro de que deseas cancelar definitivamente esta sesión de caja abierta de ${sellerName}? Se marcará como Cancelada en el historial.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('cash_registers')
        .update({
          status: 'cancelled',
          closed_at: new Date().toISOString()
        })
        .eq('id', cajaId);

      if (error) throw error;

      // Log in-app notification for the seller
      await supabase.from('notifications').insert({
        recipient_id: sellerId,
        title: 'Caja Cancelada',
        message: `El supervisor ${user.name} ha cancelado tu sesión de caja abierta.`
      });

      // Log broadcast notification for admin
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: 'Sesión de Caja Cancelada',
        message: `El supervisor ${user.name} canceló la sesión de caja de ${sellerName}.`
      });

      alert('La sesión de caja ha sido cancelada.');
      fetchCajas();
    } catch (err) {
      console.error('Error cancelling caja:', err);
      alert('Error al cancelar la sesión de caja.');
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

      // Log notification
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        title: flowType === 'income' ? 'Ingreso Supervisor' : 'Egreso Supervisor',
        message: `El supervisor ${user.name} registró un ${flowType === 'income' ? 'ingreso' : 'egreso'} de $${amt.toLocaleString('es-AR')} por: ${flowDesc.trim()}.`
      });

      setFlowAmount('');
      setFlowDesc('');
      alert('Movimiento registrado exitosamente!');
    } catch (err) {
      console.error('Flow register error:', err);
      alert('Error registrando movimiento.');
    } finally {
      setFlowLoading(false);
    }
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
              <span style={{ fontSize: '10px', color: 'var(--accent-gold)' }}>🛡️ Supervisor</span>
            </div>
          </div>

          <button 
            onClick={() => setActiveTab('inicio')} 
            className={`sidebar-item ${activeTab === 'inicio' ? 'active' : ''}`}
          >
            <Home size={18} />
            <span>Inicio</span>
          </button>

          <button 
            onClick={() => setActiveTab('asistencias')} 
            className={`sidebar-item ${activeTab === 'asistencias' ? 'active' : ''}`}
          >
            <UserCheck size={18} />
            <span>Asistencias</span>
          </button>

          <button 
            onClick={() => setActiveTab('cajas')} 
            className={`sidebar-item ${activeTab === 'cajas' ? 'active' : ''}`}
          >
            <DollarSign size={18} />
            <span>Cajas</span>
          </button>

          <button 
            onClick={() => setActiveTab('movimientos')} 
            className={`sidebar-item ${activeTab === 'movimientos' ? 'active' : ''}`}
          >
            <ArrowUpRight size={18} />
            <span>Movimientos</span>
          </button>

          <button 
            onClick={() => setActiveTab('inventario')} 
            className={`sidebar-item ${activeTab === 'inventario' ? 'active' : ''}`}
          >
            <ShoppingBag size={18} />
            <span>Inventario</span>
          </button>

          <div style={{ marginTop: 'auto', padding: '8px' }}>
            <div style={{ padding: '8px 14px', fontSize: '11px', borderTop: '1px solid var(--border-color)', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Sesión: <strong>{user.name}</strong>
            </div>
            <button onClick={onLogout} className="sidebar-item" style={{ color: '#ef4444' }}>
              <LogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className={viewMode === 'desktop' ? 'dashboard-content' : ''} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* App Header (mobile only) */}
        {viewMode !== 'desktop' && (
          <header style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.jpeg" alt="BO" style={styles.headerLogo} />
              <div>
                <h1 style={{ fontSize: '15px', color: 'var(--text-primary)', margin: '0' }}>BO growclub</h1>
                <span style={{ fontSize: '9px', color: 'var(--accent-gold)' }}>🛡️ Panel Supervisor</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', fontWeight: 'bold' }}>{user.name}</p>
                <p style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Supervisor</p>
              </div>
              <button onClick={() => setIsProductFormOpen(true)} style={{ ...styles.logoutBtn, color: 'var(--accent-neon)', marginRight: '4px' }} title="Registrar Producto">
                <Plus size={16} />
              </button>
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
              <h2 style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>
                {activeTab === 'inicio' && 'Inicio y Acciones'}
                {activeTab === 'asistencias' && 'Control de Asistencias'}
                {activeTab === 'cajas' && 'Auditoría de Cajas'}
                {activeTab === 'movimientos' && 'Registros de Movimientos'}
                {activeTab === 'inventario' && 'Historial de Inventario'}
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bienvenido, {user.name} (Supervisor)</p>
            </div>
            <button 
              onClick={() => setIsProductFormOpen(true)} 
              className="btn-primary" 
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              <Plus size={15} /> Registrar Producto
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main style={styles.contentArea}>

          {/* Tab 0: INICIO / HOME */}
          {activeTab === 'inicio' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', flex: 1 }}>
              
              {/* Header: Greeting + Digital clock */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-heading)' }}>
                    ¡Hola, {user.name}! 🛡️
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Panel del Supervisor. Monitorea asistencias, audita cajas y administra el inventario.
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
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px',
                  width: '100%'
                }}>
                  {/* Metric 1: Cajas Abiertas */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 63, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c3f' }}>
                      <Check size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Cajas Activas</span>
                      <strong style={{ fontSize: '16px', color: '#2c3e2c', fontWeight: '800' }}>
                        {cajas.filter(c => c.status === 'open').length} abiertas
                      </strong>
                    </div>
                  </div>

                  {/* Metric 2: Personal Laburando */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 63, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c3f' }}>
                      <UserCheck size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Personal Activo</span>
                      <strong style={{ fontSize: '16px', color: '#2c3e2c', fontWeight: '800' }}>
                        {activeWorkers.length} de turno
                      </strong>
                    </div>
                  </div>

                  {/* Metric 3: Validaciones Pendientes */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(184, 148, 74, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8944a' }}>
                      <ShieldAlert size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#8fa58f', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Pendiente Aprobación</span>
                      <strong style={{ fontSize: '16px', color: '#b8944a', fontWeight: '800' }}>
                        {attendances.filter(a => a.status === 'pending').length} asistencias
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Responsive Cards Grid: 6 columns on PC, 2 columns on mobile */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'desktop' ? 'repeat(6, 1fr)' : 'repeat(2, 1fr)',
                gap: '16px',
                width: '100%'
              }}>
                {/* Card 1: Validar Asistencias */}
                <div 
                  onClick={() => setActiveTab('asistencias')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_asistencia.png" alt="Asistencias" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Asistencias</h4>
                  <p style={styles.cardText}>Validar ingresos de personal</p>
                </div>

                {/* Card 2: Auditar Cajas */}
                <div 
                  onClick={() => setActiveTab('cajas')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_metricas.png" alt="Cajas" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Auditar Cajas</h4>
                  <p style={styles.cardText}>Controlar arqueos declarados</p>
                </div>

                {/* Card 3: Registrar Movimiento */}
                <div 
                  onClick={() => setActiveTab('movimientos')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_dinero.png" alt="Movimientos" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Registrar Flujos</h4>
                  <p style={styles.cardText}>Añadir ingresos/egresos extra</p>
                </div>

                {/* Card 4: Historial de Inventario */}
                <div 
                  onClick={() => setActiveTab('inventario')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_inventario.png" alt="Inventario" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Inventario</h4>
                  <p style={styles.cardText}>Auditar bitácora de productos</p>
                </div>

                {/* Card 5: Registrar Producto */}
                <div 
                  onClick={() => setIsProductFormOpen(true)}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_venta.png" alt="Nuevo Producto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Registrar Producto</h4>
                  <p style={styles.cardText}>Crear producto en base</p>
                </div>

                {/* Card 6: Solicitar Compras */}
                <div 
                  onClick={() => window.open('https://boeweb.netlify.app/', '_blank')}
                  className="glass-panel hover-card" 
                  style={styles.actionCard}
                >
                  <div style={styles.cardIconContainer}>
                    <img src="/images/zen_compras.png" alt="Compras" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <h4 style={styles.cardTitle}>Solicitar Compras</h4>
                  <p style={styles.cardText}>Acceder a BOE compras web</p>
                  <ExternalLink size={12} style={{ position: 'absolute', top: '12px', right: '12px', color: '#ec4899' }} />
                </div>
              </div>

              {/* PC Version Content Filler: Active Workers & Cash Sessions */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'desktop' ? '1fr 1.2fr' : '1fr',
                gap: '24px',
                marginTop: '12px',
                width: '100%'
              }}>
                {/* Panel 1: Personal Activo Hoy */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                      <UserCheck size={16} style={{ color: '#4a7c3f' }} />
                      <span>Personal Laburando Hoy</span>
                    </h3>
                    <button 
                      onClick={() => setActiveTab('asistencias')}
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '10px', height: 'auto', width: 'auto', borderRadius: '6px', borderColor: '#4a7c3f', color: '#4a7c3f', fontWeight: 'bold' }}
                    >
                      Control Asistencias
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {activeWorkers.map(w => {
                      const checkInTime = new Date(w.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={w.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          border: '1px solid #f5f5f4',
                          borderRadius: '10px',
                          fontSize: '12px',
                          backgroundColor: '#fbfbfa'
                        }}>
                          <div>
                            <span style={{ fontWeight: '700', color: '#2c3e2c' }}>{w.profiles?.name}</span>
                            <span style={{ color: '#8fa58f', marginLeft: '8px', textTransform: 'capitalize', fontSize: '10px' }}>
                              ({w.profiles?.role})
                            </span>
                          </div>
                          <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>
                            Ingreso: {checkInTime}
                          </span>
                        </div>
                      );
                    })}
                    {activeWorkers.length === 0 && (
                      <p style={{ textAlign: 'center', color: '#8fa58f', fontSize: '12px', padding: '24px 0', margin: 0 }}>
                        Ningún empleado ha registrado entrada validada hoy.
                      </p>
                    )}
                  </div>
                </div>

                {/* Panel 2: Auditoría de Cajas de Hoy */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', border: '1px solid #eef2eb', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f4', paddingBottom: '12px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#2c3e2c', margin: 0 }}>
                      <DollarSign size={16} style={{ color: '#4a7c3f' }} />
                      <span>Resumen de Cajas Recientes</span>
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {cajas.slice(0, 4).map(c => {
                      const openTime = new Date(c.opened_at).toLocaleDateString('es-AR') + ' ' + new Date(c.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={c.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          border: '1px solid #f5f5f4',
                          borderRadius: '10px',
                          fontSize: '12px'
                        }}>
                          <div>
                            <span style={{ fontWeight: '700', color: '#2c3e2c' }}>{c.seller?.name}</span>
                            <span style={{ color: '#8fa58f', marginLeft: '8px', fontSize: '11px' }}>
                              Apertura: {openTime}
                            </span>
                          </div>
                          {c.status === 'open' ? (
                            <span className="badge badge-warning" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>Abierta</span>
                          ) : c.status === 'closed' ? (
                            <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>Cerrada</span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>Cancelada</span>
                          )}
                        </div>
                      );
                    })}
                    {cajas.length === 0 && (
                      <p style={{ textAlign: 'center', color: '#8fa58f', fontSize: '12px', padding: '16px 0', margin: 0 }}>
                        No hay sesiones de caja registradas recientemente.
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button 
                      onClick={() => setActiveTab('cajas')}
                      className="btn-secondary" 
                      style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 'bold', borderRadius: '8px', borderColor: '#4a7c3f', color: '#4a7c3f' }}
                    >
                      Ir a Auditoría Cajas
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 1: ATTENDANCE CONTROL */}
          {activeTab === 'asistencias' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewMode !== 'desktop' && (
                <>
                  <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <UserCheck size={18} className="text-gold" />
                    <span>Validar Asistencias</span>
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Registros de fichajes del personal. Valida para confirmar el presentismo.
                  </p>
                </>
              )}

              <div style={viewMode === 'desktop' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginTop: '8px' } : { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                {attendances.map(att => {
                  const dateObj = new Date(att.date + 'T00:00:00'); // Prevent timezone shift
                  const checkInTime = new Date(att.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const employeeName = att.profiles?.name || 'Empleado';

                  return (
                    <div key={att.id} className="glass-panel" style={styles.recordCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{employeeName}</h4>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Fecha: {dateObj.toLocaleDateString('es-AR')}
                          </p>
                        </div>
                        <span className={`badge ${
                          att.status === 'validated' ? 'badge-success' : 
                          att.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {att.status === 'validated' ? 'Aprobada' : 
                           att.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        <span>Entrada: <strong style={{ color: 'var(--text-primary)' }}>{checkInTime}</strong></span>
                        {att.check_out && (
                          <span>Salida: <strong style={{ color: 'var(--text-primary)' }}>
                            {new Date(att.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </strong></span>
                        )}
                      </div>

                      {att.status === 'pending' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button
                            onClick={() => handleValidateAttendance(att.id, 'rejected', employeeName, att.employee_id, att.date)}
                            className="btn-danger"
                            style={{ padding: '8px', fontSize: '12px' }}
                          >
                            <X size={14} /> Rechazar
                          </button>
                          <button
                            onClick={() => handleValidateAttendance(att.id, 'validated', employeeName, att.employee_id, att.date)}
                            className="btn-primary"
                            style={{ padding: '8px', fontSize: '12px' }}
                          >
                            <Check size={14} /> Validar (Wame)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {attendances.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                    No hay fichajes registrados en el sistema.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: CASH SHIFTS CONTROL */}
          {activeTab === 'cajas' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewMode !== 'desktop' && (
                <>
                  <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <DollarSign size={18} className="text-gold" />
                    <span>Control de Cajas</span>
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Cierres de caja reportados por los vendedores. Verifica saldos físicos declarados.
                  </p>
                </>
              )}

              <div style={viewMode === 'desktop' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', marginTop: '8px' } : { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                {cajas.map(c => {
                  const openTime = new Date(c.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const closeTime = c.closed_at 
                    ? new Date(c.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : 'En curso';
                  
                  const expectedCash = parseFloat(c.closing_balance || 0); // Note: we calculated closing_balance mathematically on close
                  const actualCash = parseFloat(c.actual_balance || 0);
                  const difference = actualCash - expectedCash;
                  
                  return (
                    <div key={c.id} className="glass-panel" style={styles.recordCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{c.seller?.name || 'Vendedor'}</h4>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Apertura: {new Date(c.opened_at).toLocaleDateString('es-AR')}
                          </p>
                        </div>
                        <span className={`badge ${
                          c.status === 'cancelled' ? 'badge-danger' :
                          c.validation_status === 'approved' ? 'badge-success' : 
                          c.validation_status === 'rejected' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {c.status === 'cancelled' ? 'Cancelada' :
                           c.validation_status === 'approved' ? 'Aprobada' : 
                           c.validation_status === 'rejected' ? 'Observada' : 
                           c.status === 'open' ? 'Abierta' : 'Pendiente Auditar'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '8px 10px', backgroundColor: 'var(--bg-base)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Saldo Inicial:</span>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>${c.opening_balance.toLocaleString('es-AR')}</span>
                        </div>
                        {c.status === 'closed' && (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Esperado Sistema:</span>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>${expectedCash.toLocaleString('es-AR')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Físico Declarado:</span>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>${actualCash.toLocaleString('es-AR')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '4px', marginTop: '4px' }}>
                              <span>Diferencia:</span>
                              <span style={{ fontWeight: 'bold', color: difference === 0 ? 'var(--accent-green)' : '#ef4444' }}>
                                {difference > 0 ? `+$${difference.toLocaleString('es-AR')}` : `-$${Math.abs(difference).toLocaleString('es-AR')}`}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        <span>Apertura: {openTime}</span>
                        <span>Cierre: {closeTime}</span>
                      </div>

                      {c.status === 'closed' && c.validation_status === 'pending' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button
                            onClick={() => handleValidateCaja(c.id, 'rejected', c.seller?.name, c.seller_id, expectedCash, actualCash)}
                            className="btn-danger"
                            style={{ padding: '8px', fontSize: '11px' }}
                          >
                            <X size={14} /> Rechazar
                          </button>
                          <button
                            onClick={() => handleValidateCaja(c.id, 'approved', c.seller?.name, c.seller_id, expectedCash, actualCash)}
                            className="btn-primary"
                            style={{ padding: '8px', fontSize: '11px' }}
                          >
                            <Check size={14} /> Aprobar cierre (Wame)
                          </button>
                        </div>
                      )}

                      {c.status === 'closed' && (
                        <button
                          onClick={() => handleCancelClosure(c.id, c.seller?.name, c.seller_id)}
                          className="btn-secondary"
                          style={{ padding: '8px', fontSize: '11px', width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#b8944a', borderColor: '#b8944a' }}
                        >
                          <RefreshCw size={12} /> Reabrir Caja (Cancelar Cierre)
                        </button>
                      )}

                      {c.status === 'open' && (
                        <button
                          onClick={() => handleCancelCaja(c.id, c.seller?.name, c.seller_id)}
                          className="btn-danger"
                          style={{ padding: '8px', fontSize: '11px', width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <X size={12} /> Cancelar Sesión de Caja
                        </button>
                      )}
                    </div>
                  );
                })}
                {cajas.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                    No hay registros de caja disponibles.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: DIRECT FLOW ENTRY */}
          {activeTab === 'movimientos' && (
            <div className="animate-fade-in glass-panel" style={{ padding: '20px', maxWidth: '440px', margin: viewMode === 'desktop' ? '0' : '0 auto', width: '100%' }}>
              <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                <ArrowUpRight size={18} className="text-gold" />
                <span>Registrar Entrada/Salida</span>
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Registra egresos directos (gastos, retiros de dinero) o ingresos extraordinarios de la tienda.
              </p>

              <form onSubmit={handleAddFlow} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Tipo de Movimiento</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setFlowType('expense')}
                      className={flowType === 'expense' ? 'btn-danger' : 'btn-secondary'}
                      style={{ padding: '10px', fontSize: '13px' }}
                    >
                      <ArrowDownRight size={14} /> Egreso / Gasto
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlowType('income')}
                      className={flowType === 'income' ? 'btn-primary' : 'btn-secondary'}
                      style={{ padding: '10px', fontSize: '13px' }}
                    >
                      <ArrowUpRight size={14} /> Ingreso Extra
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
                    placeholder="Ej. Compra de insumos de Growshop, pago de internet..."
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
            </div>
          )}

          {/* Tab 4: INVENTORY TRACKING HISTORY */}
          {activeTab === 'inventario' && (
            <div className="animate-fade-in">
              <InventoryHistory user={user} viewMode={viewMode} />
            </div>
          )}

        </main>

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
              onClick={() => setActiveTab('asistencias')} 
              style={{ 
                ...styles.navItem, 
                color: activeTab === 'asistencias' ? 'var(--accent-green)' : 'var(--text-secondary)',
                background: activeTab === 'asistencias' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
              }}
            >
              <UserCheck size={20} />
              <span style={{ fontSize: '10px' }}>Asistencias</span>
            </button>

            <button 
              onClick={() => setActiveTab('cajas')} 
              style={{ 
                ...styles.navItem, 
                color: activeTab === 'cajas' ? 'var(--accent-green)' : 'var(--text-secondary)',
                background: activeTab === 'cajas' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
              }}
            >
              <DollarSign size={20} />
              <span style={{ fontSize: '10px' }}>Cajas</span>
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
              onClick={() => setActiveTab('inventario')} 
              style={{ 
                ...styles.navItem, 
                color: activeTab === 'inventario' ? 'var(--accent-green)' : 'var(--text-secondary)',
                background: activeTab === 'inventario' ? 'rgba(74, 124, 63, 0.06)' : 'transparent'
              }}
            >
              <ShoppingBag size={20} />
              <span style={{ fontSize: '10px' }}>Inventario</span>
            </button>
          </nav>
        )}

        <ProductForm
          isOpen={isProductFormOpen}
          onClose={() => setIsProductFormOpen(false)}
          productToEdit={null}
          onProductSaved={() => { fetchCajas(); alert('Catálogo actualizado.'); }}
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
  contentArea: {
    padding: '24px 16px 80px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  recordCard: {
    padding: '16px',
    border: '1px solid var(--border-color)',
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
  actionCard: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    position: 'relative',
    transition: 'all 0.2s ease',
  },
  cardIconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
    border: '1px solid rgba(74, 124, 63, 0.15)'
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: '0 0 4px 0',
  },
  cardText: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.2',
  }
};
