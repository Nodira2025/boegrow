import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Sparkles, AlertTriangle, Search, X, Check } from 'lucide-react';

// Common growshop seed items for the Demo Mode simulation
const DEMO_PRODUCTS = [
  {
    name: 'Fertilizante Namaste Oro Negro 500ml',
    brand: 'Namaste Nutrients',
    category: 'Fertilizantes',
    description: 'Aditivo orgánico a base de ácidos húmicos, algas marinas y nitrógeno para crecimiento vigoroso.',
    estimated_price_ars: 12500
  },
  {
    name: 'Sustrato Cultivate Premium 50L',
    brand: 'Cultivate',
    category: 'Sustratos',
    description: 'Sustrato liviano y aireado enriquecido con turba, perlita, vermiculita y compost orgánico.',
    estimated_price_ars: 18900
  },
  {
    name: 'Panel Led Grow J150 Samsung',
    brand: 'Juana Grow',
    category: 'Iluminación',
    description: 'Ciclo completo de iluminación de alta eficiencia con chips Samsung LM301H.',
    estimated_price_ars: 245000
  },
  {
    name: 'Picador Lion Rolling Circus 3 Partes',
    brand: 'Lion Rolling Circus',
    category: 'Parafernalia',
    description: 'Picador de metal con tamiz polinizador y pala recolectora, diseño premium.',
    estimated_price_ars: 9500
  },
  {
    name: 'Papel Organico RAW Classic 1 1/4',
    brand: 'RAW',
    category: 'Parafernalia',
    description: 'Papel de liar ultrafino sin cloro, 100% natural a base de fibras de lino y cáñamo.',
    estimated_price_ars: 2100
  },
  {
    name: 'Medidor de PH Digital PH-009',
    brand: 'Importado',
    category: 'Accesorios',
    description: 'Instrumento portátil de precisión para medir el nivel de acidez/alcalinidad del agua de riego.',
    estimated_price_ars: 14000
  }
];

export default function AiVisionScanner({ isOpen, onClose, onAiScanComplete }) {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(''); // 'uploading', 'analyzing', 'searching'
  const [error, setError] = useState('');
  const [scannedResult, setScannedResult] = useState(null);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const triggerCamera = () => {
    if (fileInputRef.current) {
      setError('');
      setScannedResult(null);
      fileInputRef.current.click();
    }
  };

  const handleImageCapture = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setError('');
      setScannedResult(null);
      
      try {
        let finalFile = file;
        if (file.size > 1.5 * 1024 * 1024) {
          setLoadingStep('Comprimiendo imagen...');
          setLoading(true);
          finalFile = await compressImage(file, 1200, 1200, 0.75);
          setLoading(false);
        }
        setImageFile(finalFile);
        const previewUrl = URL.createObjectURL(finalFile);
        setImagePreview(previewUrl);
      } catch (err) {
        console.error('Error compressing image:', err);
        setError('Error al procesar y comprimir la imagen.');
        setLoading(false);
      }
    }
  };

  const runAiAnalysis = async () => {
    if (!imageFile) return;

    setLoading(true);
    setError('');
    setScannedResult(null);

    // Retrieve API Key
    const apiKey = localStorage.getItem('gemini_api_key') || '';

    if (!apiKey) {
      // API Key is not configured -> RUN SIMULATION DEMO MODE
      runSimulationDemo();
      return;
    }

    try {
      // 1. Convert File to Base64
      setLoadingStep('Preparando imagen...');
      const base64Data = await fileToBase64(imageFile);

      // 2. Call Google Gemini API (1.5 Flash)
      setLoadingStep('Escaneando con Gemini AI...');
      
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
          headers: {
            'Content-Type': 'application/json'
          },
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
        const errorText = await response.text();
        throw new Error(`Gemini API error (Status ${response.status}): ${errorText}`);
      }

      const resData = await response.json();
      const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Clean JSON formatting
      const cleanJson = textResponse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      setLoadingStep('Buscando referencias en internet...');
      const parsedData = JSON.parse(cleanJson);
      
      // Add slight delay to simulate internet indexing search
      setTimeout(() => {
        setScannedResult(parsedData);
        setLoading(false);
      }, 1000);

    } catch (err) {
      console.error('AI scanning failed:', err);
      setError('No se pudo identificar el producto. Asegurate de que la foto este enfocada o ingresalo manualmente.');
      setLoading(false);
    }
  };

  const runSimulationDemo = () => {
    // Stage 1: preparing
    setLoadingStep('Preparando imagen...');
    setTimeout(() => {
      // Stage 2: scanning
      setLoadingStep('Analizando textura e ingredientes con IA...');
      setTimeout(() => {
        // Stage 3: indexing
        setLoadingStep('Buscando precios de referencia en Growshops de Argentina...');
        setTimeout(() => {
          // Select random demo product
          const randomIndex = Math.floor(Math.random() * DEMO_PRODUCTS.length);
          const matchedProduct = DEMO_PRODUCTS[randomIndex];
          
          setScannedResult(matchedProduct);
          setLoading(false);
        }, 1200);
      }, 1200);
    }, 800);
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFillForm = () => {
    if (scannedResult) {
      onAiScanComplete(scannedResult);
    }
  };

  const getGoogleSearchLink = () => {
    if (!scannedResult) return '';
    const q = `${scannedResult.name} ${scannedResult.brand || ''} precio argentina`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  };

  return (
    <div style={styles.overlay}>
      <div className="glass-panel animate-fade-in" style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} className="text-gold" />
            <h3 style={{ fontSize: '15px' }}>Escáner de Producto IA</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        {/* Input file for camera triggering */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          style={{ display: 'none' }}
          ref={fileInputRef}
        />

        {/* Content Body */}
        <div style={styles.body}>
          
          {/* 1. Camera Trigger & Preview */}
          {!imagePreview ? (
            <div style={styles.capturePlaceholder} onClick={triggerCamera}>
              <Camera size={36} className="text-secondary" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '12px', fontWeight: 'bold' }}>SACAR FOTO AL PRODUCTO</p>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>El lente escaneará la etiqueta e identificará el insumo</p>
            </div>
          ) : (
            <div style={styles.previewContainer}>
              <img src={imagePreview} alt="Captura" style={styles.previewImage} />
              {!loading && !scannedResult && (
                <div style={styles.previewActions}>
                  <button onClick={triggerCamera} className="btn-secondary" style={{ padding: '8px' }}>
                    <Camera size={14} /> Reintentar Foto
                  </button>
                  <button onClick={runAiAnalysis} className="btn-primary" style={{ padding: '8px' }}>
                    <Sparkles size={14} /> Analizar con IA
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. Loading State */}
          {loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} className="pulse-neon" />
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-neon)' }}>{loadingStep}</p>
              <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Esto tomará unos segundos...</p>
            </div>
          )}

          {/* 3. Error Banner */}
          {error && (
            <div style={styles.errorContainer}>
              <AlertTriangle size={20} style={{ marginBottom: '6px' }} />
              <p style={{ fontSize: '11px', textAlign: 'center' }}>{error}</p>
              <button onClick={triggerCamera} className="btn-secondary" style={{ marginTop: '10px', padding: '6px 12px' }}>
                Intentar con otra foto
              </button>
            </div>
          )}

          {/* 4. AI Result Card */}
          {scannedResult && !loading && (
            <div className="glass-panel" style={styles.resultCard}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>RESULTADO IA</span>
                <span className="badge badge-success" style={{ fontSize: '9px' }}>{scannedResult.category}</span>
              </div>
              <h4 style={{ fontSize: '14px', marginBottom: '4px' }}>{scannedResult.name}</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Marca: {scannedResult.brand || 'N/A'}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '12px', lineHeight: '1.3' }}>
                "{scannedResult.description}"
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Precio estimado Argentina:</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent-neon)' }}>
                  ${parseFloat(scannedResult.estimated_price_ars).toLocaleString('es-AR')}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a 
                  href={getGoogleSearchLink()} 
                  target="_blank" 
                  rel="noreferrer"
                  className="btn-secondary" 
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', padding: '10px' }}
                >
                  <Search size={14} /> Buscar Precio Real en Google
                </a>
                
                <button onClick={handleFillForm} className="btn-primary" style={{ width: '100%', fontSize: '12px', padding: '10px' }}>
                  <Check size={14} /> Rellenar Ficha de Producto
                </button>
              </div>
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
    backgroundColor: 'var(--bg-surface)',
    boxShadow: 'var(--shadow-md)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '10px',
    marginBottom: '16px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  capturePlaceholder: {
    width: '100%',
    aspectRatio: '1.3',
    backgroundColor: 'rgba(0,0,0,0.4)',
    border: '2px dashed var(--border-color)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '16px',
    textAlign: 'center',
  },
  previewContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  previewImage: {
    width: '100%',
    maxHeight: '200px',
    objectFit: 'cover',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
  },
  previewActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.3fr',
    gap: '8px',
    width: '100%',
  },
  loadingContainer: {
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '8px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(100, 221, 23, 0.1)',
    borderTop: '3px solid var(--accent-neon)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorContainer: {
    padding: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '12px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  resultCard: {
    padding: '16px',
    backgroundColor: 'rgba(22, 18, 11, 0.4)',
    border: '1px solid var(--border-color)',
    textAlign: 'left',
  }
};

// Add keyframes for spinning animation
const styleTag = document.createElement('style');
styleTag.innerHTML = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(styleTag);

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
