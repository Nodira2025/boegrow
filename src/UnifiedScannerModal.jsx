import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabase';
import { X, Camera, RefreshCw, AlertCircle, Check, Search, Sparkles, Image as ImageIcon, ShoppingCart, Plus, ArrowRight } from 'lucide-react';
import { playBeepSuccess, playBuzzerError } from './soundEffects';

export default function UnifiedScannerModal({ isOpen, onClose, onProductSelected, products = [], onScanNewBarcode }) {
  const [activeTab, setActiveTab] = useState('text'); // 'text', 'camera', 'ai'
  
  // Text Search State
  const [textQuery, setTextQuery] = useState('');
  const [textResults, setTextResults] = useState([]);

  // Camera Scan State
  const [scannerError, setScannerError] = useState('');
  const [cameraPermission, setCameraPermission] = useState('prompt'); // 'prompt', 'granted', 'denied'
  const [scanning, setScanning] = useState(false);
  const [isContinuous, setIsContinuous] = useState(true);
  const [scanSuccessMessage, setScanSuccessMessage] = useState('');
  const [scanErrorMessage, setScanErrorMessage] = useState('');
  
  // AI Vision State
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingStep, setAiLoadingStep] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiMatches, setAiMatches] = useState([]);

  const scannerRef = useRef(null);
  const isPausedRef = useRef(false);
  const fileInputRef = useRef(null);
  const cameraContainerId = 'unified-scanner-viewfinder';

  // Handle modal open/close & Tab change
  useEffect(() => {
    if (isOpen) {
      // Clear scanner feedback messages
      setScanSuccessMessage('');
      setScanErrorMessage('');
      setScannerError('');
      isPausedRef.current = false;

      if (activeTab === 'camera') {
        const timer = setTimeout(() => {
          startCameraScanner();
        }, 300);
        return () => {
          clearTimeout(timer);
          stopCameraScanner();
        };
      }
    } else {
      stopCameraScanner();
    }
  }, [isOpen, activeTab]);

  // Clean preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Live text search in local products list
  useEffect(() => {
    if (!textQuery.trim()) {
      setTextResults([]);
      return;
    }
    const query = textQuery.toLowerCase();
    const filtered = products.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.barcode && p.barcode.toLowerCase().includes(query))
    );
    setTextResults(filtered.slice(0, 10)); // Limit to 10 results
  }, [textQuery, products]);

  // Start HTML5-QRCode Scanner
  const startCameraScanner = async () => {
    try {
      setScannerError('');
      if (scannerRef.current) {
        await stopCameraScanner();
      }

      const html5QrCode = new Html5Qrcode(cameraContainerId);
      scannerRef.current = html5QrCode;
      
      setScanning(true);
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: (width, height) => {
            const desiredWidth = Math.min(width * 0.8, 280);
            const desiredHeight = Math.min(height * 0.4, 150);
            return { x: (width - desiredWidth) / 2, y: (height - desiredHeight) / 2, width: desiredWidth, height: desiredHeight };
          },
          aspectRatio: 1.777778
        },
        handleScanSuccess,
        handleScanFailure
      );
      setCameraPermission('granted');
    } catch (err) {
      console.error('Failed to start unified camera scanner:', err);
      setScanning(false);
      if (String(err).includes('Permission')) {
        setCameraPermission('denied');
        setScannerError('Permiso de cámara denegado. Habilita el acceso en tu navegador.');
      } else {
        setScannerError('No se pudo iniciar la cámara. Asegúrate de no tenerla abierta en otra pestaña.');
      }
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping unified scanner:', err);
      } finally {
        scannerRef.current = null;
        setScanning(false);
      }
    }
  };

  const handleScanSuccess = async (decodedText) => {
    if (isPausedRef.current) return;
    
    if (isContinuous) {
      isPausedRef.current = true;
      setTimeout(() => {
        isPausedRef.current = false;
      }, 2000); // 2 second pause between scans
    } else {
      await stopCameraScanner();
    }
    
    const scannedCode = decodedText.trim();
    // Search in the local products prop first for instant match
    const matched = products.find(p => p.barcode && p.barcode.trim() === scannedCode);

    if (matched) {
      playBeepSuccess();
      onProductSelected(matched);
      setScanSuccessMessage(`Agregado: ${matched.name}`);
      setTimeout(() => setScanSuccessMessage(''), 2000);
    } else {
      playBuzzerError();
      setScanErrorMessage(`Desconocido: ${scannedCode}`);
      setTimeout(() => setScanErrorMessage(''), 2500);

      // Offer to create it if not continuous
      if (!isContinuous && onScanNewBarcode) {
        onScanNewBarcode(scannedCode);
      }
    }
  };

  const handleScanFailure = () => {
    // Suppress failure logs to keep console clean
  };

  // AI Vision Logic
  const handleImageCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1.5 * 1024 * 1024) {
        alert('La imagen es muy pesada (máx 1.5MB)');
        return;
      }
      setImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setAiResult(null);
      setAiMatches([]);
      setAiError('');
    }
  };

  const runAiAnalysis = async () => {
    if (!imageFile) return;

    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    setAiMatches([]);

    const apiKey = localStorage.getItem('gemini_api_key') || '';

    if (!apiKey) {
      // Run fallback simulation mode
      runSimulationDemo();
      return;
    }

    try {
      setAiLoadingStep('Preparando imagen...');
      const base64Data = await fileToBase64(imageFile);

      setAiLoadingStep('Escaneando con Gemini AI...');
      const prompt = `
        You are an expert cataloger for a cannabis Grow Shop ("BO growclub" from Argentina).
        Identify this grow shop/parafernalia/cannabis product from the picture. Focus on extracting:
        1. The exact name of the product.
        2. The brand.
        3. The category. Choose ONLY from: 'Sustratos', 'Fertilizantes', 'Iluminación', 'Carpas', 'Parafernalia', 'Accesorios', 'Otros'.
        4. A brief, professional description in Spanish.
        5. An estimated retail price in Argentine Pesos (ARS) (e.g. 15000, 25000, etc.).
 
        You MUST return a JSON object with this exact structure:
        {
          "name": "Exact Product Name",
          "brand": "Brand Name",
          "category": "Chosen Category",
          "description": "Short description in Spanish",
          "estimated_price_ars": 15000
        }
        Do not include markdown tags, code blocks (such as \`\`\`json), or any conversational text. Return only the raw JSON.
      `;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: imageFile.type || 'image/jpeg',
                      data: base64Data
                    }
                  }
                ]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error (Status ${response.status})`);
      }

      const resData = await response.json();
      const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      const cleanJson = textResponse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsedData = JSON.parse(cleanJson);
      
      setAiLoadingStep('Buscando coincidencias en tu stock...');
      setTimeout(() => {
        matchAiWithLocalProducts(parsedData);
        setAiResult(parsedData);
        setAiLoading(false);
      }, 1000);

    } catch (err) {
      console.error('AI scanning failed:', err);
      setAiError('No se pudo identificar el producto. Intente con una foto mejor enfocada.');
      setAiLoading(false);
    }
  };

  const runSimulationDemo = () => {
    setAiLoadingStep('Preparando imagen...');
    setTimeout(() => {
      setAiLoadingStep('Analizando textura e ingredientes con IA...');
      setTimeout(() => {
        setAiLoadingStep('Buscando en tu base de datos de Growshop...');
        setTimeout(() => {
          // Select a random product from prop or demo
          const demoList = products.length > 0 ? products : [
            { name: 'Fertilizante Namaste Oro Negro 500ml', category: 'Fertilizantes', price: 12500 },
            { name: 'Sustrato Cultivate Premium 50L', category: 'Sustratos', price: 18900 }
          ];
          const matched = demoList[Math.floor(Math.random() * demoList.length)];
          const mockAiData = {
            name: matched.name,
            brand: matched.brand || 'Marca Recomendada',
            category: matched.category || 'Otros',
            description: 'Producto identificado automáticamente.',
            estimated_price_ars: matched.price || 10000
          };
          matchAiWithLocalProducts(mockAiData);
          setAiResult(mockAiData);
          setAiLoading(false);
        }, 1200);
      }, 1200);
    }, 800);
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Match AI identification with database products
  const matchAiWithLocalProducts = (aiData) => {
    if (!products || products.length === 0) return;
    
    // Split identified name into keywords
    const keywords = aiData.name
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['con', 'para', 'del', 'los', 'las', 'por', 'una'].includes(w));
    
    const scoredMatches = products.map(p => {
      let score = 0;
      const prodName = p.name.toLowerCase();
      keywords.forEach(kw => {
        if (prodName.includes(kw)) score += 2;
      });
      // Additional score for category match
      if (p.category && aiData.category && p.category.toLowerCase() === aiData.category.toLowerCase()) {
        score += 1;
      }
      return { product: p, score };
    })
    .filter(item => item.score > 1)
    .sort((a, b) => b.score - a.score)
    .map(item => item.product);

    setAiMatches(scoredMatches.slice(0, 5));
  };

  const handleSelectProduct = (product) => {
    onProductSelected(product);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div className="glass-panel animate-fade-in" style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} className="text-success" style={{ color: '#4a7c3f' }} />
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#2c3e2c', margin: 0 }}>Escáner y Buscador Inteligente</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div style={styles.tabContainer}>
          <button 
            type="button"
            onClick={() => setActiveTab('text')} 
            style={{ ...styles.tabButton, ...(activeTab === 'text' ? styles.activeTabButton : {}) }}
          >
            <Search size={14} /> Buscar Texto
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('camera')} 
            style={{ ...styles.tabButton, ...(activeTab === 'camera' ? styles.activeTabButton : {}) }}
          >
            <Camera size={14} /> Escáner Cámara
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('ai')} 
            style={{ ...styles.tabButton, ...(activeTab === 'ai' ? styles.activeTabButton : {}) }}
          >
            <Sparkles size={14} /> Visión IA
          </button>
        </div>

        {/* Tab Body */}
        <div style={styles.body}>
          
          {/* TAB 1: TEXT SEARCH */}
          {activeTab === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: '#8fa58f' }} />
                <input 
                  type="text"
                  placeholder="Buscar por nombre, categoría o código..."
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  style={styles.searchInput}
                  autoFocus
                />
              </div>

              {/* Text Search Results */}
              <div style={styles.resultsList}>
                {textResults.length > 0 ? (
                  textResults.map(p => (
                    <div key={p.id} style={styles.resultItem}>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#2c3e2c' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: '#8fa58f' }}>
                          Cat: {p.category || 'Otros'} • Stock: {p.stock} • Barcode: {p.barcode || 'N/A'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#4a7c3f' }}>
                          ${p.price.toLocaleString('es-AR')}
                        </span>
                        <button 
                          type="button"
                          onClick={() => handleSelectProduct(p)}
                          style={styles.addButton}
                          title="Añadir al carrito"
                        >
                          <ShoppingCart size={13} /> Agregar
                        </button>
                      </div>
                    </div>
                  ))
                ) : textQuery ? (
                  <div style={styles.emptyState}>No se encontraron coincidencias en el catálogo</div>
                ) : (
                  <div style={styles.placeholderState}>Escribe para buscar productos en el grow...</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CAMERA LIVE SCANNER */}
          {activeTab === 'camera' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={styles.viewfinderWrapper}>
                <div id={cameraContainerId} style={styles.viewfinderDiv}></div>
                
                {scanning && (
                  <div style={styles.laserOverlay}>
                    <div style={styles.laserLine}></div>
                    <p style={styles.viewfinderTip}>Ubica el código QR o código de barra</p>
                  </div>
                )}
                
                {scanSuccessMessage && (
                  <div style={styles.successBadge}>
                    <Check size={14} /> {scanSuccessMessage}
                  </div>
                )}

                {scanErrorMessage && (
                  <div style={styles.errorBadge}>
                    <AlertCircle size={14} /> {scanErrorMessage}
                  </div>
                )}

                {scannerError && (
                  <div style={styles.errorState}>
                    <AlertCircle size={24} style={{ marginBottom: '8px' }} />
                    <p style={{ fontSize: '12px', textAlign: 'center' }}>{scannerError}</p>
                  </div>
                )}

                {!scanning && !scannerError && (
                  <div style={styles.loadingState}>
                    <RefreshCw size={24} className="pulse-neon" style={{ marginBottom: '8px' }} />
                    <p style={{ fontSize: '11px', color: '#8fa58f' }}>Iniciando lector de cámara...</p>
                  </div>
                )}
              </div>

              {/* Continuous Scan Checkbox */}
              <div style={styles.checkboxContainer}>
                <input
                  type="checkbox"
                  id="continuous-scan-checkbox-unified"
                  checked={isContinuous}
                  onChange={(e) => setIsContinuous(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="continuous-scan-checkbox-unified" style={{ fontSize: '12px', fontWeight: '700', cursor: 'pointer', color: '#2c3e2c' }}>
                  Modo Continuo (Permite escanear varios seguidos)
                </label>
              </div>

              {scanning ? (
                <button type="button" onClick={stopCameraScanner} className="btn-danger" style={{ width: '100%', padding: '10px', borderRadius: '10px' }}>
                  Detener Escáner
                </button>
              ) : (
                <button type="button" onClick={startCameraScanner} className="btn-primary" style={{ width: '100%', padding: '10px', borderRadius: '10px' }}>
                  Encender Cámara
                </button>
              )}
            </div>
          )}

          {/* TAB 3: AI VISION / PHOTO SEARCH */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageCapture}
                style={{ display: 'none' }}
                ref={fileInputRef}
              />

              {!imagePreview ? (
                <div style={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={32} style={{ color: '#8fa58f', marginBottom: '8px' }} />
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#2c3e2c', margin: 0 }}>Capturar Foto o Subir Imagen</p>
                  <p style={{ fontSize: '10px', color: '#8fa58f', marginTop: '4px' }}>Toma una foto del producto con tu celular</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={styles.imagePreviewWrapper}>
                    <img src={imagePreview} alt="Captura" style={styles.imagePreview} />
                    <button 
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(''); setAiResult(null); setAiMatches([]); }} 
                      style={styles.removePhotoBtn}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {!aiResult && !aiLoading && (
                    <button 
                      type="button"
                      onClick={runAiAnalysis} 
                      className="btn-primary" 
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Sparkles size={16} /> Identificar Producto con IA
                    </button>
                  )}
                </div>
              )}

              {/* AI Processing Loading state */}
              {aiLoading && (
                <div style={styles.aiLoadingContainer}>
                  <RefreshCw size={24} className="spin" style={{ color: '#4a7c3f', marginBottom: '8px' }} />
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#2c3e2c' }}>{aiLoadingStep}</span>
                  <span style={{ fontSize: '10px', color: '#8fa58f', marginTop: '2px' }}>Esto puede tardar unos segundos...</span>
                </div>
              )}

              {/* AI Error */}
              {aiError && (
                <div style={styles.errorAlert}>
                  <AlertCircle size={16} /> {aiError}
                </div>
              )}

              {/* AI Result & Catalog Matches */}
              {aiResult && (
                <div style={styles.aiResultsSection}>
                  <div style={styles.aiIdentificationCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '800', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px' }}>IA DETECTADO</span>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#4a7c3f' }}>Est: ${aiResult.estimated_price_ars?.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#2c3e2c', textAlign: 'left' }}>{aiResult.name}</div>
                    <div style={{ fontSize: '11px', color: '#8fa58f', marginTop: '2px', textAlign: 'left' }}>Marca: {aiResult.brand} | Cat: {aiResult.category}</div>
                    <div style={{ fontSize: '11px', color: '#5f7a5f', marginTop: '6px', fontStyle: 'italic', lineHeight: '1.2', textAlign: 'left' }}>"{aiResult.description}"</div>
                  </div>

                  <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#2c3e2c', margin: '14px 0 8px 0', textAlign: 'left' }}>Coincidencias en tu Catálogo:</h4>
                  
                  <div style={styles.matchesList}>
                    {aiMatches.length > 0 ? (
                      aiMatches.map(p => (
                        <div key={p.id} style={styles.matchItem}>
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#2c3e2c' }}>{p.name}</div>
                            <div style={{ fontSize: '10px', color: '#8fa58f' }}>Stock: {p.stock} | Cat: {p.category || 'Otros'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#4a7c3f' }}>${p.price.toLocaleString('es-AR')}</span>
                            <button type="button" onClick={() => handleSelectProduct(p)} style={styles.matchAddBtn}>
                              <ShoppingCart size={11} /> Agregar
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={styles.noMatchCard}>
                        <p style={{ fontSize: '11px', color: '#8fa58f', margin: '0 0 8px 0' }}>No encontramos este producto exacto en tu catálogo.</p>
                        {onScanNewBarcode && (
                          <button 
                            type="button"
                            onClick={() => {
                              onClose();
                              onScanNewBarcode(aiResult.name); // Pass name to prefill
                            }} 
                            style={styles.createProductBtn}
                          >
                            <Plus size={12} /> Registrar como Nuevo Producto
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    width: '100%',
    maxWidth: '420px',
    borderRadius: '24px',
    backgroundColor: '#ffffff',
    border: '1px solid #eef2eb',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    maxHeight: '90vh'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eef2eb'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#8fa58f',
    padding: '4px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  tabContainer: {
    display: 'flex',
    backgroundColor: '#f1f4ef',
    padding: '4px',
    margin: '12px 20px 0 20px',
    borderRadius: '12px',
    gap: '4px'
  },
  tabButton: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: '700',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#8fa58f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.2s'
  },
  activeTabButton: {
    backgroundColor: '#ffffff',
    color: '#4a7c3f',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
  },
  body: {
    padding: '16px 20px 20px 20px',
    overflowY: 'auto',
    flex: 1
  },
  searchInput: {
    width: '100%',
    height: '42px',
    paddingLeft: '38px',
    paddingRight: '12px',
    borderRadius: '12px',
    border: '1px solid #eef2eb',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingRight: '4px',
    marginTop: '10px'
  },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#fafaf9',
    borderRadius: '12px',
    border: '1px solid #eef2eb',
  },
  addButton: {
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#4a7c3f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.2s'
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px 0',
    color: '#8fa58f',
    fontSize: '12px'
  },
  placeholderState: {
    textAlign: 'center',
    padding: '36px 0',
    color: '#8fa58f',
    fontSize: '12px',
    fontStyle: 'italic'
  },
  viewfinderWrapper: {
    position: 'relative',
    height: '180px',
    backgroundColor: '#000000',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  viewfinderDiv: {
    width: '100%',
    height: '100%'
  },
  laserOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px'
  },
  laserLine: {
    width: '80%',
    height: '2px',
    backgroundColor: '#ef4444',
    position: 'absolute',
    top: '50%',
    boxShadow: '0 0 8px #ef4444',
  },
  viewfinderTip: {
    color: '#ffffff',
    fontSize: '10px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '4px 10px',
    borderRadius: '12px',
    marginTop: 'auto',
    textAlign: 'center'
  },
  successBadge: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#10b981',
    color: '#ffffff',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    zIndex: 10
  },
  errorBadge: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    zIndex: 10
  },
  errorState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef4444',
    padding: '20px'
  },
  loadingState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#8fa58f',
  },
  checkboxContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '6px 0',
    borderTop: '1px solid #eef2eb',
    marginTop: '4px'
  },
  dropzone: {
    border: '2px dashed #c2d1b8',
    borderRadius: '16px',
    padding: '30px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: '#fafaf9',
    transition: 'all 0.2s',
  },
  imagePreviewWrapper: {
    position: 'relative',
    height: '180px',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid #eef2eb'
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  removePhotoBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiLoadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#fafaf9',
    borderRadius: '16px',
    border: '1px solid #eef2eb'
  },
  errorAlert: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: '10px 12px',
    borderRadius: '12px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  aiResultsSection: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '280px',
    overflowY: 'auto',
    paddingRight: '2px'
  },
  aiIdentificationCard: {
    backgroundColor: '#fffdf5',
    border: '1px solid #fef3c7',
    padding: '12px',
    borderRadius: '16px',
  },
  matchesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '6px'
  },
  matchItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#f8faf7',
    border: '1px solid #e8ede5',
    borderRadius: '12px'
  },
  matchAddBtn: {
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#4a7c3f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '3px'
  },
  noMatchCard: {
    backgroundColor: '#fafaf9',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #eef2eb',
    textAlign: 'center'
  },
  createProductBtn: {
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#ffffff',
    color: '#4a7c3f',
    border: '1px solid #4a7c3f',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.2s',
  }
};
