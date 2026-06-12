import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Bell, X, CheckCheck, Info, Calendar, DollarSign, UserCheck } from 'lucide-react';

export default function NotificationsList({ user, isOpen, onClose, onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (!user) return;
    
    fetchNotifications();

    // Subscribe to real-time database changes on the notifications table
    const channel = supabase
      .channel('realtime-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new;
          
          // Check if notification is relevant to this user
          const isRelevant = 
            newNotif.recipient_role === 'all' || 
            newNotif.recipient_role === user.role || 
            newNotif.recipient_id === user.id;

          if (isRelevant) {
            // Add to list
            setNotifications(prev => [newNotif, ...prev]);
            
            // Add to toast banner list (auto-remove after 5s)
            const toastId = Date.now();
            setToasts(prev => [...prev, { ...newNotif, toastId }]);
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.toastId !== toastId));
            }, 5000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Update unread count back to the header
  useEffect(() => {
    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount);
    }
  }, [notifications]);

  const fetchNotifications = async () => {
    try {
      let q = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      // Filter relevance
      // Note: PostgREST doesn't support complex OR filters natively in simple query chains easily,
      // so we can query and filter on client side, OR use standard filtering:
      // Since we want notifications for this role, or user ID, or 'all', we can fetch and filter on client-side
      // to keep it simple and robust, or write a filtered query. Let's filter on the client side since
      // limit is 30, which is perfect for mobile screens.
      
      const { data, error } = await q;
      if (error) throw error;

      const filtered = (data || []).filter(n => 
        n.recipient_role === 'all' || 
        n.recipient_role === user.role || 
        n.recipient_id === user.id
      );

      setNotifications(filtered);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking read:', err);
    }
  };

  const removeToast = (toastId) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  };

  const getIcon = (title) => {
    const t = title.toLowerCase();
    if (t.includes('caja')) return <DollarSign size={16} className="text-gold" />;
    if (attIcon(t)) return <UserCheck size={16} className="text-success" />;
    return <Info size={16} className="text-success" />;
  };
  
  const attIcon = (title) => {
    return title.includes('asistencia') || title.includes('entrada') || title.includes('salida');
  };

  return (
    <>
      {/* Toast Notification Banner Container (Fades in at the top of the screen) */}
      <div style={styles.toastContainer}>
        {toasts.map(toast => (
          <div key={toast.toastId} className="glass-panel pulse-neon" style={styles.toastCard}>
            <div style={styles.toastContent}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getIcon(toast.title)}
                <strong style={{ fontSize: '12px' }}>{toast.title}</strong>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {toast.message}
              </p>
            </div>
            <button onClick={() => removeToast(toast.toastId)} style={styles.toastCloseBtn}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Slide-out Sidebar Drawer */}
      {isOpen && (
        <div style={styles.overlay} onClick={onClose}>
          <div className="glass-panel" style={styles.drawer} onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div style={styles.drawerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} className="text-success" />
                <h3 style={{ fontSize: '16px' }}>Notificaciones</h3>
              </div>
              <button onClick={onClose} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            {/* Actions */}
            <div style={styles.drawerActions}>
              <button onClick={handleMarkAllRead} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', width: '100%' }}>
                <CheckCheck size={14} /> Marcar todas como leídas
              </button>
            </div>

            {/* List */}
            <div style={styles.notifList}>
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  style={{
                    ...styles.notifCard,
                    borderLeft: n.is_read ? '2px solid transparent' : '2px solid var(--accent-neon)',
                    backgroundColor: n.is_read ? 'rgba(0,0,0,0.1)' : 'rgba(100, 221, 23, 0.03)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {getIcon(n.title)}
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: n.is_read ? 'var(--text-primary)' : 'var(--accent-neon)' }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {n.message}
                  </p>
                </div>
              ))}
              {notifications.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px', fontSize: '12px' }}>
                  No hay notificaciones.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  toastContainer: {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '90%',
    maxWidth: '440px',
    zIndex: 999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none', // Allow clicking behind container
  },
  toastCard: {
    pointerEvents: 'auto', // Re-enable clicking for individual cards
    padding: '12px 16px',
    backgroundColor: 'rgba(11, 17, 11, 0.95)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    border: '1px solid var(--accent-neon)',
  },
  toastContent: {
    flex: 1,
    textAlign: 'left',
  },
  toastCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
    marginLeft: '12px',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 90,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: '100%',
    width: '85%',
    maxWidth: '360px',
    backgroundColor: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border-color)',
    borderRadius: '16px 0 0 16px',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '12px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
  },
  drawerActions: {
    marginTop: '12px',
    marginBottom: '8px',
  },
  notifList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  notifCard: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    textAlign: 'left',
  }
};
