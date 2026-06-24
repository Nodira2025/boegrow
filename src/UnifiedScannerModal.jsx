import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabase';
import { X, Camera, RefreshCw, AlertCircle, Check, Search, Sparkles, Image as ImageIcon, ShoppingCart, Plus, ArrowRight } from 'lucide-react';
import { playBeepSuccess, playBuzzerError } from './soundEffects';

export default function UnifiedScannerModal({ isOpen, onClose, onProductSelected, products = [], onScanNewBarcode, onProductSaved, user }) {
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

  // Quick Register Validation Form State
  const [isValidating, setIsValidating] = useState(false);
  const [validationData, setValidationData] = useState({
    name: '',
    price: '',
    cost_price: '',
    category: 'Otros',
    barcode: '',
    stock: 1,
    image_url: ''
  });
  const [savingQuickProduct, setSavingQuickProduct] = useState(false);
  const [scannedCodeNotMatched, setScannedCodeNotMatched] = useState('');
  const [scannedBarcodeForAi, setScannedBarcodeForAi] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [showModeSelection, setShowModeSelection] = useState(true);

  const scannerRef = useRef(null);
  const isPausedRef = useRef(false);
  const fileInputRef = useRef(null);
  const cameraContainerId = 'unified-scanner-viewfinder';

  // Reset states only when the modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setScanSuccessMessage('');
      setScanErrorMessage('');
      setScannerError('');
      setScannedCodeNotMatched('');
      setIsValidating(false);
      setShowModeSelection(true);
      isPausedRef.current = false;
    } else {
      stopCameraScanner();
    }
  }, [isOpen]);

  // Manage camera lifecycle based on tab and mode selection
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !showModeSelection) {
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }
  }, [isOpen, activeTab, showModeSelection]);

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
  const startCameraScanner = async (overrideId = null) => {
    try {
      setScannerError('');
      if (scannerRef.current) {
        await stopCameraScanner();
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

      const html5QrCode = new Html5Qrcode(cameraContainerId);
      scannerRef.current = html5QrCode;
      
      setScanning(true);
      const targetSource = devId ? devId : { facingMode: 'environment' };

      await html5QrCode.start(
        targetSource,
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

  const handleToggleCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCameraId = cameras[nextIndex].id;
    setSelectedCameraId(nextCameraId);
    await startCameraScanner(nextCameraId);
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
      setScannedCodeNotMatched('');
      setTimeout(() => setScanSuccessMessage(''), 2000);
    } else {
      playBuzzerError();
      setScanErrorMessage(`Desconocido: ${scannedCode}`);
      setScannedCodeNotMatched(scannedCode);
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
  const handleImageCapture = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setAiError('');
      setAiResult(null);
      setAiMatches([]);
      
      try {
        let finalFile = file;
        if (file.size > 1.5 * 1024 * 1024) {
          setAiLoadingStep('Comprimiendo imagen...');
          setAiLoading(true);
          finalFile = await compressImage(file, 1200, 1200, 0.75);
          setAiLoading(false);
        }
        setImageFile(finalFile);
        const previewUrl = URL.createObjectURL(finalFile);
        setImagePreview(previewUrl);
      } catch (err) {
        console.error('Error compressing image:', err);
        setAiError('Error al procesar y comprimir la imagen.');
        setAiLoading(false);
      }
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
        5. An estimated retail price in Argentine Pesos (ARS) (e.g. 15000, 25000, etc.) based on typical Argentine online market prices.
        6. An estimated cost price in Argentine Pesos (ARS) (typically 30-40% lower than retail).
        7. Any barcode, QR code text, numeric UPC/EAN code, or product serial code visible in the image. If not found, return null.
 
        You MUST return a JSON object with this exact structure:
        {
          "name": "Exact Product Name",
          "brand": "Brand Name",
          "category": "Chosen Category",
          "description": "Short description in Spanish",
          "estimated_price_ars": 15000,
          "cost_price_ars": 10000,
          "barcode": "extracted_barcode_or_null"
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
            name: matched.name + ' (Nuevo)',
            brand: matched.brand || 'Marca Recomendada',
            category: matched.category || 'Otros',
            description: 'Producto no registrado identificado automáticamente por IA.',
            estimated_price_ars: matched.price || 10000,
            cost_price_ars: Math.round((matched.price || 10000) * 0.7),
            barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString()
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
    
    const cleanText = (str) => (str || '').toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, '');
      
    const aiCleanName = cleanText(aiData.name);
    const keywords = aiCleanName.split(/\s+/).filter(w => 
      w.length >= 1 && !['de', 'la', 'el', 'un', 'en', 'y', 'o', 'a', 'con', 'para', 'del', 'los', 'las', 'por', 'una', 'con'].includes(w)
    );
    
    const scoredMatches = products.map(p => {
      let score = 0;
      const prodCleanName = cleanText(p.name);
      
      keywords.forEach(kw => {
        if (prodCleanName.includes(kw)) {
          score += kw.length;
        }
      });
      
      if (p.category && aiData.category && p.category.toLowerCase() === aiData.category.toLowerCase()) {
        score += 2;
      }
      return { product: p, score };
    })
    .filter(item => item.score > 2)
    .sort((a, b) => b.score - a.score)
    .map(item => item.product);

    setAiMatches(scoredMatches.slice(0, 5));
  };

  const handleSelectProduct = (product) => {
    onProductSelected(product);
  };

  const handleStartQuickRegister = (nameHint = '', barcodeHint = '', priceHint = '', costHint = '', categoryHint = 'Otros') => {
    setValidationData({
      name: nameHint || '',
      price: priceHint || '',
      cost_price: costHint || '',
      category: categoryHint || 'Otros',
      barcode: barcodeHint || scannedBarcodeForAi || '',
      stock: 1,
      image_url: imagePreview || ''
    });
    setIsValidating(true);
  };

  const handleConfirmQuickRegister = async (e) => {
    if (e) e.preventDefault();
    
    const priceNum = parseFloat(validationData.price);
    const costNum = parseFloat(validationData.cost_price) || 0;
    const stockNum = parseInt(validationData.stock, 10) || 1;

    if (!validationData.name.trim() || isNaN(priceNum) || isNaN(stockNum)) {
      alert('Por favor completa nombre, precio y stock válidos.');
      return;
    }

    setSavingQuickProduct(true);
    try {
      const payload = {
        name: validationData.name.trim(),
        price: priceNum,
        cost_price: costNum,
        stock: stockNum,
        category: validationData.category || 'Otros',
        barcode: validationData.barcode.trim() || null,
        image_url: validationData.image_url ? validationData.image_url.trim() : null,
        created_by: user?.id || null
      };

      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select();

      if (error) throw error;

      const savedProduct = data?.[0];
      if (savedProduct) {
        // Record in product_logs
        const logPayload = {
          product_id: savedProduct.id,
          product_name: savedProduct.name,
          user_id: user?.id || null,
          user_name: user?.name || 'Vendedor',
          action: 'created',
          details: {
            price: priceNum,
            stock: stockNum,
            category: savedProduct.category,
            reason: 'Registro y venta rápida de producto no en inventario'
          },
          seen_by_supervisor: false
        };
        await supabase.from('product_logs').insert(logPayload);

        // Record supervisor notification
        await supabase.from('notifications').insert({
          recipient_role: 'supervisor',
          title: 'Venta Rápida (Producto Nuevo)',
          message: `El usuario ${user?.name || 'Vendedor'} ha registrado y vendido el producto nuevo "${savedProduct.name}" (ARS $${priceNum.toLocaleString('es-AR')}, Stock inicial: ${stockNum}).`
        });

        // Add to active cart
        onProductSelected(savedProduct);

        // Refresh catalog in background
        if (onProductSaved) {
          onProductSaved();
        }

        playBeepSuccess();
        alert('Producto registrado e ingresado a la venta con éxito.');
      }

      setIsValidating(false);
      setValidationData({
        name: '',
        price: '',
        cost_price: '',
        category: 'Otros',
        barcode: '',
        stock: 1,
        image_url: ''
      });
      setScannedCodeNotMatched('');
      setScannedBarcodeForAi('');
      onClose();
    } catch (err) {
      console.error('Error in quick registration:', err);
      alert('Error al registrar el producto. Asegúrese de que el código de barras no esté duplicado.');
    } finally {
      setSavingQuickProduct(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div className="glass-panel animate-fade-in" style={styles.modal}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          style={{ display: 'none' }}
          ref={fileInputRef}
        />
        {showModeSelection ? (
          <>
            {/* Header del Selector de Modo */}
            <div style={styles.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} className="text-success" style={{ color: '#4a7c3f' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#2c3e2c', margin: 0 }}>Ingresar Venta</h3>
              </div>
              <button onClick={onClose} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            {/* Selector de Modo */}
            <div style={{ ...styles.body, display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px 20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#2c3e2c', margin: '0 0 4px 0', textAlign: 'center' }}>
                ¿Qué tipo de artículo deseas vender?
              </h4>
              
              {/* Option 1: Artículo en Inventario */}
              <div 
                onClick={() => {
                  setShowModeSelection(false);
                  setActiveTab('text');
                }}
                className="hover-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: '#f1f7ef',
                  border: '1px solid #c2d1b8',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
              >
                <div style={{ backgroundColor: '#4a7c3f', color: '#fff', borderRadius: '12px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Search size={22} />
                </div>
                <div>
                  <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#2c3e2c', margin: '0 0 2px 0' }}>Artículo en Inventario</h5>
                  <p style={{ fontSize: '11px', color: '#5f7a5f', margin: 0 }}>Buscar en el catálogo existente o escanear código de barras.</p>
                </div>
              </div>

              {/* Option 2: Artículo Nuevo */}
              <div 
                onClick={() => {
                  setShowModeSelection(false);
                  setActiveTab('ai');
                  // Trigger file input upload/capture
                  setTimeout(() => {
                    fileInputRef.current?.click();
                  }, 300);
                }}
                className="hover-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: '#fffdf5',
                  border: '1px solid #fef3c7',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
              >
                <div style={{ backgroundColor: '#b8944a', color: '#fff', borderRadius: '12px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#2c3e2c', margin: '0 0 2px 0' }}>Artículo Nuevo (No en catálogo)</h5>
                  <p style={{ fontSize: '11px', color: '#8b6e30', margin: 0 }}>Escanear/tomar foto con IA para identificar, buscar precios e ingresar a stock.</p>
                </div>
              </div>
            </div>
          </>
        ) : isValidating ? (
          <>
            {/* Header de Validación */}
            <div style={styles.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button"
                  onClick={() => setIsValidating(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8fa58f',
                    padding: '4px',
                    marginRight: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Volver"
                >
                  <ArrowRight size={18} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <Sparkles size={18} className="text-gold" style={{ color: '#b8944a' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#2c3e2c', margin: 0 }}>Validar Stock Nuevo</h3>
              </div>
              <button onClick={onClose} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo de Validación */}
            <div style={styles.body}>
              <form onSubmit={handleConfirmQuickRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {validationData.image_url && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#fafaf9', padding: '8px', borderRadius: '12px', border: '1px solid #eef2eb' }}>
                    <img 
                      src={validationData.image_url} 
                      alt="Preview" 
                      style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #c2d1b8' }} 
                    />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#4a7c3f', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Sparkles size={12} /> Auto-completado con IA
                      </div>
                      <div style={{ fontSize: '10px', color: '#8fa58f' }}>Imagen analizada correctamente</div>
                    </div>
                  </div>
                )}

                {/* Name */}
                <div style={formStyles.fieldGroup}>
                  <label style={formStyles.label}>Nombre del Producto *</label>
                  <input 
                    type="text" 
                    value={validationData.name} 
                    onChange={(e) => setValidationData({...validationData, name: e.target.value})}
                    style={formStyles.input}
                    required 
                    placeholder="Ej. Fertilizante Namaste 500ml"
                  />
                </div>

                {/* Category & Barcode side-by-side */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, ...formStyles.fieldGroup }}>
                    <label style={formStyles.label}>Categoría *</label>
                    <select 
                      value={validationData.category} 
                      onChange={(e) => setValidationData({...validationData, category: e.target.value})}
                      style={formStyles.select}
                    >
                      <option value="Sustratos">Sustratos</option>
                      <option value="Fertilizantes">Fertilizantes</option>
                      <option value="Iluminación">Iluminación</option>
                      <option value="Carpas">Carpas</option>
                      <option value="Parafernalia">Parafernalia</option>
                      <option value="Accesorios">Accesorios</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1, ...formStyles.fieldGroup }}>
                    <label style={formStyles.label}>Cód. Barras / QR</label>
                    <input 
                      type="text" 
                      value={validationData.barcode} 
                      onChange={(e) => setValidationData({...validationData, barcode: e.target.value})}
                      style={formStyles.input}
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                {/* Price & Cost Price side-by-side */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, ...formStyles.fieldGroup }}>
                    <label style={formStyles.label}>Precio Venta (ARS) *</label>
                    <input 
                      type="number" 
                      step="any"
                      value={validationData.price} 
                      onChange={(e) => setValidationData({...validationData, price: e.target.value})}
                      style={formStyles.input}
                      required 
                      placeholder="0"
                    />
                  </div>
                  
                  <div style={{ flex: 1, ...formStyles.fieldGroup }}>
                    <label style={formStyles.label}>Costo (ARS)</label>
                    <input 
                      type="number" 
                      step="any"
                      value={validationData.cost_price} 
                      onChange={(e) => setValidationData({...validationData, cost_price: e.target.value})}
                      style={formStyles.input}
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                {/* Stock and Help message */}
                <div style={formStyles.fieldGroup}>
                  <label style={formStyles.label}>Stock Inicial a Ingresar *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                      type="number" 
                      min="1"
                      value={validationData.stock} 
                      onChange={(e) => setValidationData({...validationData, stock: parseInt(e.target.value) || 1})}
                      style={{ ...formStyles.input, width: '90px' }}
                      required
                    />
                    <span style={{ fontSize: '11px', color: '#5f7a5f', fontStyle: 'italic', textAlign: 'left', lineHeight: '1.2' }}>
                      Se ingresará a stock y se agregará al carrito actual.
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => setIsValidating(false)} 
                    style={{ ...styles.createProductBtn, flex: 1, justifyContent: 'center', padding: '10px', height: '40px' }}
                    disabled={savingQuickProduct}
                  >
                    Volver
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    style={{ flex: 2, padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px' }}
                    disabled={savingQuickProduct}
                  >
                    {savingQuickProduct ? (
                      <RefreshCw size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    {savingQuickProduct ? 'Guardando...' : 'Confirmar e Ingresar'}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <>
            {/* Header normal */}
            <div style={styles.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button"
                  onClick={() => setShowModeSelection(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8fa58f',
                    padding: '4px',
                    marginRight: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Volver a opciones"
                >
                  <ArrowRight size={18} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <Sparkles size={18} className="text-success" style={{ color: '#4a7c3f' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#2c3e2c', margin: 0 }}>Escáner y Buscador</h3>
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
                      <>
                        {textResults.map(p => (
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
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eef2eb' }}>
                          <button
                            type="button"
                            onClick={() => handleStartQuickRegister(textQuery)}
                            style={{ ...styles.createProductBtn, width: '100%', justifyContent: 'center', padding: '8px' }}
                          >
                            <Plus size={13} /> ¿Vender otro no listado? Registrar Rápido
                          </button>
                        </div>
                      </>
                    ) : textQuery ? (
                      <div style={styles.emptyState}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px' }}>No se encontraron coincidencias en el catálogo</p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setScannedBarcodeForAi('');
                              setActiveTab('ai');
                              setTimeout(() => {
                                fileInputRef.current?.click();
                              }, 300);
                            }}
                            className="btn-primary"
                            style={{ fontSize: '11px', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Sparkles size={12} /> Registrar con Foto (IA)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartQuickRegister(textQuery)}
                            style={{ ...styles.createProductBtn, fontSize: '11px', padding: '8px 12px', borderRadius: '8px' }}
                          >
                            <Plus size={12} /> Registro Manual
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={styles.placeholderState}>Escribe para buscar productos en el grow...</div>
                        <button
                          type="button"
                          onClick={() => handleStartQuickRegister()}
                          style={{ ...styles.createProductBtn, width: '100%', justifyContent: 'center', padding: '10px' }}
                        >
                          <Plus size={14} /> Registrar y Vender Producto Nuevo (Rápido)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CAMERA LIVE SCANNER */}
              {activeTab === 'camera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={styles.viewfinderWrapper}>
                    <div id={cameraContainerId} style={styles.viewfinderDiv}></div>
                    
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

                  {scannedCodeNotMatched && (
                    <div style={{ ...styles.noMatchCard, backgroundColor: '#fbfbf8', border: '1px solid #eef2eb', padding: '12px', marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#b8944a', textAlign: 'left', marginBottom: '6px' }}>
                        Código desconocido: <span style={{ fontFamily: 'monospace', backgroundColor: '#f1f4ef', padding: '2px 4px', borderRadius: '4px' }}>{scannedCodeNotMatched}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setScannedBarcodeForAi(scannedCodeNotMatched);
                            setActiveTab('ai');
                            setTimeout(() => {
                              fileInputRef.current?.click();
                            }, 300);
                          }}
                          className="btn-primary"
                          style={{ flex: 1, fontSize: '11px', padding: '6px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Sparkles size={12} /> Registrar con Foto (IA)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleStartQuickRegister('', scannedCodeNotMatched);
                          }}
                          style={{ ...styles.createProductBtn, flex: 1, fontSize: '11px', padding: '6px 8px', borderRadius: '8px', justifyContent: 'center' }}
                        >
                          <Plus size={12} /> Manual Rápido
                        </button>
                      </div>
                    </div>
                  )}

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

                  {!localStorage.getItem('gemini_api_key') && (
                    <div style={{ padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', fontSize: '11px', color: '#b45309', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                      <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={14} /> Modo Simulación Activo
                      </div>
                      <div style={{ fontSize: '10px', color: '#78350f', lineHeight: '1.3' }}>
                        No se ha configurado la API Key de Gemini. El reconocimiento de imágenes devolverá resultados de prueba ficticios. Configura tu API Key para habilitar el reconocimiento real:
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <input
                          type="password"
                          placeholder="Ingresar API Key de Gemini (AIzaSy...)..."
                          id="gemini-key-input-modal"
                          style={{ flex: 1, height: '28px', padding: '0 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = document.getElementById('gemini-key-input-modal')?.value;
                            if (val) {
                              localStorage.setItem('gemini_api_key', val.trim());
                              alert('API Key de Gemini guardada correctamente. Reiniciando escáner...');
                              window.location.reload();
                            } else {
                              alert('Por favor ingresa una clave válida.');
                            }
                          }}
                          style={{ padding: '0 10px', height: '28px', backgroundColor: '#b45309', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}

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
                            <p style={{ fontSize: '11px', color: '#8fa58f', margin: '0' }}>No encontramos este producto exacto en tu catálogo.</p>
                          </div>
                        )}
                        
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eef2eb' }}>
                          <button 
                            type="button"
                            onClick={() => {
                              handleStartQuickRegister(
                                aiResult.name, 
                                scannedBarcodeForAi || aiResult.barcode, 
                                aiResult.estimated_price_ars, 
                                aiResult.cost_price_ars || Math.round(aiResult.estimated_price_ars * 0.7),
                                aiResult.category
                              );
                            }} 
                            className="btn-primary"
                            style={{ width: '100%', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          >
                            <Plus size={14} /> Registrar e Ingresar a Venta Rápida
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </>
        )}
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

// Image compression helper using canvas to keep images <= 1.5MB
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas compression returned null'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

const formStyles = {
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    textAlign: 'left'
  },
  label: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#4a7c3f'
  },
  input: {
    height: '38px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #eef2eb',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  select: {
    height: '38px',
    padding: '0 8px',
    borderRadius: '10px',
    border: '1px solid #eef2eb',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    backgroundColor: '#ffffff',
    transition: 'border-color 0.2s',
  }
};

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
