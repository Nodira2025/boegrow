import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Check, X, Calendar, DollarSign, ArrowUpRight, 
  ArrowDownRight, Bell, Send, UserCheck, ShieldAlert, LogOut, Plus, ShoppingBag
} from 'lucide-react';
import ProductForm from './ProductForm';
import InventoryHistory from './InventoryHistory';

export default function SupervisorDashboard({ user, onLogout, viewMode }) {
  // Tabs: 'asistencias', 'cajas', 'movimientos', 'inventario'
  const [activeTab, setActiveTab] = useState('asistencias');
  
  // Product form toggle
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);


  // Data state
  const [attendances, setAttendances] = useState([]);
  const [cajas, setCajas] = useState([]);
  
  // Extra flows form
  const [flowType, setFlowType] = useState('expense');
  const [flowAmount, setFlowAmount] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [flowLoading, setFlowLoading] = useState(false);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAttendances();
    fetchCajas();
  }, []);

  const fetchAttendances = async () => {
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
  };

  const fetchCajas = async () => {
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
  };

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
                          c.validation_status === 'approved' ? 'badge-success' : 
                          c.validation_status === 'rejected' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {c.validation_status === 'approved' ? 'Aprobada' : 
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
  }
};
