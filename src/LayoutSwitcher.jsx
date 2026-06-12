import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

export default function LayoutSwitcher({ viewMode, onToggle }) {
  return (
    <button
      className="mode-toggle"
      onClick={onToggle}
      title={viewMode === 'mobile' ? 'Cambiar a versión PC' : 'Cambiar a versión Móvil'}
    >
      {viewMode === 'mobile' ? (
        <>
          <Monitor size={14} />
          <span>PC</span>
        </>
      ) : (
        <>
          <Smartphone size={14} />
          <span>Móvil</span>
        </>
      )}
    </button>
  );
}
