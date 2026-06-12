import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Eye, CheckCircle, Package, User, Clock, MapPin, Image, ChevronDown, ChevronUp } from 'lucide-react';

export default function InventoryHistory({ user, viewMode }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'seen'

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching product logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSeen = async (logId) => {
    try {
      const { error } = await supabase
        .from('product_logs')
        .update({ seen_by_supervisor: true })
        .eq('id', logId);

      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, seen_by_supervisor: true } : l));
    } catch (err) {
      console.error('Error marking as seen:', err);
    }
  };

  const handleMarkAllSeen = async () => {
    try {
      const { error } = await supabase
        .from('product_logs')
        .update({ seen_by_supervisor: true })
        .eq('seen_by_supervisor', false);

      if (error) throw error;
      setLogs(prev => prev.map(l => ({ ...l, seen_by_supervisor: true })));
    } catch (err) {
      console.error('Error marking all as seen:', err);
    }
  };

  const filteredLogs = logs.filter(l => {
    if (filter === 'pending') return !l.seen_by_supervisor;
    if (filter === 'seen') return l.seen_by_supervisor;
    return true;
  });

  const pendingCount = logs.filter(l => !l.seen_by_supervisor).length;

  const getActionLabel = (action) => {
    switch (action) {
      case 'created': return { text: 'Creó', color: 'var(--accent-green)', bg: 'rgba(74, 124, 63, 0.08)' };
      case 'edited': return { text: 'Editó', color: 'var(--accent-gold)', bg: 'rgba(184, 148, 74, 0.08)' };
      case 'deleted': return { text: 'Eliminó', color: '#dc3535', bg: 'rgba(220, 53, 53, 0.08)' };
      default: return { text: action, color: 'var(--text-secondary)', bg: 'transparent' };
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Package size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <p>Cargando historial...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      
      {/* Header with filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={18} className="text-gold" />
            Historial de Inventario
          </h3>
          {pendingCount > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--accent-gold)', marginTop: '2px' }}>
              {pendingCount} cambio{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''} de revisión
            </p>
          )}
        </div>
        {pendingCount > 0 && (
          <button onClick={handleMarkAllSeen} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }}>
            <CheckCircle size={14} /> Marcar todo visto
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { key: 'all', label: 'Todos' },
          { key: 'pending', label: `Pendientes (${pendingCount})` },
          { key: 'seen', label: 'Vistos' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              borderRadius: '20px',
              background: filter === f.key ? 'var(--accent-green)' : 'var(--bg-surface)',
              color: filter === f.key ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${filter === f.key ? 'var(--accent-green)' : 'var(--border-color)'}`,
              fontWeight: filter === f.key ? '600' : '400',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Logs list */}
      {filteredLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
          <Eye size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
          <p style={{ fontSize: '13px' }}>No hay registros {filter === 'pending' ? 'pendientes' : filter === 'seen' ? 'marcados como vistos' : ''}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredLogs.map(log => {
            const actionInfo = getActionLabel(log.action);
            const isExpanded = expandedId === log.id;
            const details = log.details || {};

            return (
              <div
                key={log.id}
                className="glass-panel"
                style={{
                  padding: '12px 14px',
                  borderLeft: `3px solid ${log.seen_by_supervisor ? 'var(--border-color)' : actionInfo.color}`,
                  opacity: log.seen_by_supervisor ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Main row */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                        background: actionInfo.bg, color: actionInfo.color, textTransform: 'uppercase'
                      }}>
                        {actionInfo.text}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {log.product_name || 'Producto'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <User size={11} /> {log.user_name || 'Usuario'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={11} /> {formatDate(log.created_at)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {!log.seen_by_supervisor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkSeen(log.id); }}
                        className="btn-primary"
                        style={{ padding: '5px 10px', fontSize: '10px', borderRadius: '8px' }}
                      >
                        <CheckCircle size={12} /> Visto
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="animate-fade-in" style={{
                    marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)',
                    fontSize: '12px', color: 'var(--text-secondary)'
                  }}>
                    {details.price && <p>💰 Precio: ${details.price}</p>}
                    {details.stock !== undefined && <p>📦 Stock: {details.stock}</p>}
                    {details.category && <p>🏷️ Categoría: {details.category}</p>}
                    {details.barcode && <p>📊 Código: {details.barcode}</p>}
                    {(details.latitude && details.longitude) && (
                      <p style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} />
                        <a
                          href={`https://maps.google.com/?q=${details.latitude},${details.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-green)', textDecoration: 'underline' }}
                        >
                          Ver ubicación en Google Maps
                        </a>
                      </p>
                    )}
                    {details.image_url && (
                      <div style={{ marginTop: '8px' }}>
                        <img
                          src={details.image_url}
                          alt="Producto"
                          style={{ width: '100%', maxWidth: '200px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
