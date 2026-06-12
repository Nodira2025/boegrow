import React, { useState, useEffect } from 'react';
import PinLogin from './PinLogin';
import VendedorDashboard from './VendedorDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import AdminDashboard from './AdminDashboard';
import NotificationsList from './NotificationsList';
import LayoutSwitcher from './LayoutSwitcher';
import { Bell, Settings, X } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Settings states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // View mode: 'mobile' or 'desktop'
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('bo_view_mode') || 'mobile';
  });

  const toggleViewMode = () => {
    const next = viewMode === 'mobile' ? 'desktop' : 'mobile';
    setViewMode(next);
    localStorage.setItem('bo_view_mode', next);
  };

  const handleLogin = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
    setIsNotifOpen(false);
    setUnreadCount(0);
    setIsSettingsOpen(false);
  };

  return (
    <div className={`app-container ${viewMode === 'desktop' ? 'desktop-mode' : ''}`}>
      {/* Notifications overlay */}
      {user && (
        <NotificationsList
          user={user}
          isOpen={isNotifOpen}
          onClose={() => setIsNotifOpen(false)}
          onUnreadCountChange={setUnreadCount}
        />
      )}

      {!user ? (
        <PinLogin onLogin={handleLogin} viewMode={viewMode} onToggleViewMode={toggleViewMode} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Top action bar: Layout switch + Bell + Settings */}
          <div style={styles.topBar}>
            <LayoutSwitcher viewMode={viewMode} onToggle={toggleViewMode} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* Settings */}
              <button
                onClick={() => {
                  setApiKeyInput(localStorage.getItem('gemini_api_key') || '');
                  setIsSettingsOpen(true);
                }}
                style={styles.iconBtn}
              >
                <Settings size={17} />
              </button>

              {/* Notifications bell */}
              <button onClick={() => setIsNotifOpen(true)} style={styles.iconBtn}>
                <div style={{ position: 'relative' }}>
                  <Bell size={17} style={{ color: unreadCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }} />
                  {unreadCount > 0 && (
                    <span style={styles.bellBadge}>{unreadCount}</span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Render corresponding dashboard */}
          {user.role === 'vendedor' && (
            <VendedorDashboard user={user} onLogout={handleLogout} viewMode={viewMode} />
          )}
          {user.role === 'supervisor' && (
            <SupervisorDashboard user={user} onLogout={handleLogout} viewMode={viewMode} />
          )}
          {user.role === 'admin' && (
            <AdminDashboard user={user} onLogout={handleLogout} viewMode={viewMode} />
          )}

          {/* Settings modal */}
          {isSettingsOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsSettingsOpen(false)}>
              <div className="glass-panel" style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <h3 style={{ fontSize: '15px' }}>Configuración del Sistema</h3>
                  <button onClick={() => setIsSettingsOpen(false)} style={styles.closeBtn}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Pega tu API Key de Google AI Studio..."
                    style={{ marginBottom: '8px' }}
                  />
                  <p style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    * Utilizada para escanear productos y extraer datos con IA. Si se deja vacía, el escáner funcionará en <strong>Modo Demo</strong> simulando la IA.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      localStorage.removeItem('gemini_api_key');
                      setApiKeyInput('');
                      alert('API Key eliminada. Modo Demo activado.');
                      setIsSettingsOpen(false);
                    }}
                    className="btn-secondary"
                    style={{ padding: '8px', fontSize: '12px' }}
                  >
                    Usar Demo
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem('gemini_api_key', apiKeyInput.trim());
                      alert('Configuración guardada correctamente.');
                      setIsSettingsOpen(false);
                    }}
                    className="btn-primary"
                    style={{ padding: '8px', fontSize: '12px' }}
                  >
                    Guardar Key
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

const styles = {
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color)',
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 60,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    borderRadius: '10px',
    transition: 'all 0.2s ease',
  },
  bellBadge: {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    backgroundColor: '#dc3535',
    color: '#fff',
    fontSize: '9px',
    fontWeight: 'bold',
    borderRadius: '50%',
    width: '14px',
    height: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(44, 62, 44, 0.5)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modalContent: {
    width: '100%',
    maxWidth: '340px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '8px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
    cursor: 'pointer',
  }
};
