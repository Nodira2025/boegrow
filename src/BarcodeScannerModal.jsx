import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabase';
import { X, Camera, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { playBeepSuccess, playBuzzerError } from './soundEffects';

export default function BarcodeScannerModal({ isOpen, onClose, onScanMatched, onScanNewBarcode }) {
  const [scannerError, setScannerError] = useState('');
  const [cameraPermission, setCameraPermission] = useState('prompt'); // 'prompt', 'granted', 'denied'
  const [scanning, setScanning] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [scanSuccessMessage, setScanSuccessMessage] = useState('');
  const [scanErrorMessage, setScanErrorMessage] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  
  const scannerRef = useRef(null);
  const isPausedRef = useRef(false);
  const containerId = 'barcode-reader-viewfinder';

  useEffect(() => {
    if (isOpen) {
      setScannerError('');
      setScanSuccessMessage('');
      setScanErrorMessage('');
      isPausedRef.current = false;
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [isOpen]);

  const startScanner = async (overrideId = null) => {
    try {
      setScannerError('');
      if (scannerRef.current) {
        await stopScanner();
      }

      let devId = overrideId || selectedCameraId;
      let activeCameras = cameras;

      if (!activeCameras || activeCameras.length === 0) {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          activeCameras = devices;
          if (!devId) {
            devId = selectDefaultCamera(devices);
            setSelectedCameraId(devId);
          }
        } else {
          throw new Error("No se encontraron cámaras.");
        }
      }

      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;
      
      setScanning(true);
      const targetSource = devId ? devId : { facingMode: 'environment' };

      await html5QrCode.start(
        targetSource,
        {
          fps: 12,
          // Rectangular box suitable for standard long barcodes
          qrbox: (width, height) => {
            const desiredWidth = Math.min(width * 0.8, 300);
            const desiredHeight = Math.min(height * 0.35, 140);
            return { x: (width - desiredWidth) / 2, y: (height - desiredHeight) / 2, width: desiredWidth, height: desiredHeight };
          },
          aspectRatio: 1.777778 // 16:9 aspect ratio standard for mobile cameras
        },
        handleScanSuccess,
        handleScanFailure
      );
      setCameraPermission('granted');
    } catch (err) {
      console.error('Failed to start scanner:', err);
      setScanning(false);
      if (String(err).includes('Permission')) {
        setCameraPermission('denied');
        setScannerError('Permiso de cámara denegado. Habilita el acceso en tu navegador.');
      } else {
        setScannerError('No se pudo iniciar la cámara. Asegúrate de no tenerla abierta en otra pestaña.');
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setScanning(false);
      }
    }
  };

  const handleToggleCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCameraId = cameras[nextIndex].id;
    setSelectedCameraId(nextCameraId);
    await startScanner(nextCameraId);
  };

  const handleScanSuccess = async (decodedText) => {
    if (isPausedRef.current) return;
    
    // Cooldown logic to prevent scanning same product too fast in continuous mode
    if (isContinuous) {
      isPausedRef.current = true;
      setTimeout(() => {
        isPausedRef.current = false;
      }, 2000); // 2 second pause
    } else {
      await stopScanner();
    }
    
    try {
      // Check if product exists in Supabase
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', decodedText.trim());
 
      if (error) throw error;
 
      if (data && data.length > 0) {
        // Match found! Play sound and notify parent
        playBeepSuccess();
        onScanMatched(data[0]);
        setScanSuccessMessage(`Agregado: ${data[0].name}`);
        setTimeout(() => setScanSuccessMessage(''), 2000);
      } else {
        // No match
        playBuzzerError();
        if (!isContinuous) {
          onScanNewBarcode(decodedText.trim());
        } else {
          setScanErrorMessage(`Desconocido: ${decodedText.trim()}`);
          setTimeout(() => setScanErrorMessage(''), 2500);
        }
      }
    } catch (err) {
      console.error('DB query error on scan:', err);
      playBuzzerError();
      if (!isContinuous) {
        onScanNewBarcode(decodedText.trim());
      }
    }
  };

  const handleScanFailure = (error) => {
    // Library triggers failure callback on every frame search, we can ignore standard failures
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div className="glass-panel animate-fade-in" style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} className="text-success" />
            <h3 style={{ fontSize: '15px' }}>Escáner de Código de Barras</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder Container */}
        <div style={styles.viewfinderWrapper}>
          <div id={containerId} style={styles.viewfinderDiv}></div>
          
          {cameras.length > 1 && scanning && (
            <button
              onClick={handleToggleCamera}
              type="button"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#fff',
                zIndex: 20,
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
              }}
              title="Cambiar Cámara"
            >
              <RefreshCw size={14} />
            </button>
          )}
          
          {scanning && (
            <div style={styles.laserOverlay}>
              <div style={styles.laserLine}></div>
              <p style={styles.viewfinderTip}>Alinea el código de barras dentro del recuadro</p>
            </div>
          )}
          
          {scanSuccessMessage && (
            <div style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--accent-green)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px', width: '90%', maxWidth: '280px', justifyContent: 'center' }}>
              <Check size={13} /> {scanSuccessMessage}
            </div>
          )}

          {scanErrorMessage && (
            <div style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#dc3535', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px', width: '90%', maxWidth: '280px', justifyContent: 'center' }}>
              <AlertCircle size={13} /> {scanErrorMessage}
            </div>
          )}

          {scannerError && (
            <div style={styles.errorBanner}>
              <AlertCircle size={24} style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '12px', textAlign: 'center' }}>{scannerError}</p>
              {cameraPermission === 'denied' && (
                <button onClick={() => window.location.reload()} className="btn-secondary" style={{ marginTop: '12px', padding: '6px 12px', fontSize: '11px' }}>
                  Recargar App
                </button>
              )}
            </div>
          )}

          {!scanning && !scannerError && (
            <div style={styles.loadingBanner}>
              <RefreshCw size={24} className="pulse-neon" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Iniciando cámara...</p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div style={styles.footer}>
          {/* Continuous Scan Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px', padding: '6px 0', borderTop: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              id="continuous-scan-checkbox"
              checked={isContinuous}
              onChange={(e) => setIsContinuous(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="continuous-scan-checkbox" style={{ fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-primary)' }}>
              Modo Escaneo Continuo (Granel)
            </label>
          </div>

          {scanning ? (
            <button onClick={stopScanner} className="btn-danger" style={{ width: '100%', padding: '8px' }}>
              Apagar Cámara
            </button>
          ) : (
            <button onClick={startScanner} className="btn-primary" style={{ width: '100%', padding: '8px' }}>
              Reintentar Cámara
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    width: '100%',
    maxWidth: '360px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
    backgroundColor: 'var(--bg-surface)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '10px',
    marginBottom: '12px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
  },
  viewfinderWrapper: {
    width: '100%',
    aspectRatio: '1',
    backgroundColor: '#000',
    borderRadius: '12px',
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid var(--border-color)',
  },
  viewfinderDiv: {
    width: '100%',
    height: '100%',
  },
  laserOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '16px',
  },
  laserLine: {
    position: 'absolute',
    top: '50%',
    left: '10%',
    width: '80%',
    height: '2px',
    backgroundColor: '#ff0033',
    boxShadow: '0 0 8px #ff0033',
    animation: 'scanLineEffect 2s infinite ease-in-out',
  },
  viewfinderTip: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    textAlign: 'center',
    marginTop: 'auto',
    width: 'fit-content',
    alignSelf: 'center',
  },
  errorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#ef4444',
  },
  loadingBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
  },
  footer: {
    marginTop: '12px',
  }
};

// Add raw CSS animation to body
const styleTag = document.createElement('style');
styleTag.innerHTML = `
@keyframes scanLineEffect {
  0% { top: 30%; }
  50% { top: 70%; }
  100% { top: 30%; }
}
`;
document.head.appendChild(styleTag);

// Smart camera selection helper to prioritize main rear camera
function selectDefaultCamera(devices) {
  if (!devices || devices.length === 0) return null;
  
  const backCameras = devices.filter(device => {
    const label = (device.label || '').toLowerCase();
    return label.includes('back') || label.includes('rear') || label.includes('trasera') || label.includes('principal');
  });

  if (backCameras.length > 0) {
    const mainBackCameras = backCameras.filter(device => {
      const label = (device.label || '').toLowerCase();
      return !label.includes('zoom') && 
             !label.includes('tele') && 
             !label.includes('wide') && 
             !label.includes('3x') && 
             !label.includes('0.5') && 
             !label.includes('2x');
    });

    if (mainBackCameras.length > 0) {
      return mainBackCameras[0].id;
    }
    return backCameras[0].id;
  }
  
  return devices[0].id;
}
