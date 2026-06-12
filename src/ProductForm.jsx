import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { X, Save, Camera, Sparkles, Barcode, MapPin, Printer } from 'lucide-react';
import BarcodeScannerModal from './BarcodeScannerModal';
import AiVisionScanner from './AiVisionScanner';

export default function ProductForm({ isOpen, onClose, productToEdit, onProductSaved, prefilledBarcode, user }) {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    cost_price: '',
    stock: '',
    category: 'Fertilizantes',
    barcode: '',
    image_url: '',
    latitude: '',
    longitude: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Scanners toggles
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        setFormData({
          name: productToEdit.name || '',
          price: productToEdit.price || '',
          cost_price: productToEdit.cost_price || '',
          stock: productToEdit.stock || '',
          category: productToEdit.category || 'Fertilizantes',
          barcode: productToEdit.barcode || '',
          image_url: productToEdit.image_url || '',
          latitude: productToEdit.latitude || '',
          longitude: productToEdit.longitude || ''
        });
      } else {
        setFormData({
          name: '',
          price: '',
          cost_price: '',
          stock: '',
          category: 'Fertilizantes',
          barcode: prefilledBarcode || '',
          image_url: '',
          latitude: '',
          longitude: ''
        });
      }
      setGpsError('');
    }
  }, [isOpen, productToEdit, prefilledBarcode]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1.5 * 1024 * 1024) {
        alert('La imagen es muy pesada (máx 1.5MB para almacenamiento en Base64)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image_url: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const getGPSLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no está soportada por tu navegador.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
        setGpsLoading(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        setGpsError('No se pudo obtener la ubicación GPS.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const priceNum = parseFloat(formData.price);
    const stockNum = parseInt(formData.stock, 10);

    if (!formData.name.trim() || isNaN(priceNum) || isNaN(stockNum)) {
      alert('Por favor completa nombre, precio y stock válidos.');
      return;
    }

    setLoading(true);
    try {
      const costNum = parseFloat(formData.cost_price) || 0;
      const payload = {
        name: formData.name.trim(),
        price: priceNum,
        cost_price: costNum,
        stock: stockNum,
        category: formData.category,
        barcode: formData.barcode.trim() || null,
        image_url: formData.image_url ? formData.image_url.trim() : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        ...(productToEdit 
          ? { updated_by: user?.id || null, updated_at: new Date().toISOString() } 
          : { created_by: user?.id || null }
        )
      };

      let error;
      let savedProduct = null;
      if (productToEdit) {
        // Update product
        const { data, error: dbError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', productToEdit.id)
          .select();
        error = dbError;
        if (data && data.length > 0) savedProduct = data[0];
      } else {
        // Insert new product
        const { data, error: dbError } = await supabase
          .from('products')
          .insert(payload)
          .select();
        error = dbError;
        if (data && data.length > 0) savedProduct = data[0];
      }

      if (error) throw error;

      // Log the inventory operation for supervisor history
      const productId = savedProduct?.id || productToEdit?.id;
      if (productId) {
        const logPayload = {
          product_id: productId,
          product_name: formData.name.trim(),
          user_id: user?.id || null,
          user_name: user?.name || 'Sistema',
          action: productToEdit ? 'edited' : 'created',
          details: {
            price: priceNum,
            stock: stockNum,
            category: formData.category,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null
          },
          seen_by_supervisor: false
        };
        await supabase.from('product_logs').insert(logPayload);

        // Fetch dollar rate for currency conversion
        let dollarRate = 1450.0;
        try {
          const dRes = await fetch('https://dolarapi.com/v1/dolares/oficial');
          if (dRes.ok) {
            const dData = await dRes.json();
            if (dData && dData.venta) dollarRate = parseFloat(dData.venta);
          }
        } catch (e) {
          console.error('Error fetching dollar rate in form:', e);
        }

        const priceUsd = (priceNum / dollarRate).toFixed(2);
        const costUsd = (costNum / dollarRate).toFixed(2);

        // Create in-app notification for supervisor
        await supabase.from('notifications').insert({
          recipient_role: 'supervisor',
          title: productToEdit ? 'Producto Modificado' : 'Producto Agregado',
          message: `El usuario ${user?.name || 'Sistema'} ha ${productToEdit ? 'modificado' : 'agregado'} el producto "${formData.name.trim()}" (ARS $${priceNum.toLocaleString('es-AR')} / USD US$ ${priceUsd}).`
        });

        // Trigger WhatsApp Deep Link
        const actionText = productToEdit ? 'MODIFICADO' : 'AGREGADO';
        const gpsText = formData.latitude && formData.longitude 
          ? `📍 Ubicación: https://maps.google.com/?q=${formData.latitude},${formData.longitude}` 
          : '📍 Ubicación: No provista';
        const waText = `*BO GROWCLUB* 🌿%0A` +
          `---------------------------%0A` +
          `*PRODUCTO ${actionText}*%0A` +
          `Nombre: ${formData.name.trim()}%0A` +
          `Categoría: ${formData.category}%0A` +
          `Precio: $${priceNum.toLocaleString('es-AR')} (US$ ${priceUsd})%0A` +
          `Costo: $${costNum.toLocaleString('es-AR')} (US$ ${costUsd})%0A` +
          `Stock: ${stockNum}%0A` +
          `${gpsText}%0A` +
          `Registrado por: ${user?.name || 'Sistema'}%0A` +
          `---------------------------%0A` +
          `_Enviado desde App BO Growclub_`;

        const testSupervisorPhone = '543816490060';
        const waLink = `https://wa.me/${testSupervisorPhone}?text=${waText}`;
        window.open(waLink, '_blank');
      }

      alert('Producto guardado correctamente.');
      if (onProductSaved) onProductSaved();
      onClose();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Error al guardar el producto. El código de barra podría estar duplicado.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = () => {
    if (!formData.barcode) {
      alert('El producto debe tener un código de barras o QR para poder imprimir la etiqueta.');
      return;
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(formData.barcode)}`;
    const printWindow = window.open('', '_blank', 'width=400,height=400');
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Etiqueta - ${formData.name}</title>
          <style>
            body {
              font-family: 'Inter', sans-serif;
              margin: 0;
              padding: 10px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              box-sizing: border-box;
            }
            .label-container {
              border: 1.5px dashed #4a7c3f;
              border-radius: 8px;
              padding: 12px;
              width: 230px;
              display: flex;
              flex-direction: column;
              align-items: center;
              background-color: #ffffff;
            }
            .brand {
              font-size: 10px;
              font-weight: 800;
              color: #4a7c3f;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              margin-bottom: 4px;
            }
            .product-name {
              font-size: 12px;
              font-weight: 700;
              color: #2c3e2c;
              margin-bottom: 8px;
              word-break: break-word;
            }
            .qr-code {
              width: 90px;
              height: 90px;
              margin-bottom: 6px;
            }
            .barcode-text {
              font-size: 10px;
              font-family: 'Courier New', Courier, monospace;
              color: #333333;
              font-weight: bold;
            }
            @media print {
              body {
                height: auto;
              }
              .label-container {
                border: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="brand">BO growclub 🌿</div>
            <div class="product-name">${formData.name}</div>
            <img class="qr-code" src="${qrUrl}" alt="QR" />
            <div class="barcode-text">${formData.barcode}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Barcode Handlers
  const handleBarcodeMatched = (matchedProduct) => {
    setIsBarcodeOpen(false);
    // Autofill with existing product
    setFormData({
      name: matchedProduct.name,
      price: matchedProduct.price,
      stock: matchedProduct.stock,
      category: matchedProduct.category || 'Fertilizantes',
      barcode: matchedProduct.barcode,
      image_url: matchedProduct.image_url || ''
    });
    alert(`Producto encontrado en catálogo: ${matchedProduct.name}`);
  };

  const handleNewBarcodeScanned = (barcodeText) => {
    setIsBarcodeOpen(false);
    setFormData(prev => ({ ...prev, barcode: barcodeText }));
    alert(`Nuevo código de barra detectado: ${barcodeText}`);
  };

  // AI Scanner Handler
  const handleAiScanComplete = (aiResult) => {
    setIsAiOpen(false);
    setFormData(prev => ({
      ...prev,
      name: aiResult.name,
      category: aiResult.category || prev.category,
      price: aiResult.estimated_price_ars || prev.price,
      description: aiResult.description || '' // Optional, we can populate description or image search
    }));
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div className="glass-panel animate-fade-in" style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div>
            <h3 style={{ fontSize: '16px' }}>
              {productToEdit ? 'Editar Producto' : 'Nuevo Producto'}
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Ingresa los detalles en el catálogo de BO</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        {/* AI assist button */}
        {!productToEdit && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <button 
              type="button" 
              onClick={() => setIsAiOpen(true)} 
              className="btn-secondary pulse-neon" 
              style={{ fontSize: '11px', padding: '10px', color: 'var(--accent-neon)', border: '1px solid var(--accent-neon)' }}
            >
              <Sparkles size={14} /> Auto-Llenar con IA
            </button>
            <button 
              type="button" 
              onClick={() => setIsBarcodeOpen(true)} 
              className="btn-secondary" 
              style={{ fontSize: '11px', padding: '10px' }}
            >
              <Barcode size={14} /> Escanear Código
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={styles.label}>Nombre del Producto</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ej. Fertilizante Top Bloom 1L"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={styles.label}>P. Venta ($)</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label style={styles.label}>P. Costo ($)</label>
              <input
                type="number"
                name="cost_price"
                value={formData.cost_price}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>
            <div>
              <label style={styles.label}>Stock</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                placeholder="0"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '8px' }}>
            <div>
              <label style={styles.label}>Categoría</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
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

            <div>
              <label style={styles.label}>Código de Barras</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder="Escaneado o manual"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setIsBarcodeOpen(true)}
                  className="btn-secondary"
                  style={{ padding: '0 10px', display: 'flex', alignItems: 'center' }}
                >
                  <Barcode size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Photo capture & GPS location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
            <div>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={handlePhotoChange} 
                id="product-photo-upload" 
                style={{ display: 'none' }} 
              />
              <label 
                htmlFor="product-photo-upload" 
                className="btn-secondary" 
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', width: '100%', height: '36px', boxSizing: 'border-box' }}
              >
                <Camera size={14} /> {formData.image_url ? 'Cambiar Foto' : 'Tomar Foto'}
              </label>
            </div>

            <button 
              type="button" 
              onClick={getGPSLocation} 
              className="btn-secondary" 
              style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', width: '100%', height: '36px' }}
              disabled={gpsLoading}
            >
              <MapPin size={14} /> {gpsLoading ? 'GPS...' : 'Fijar GPS'}
            </button>
          </div>

          {formData.image_url && formData.image_url.startsWith('data:') && (
            <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', height: '100px', border: '1px solid var(--border-color)', marginTop: '4px' }}>
              <img src={formData.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button 
                type="button" 
                onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))} 
                style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {formData.latitude && formData.longitude && (
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '6px 8px', backgroundColor: 'var(--bg-base)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <span>📍 Lat: {parseFloat(formData.latitude).toFixed(4)}, Lng: {parseFloat(formData.longitude).toFixed(4)}</span>
              <a 
                href={`https://maps.google.com/?q=${formData.latitude},${formData.longitude}`} 
                target="_blank" 
                rel="noreferrer" 
                style={{ color: 'var(--accent-gold)', textDecoration: 'underline', fontWeight: 'bold' }}
              >
                Ver Mapa
              </a>
            </div>
          )}

          {gpsError && (
            <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '2px' }}>{gpsError}</div>
          )}

          <div>
            <label style={styles.label}>URL Imagen del Producto (Opcional)</label>
            <input
              type="text"
              name="image_url"
              value={formData.image_url && formData.image_url.startsWith('data:') ? '' : formData.image_url}
              onChange={handleChange}
              placeholder="https://ejemplo.com/imagen.jpg"
              disabled={formData.image_url && formData.image_url.startsWith('data:')}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {productToEdit && (
              <button 
                type="button" 
                onClick={handlePrintLabel} 
                className="btn-secondary" 
                style={{ flex: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: 0 }}
                title="Imprimir Etiqueta con Código QR único"
              >
                <Printer size={16} /> Etiqueta
              </button>
            )}
            <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 1, height: '40px', marginTop: 0 }}>
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar en Catálogo'}
            </button>
          </div>
        </form>
      </div>

      {/* Nested Scanners Modals */}
      <BarcodeScannerModal
        isOpen={isBarcodeOpen}
        onClose={() => setIsBarcodeOpen(false)}
        onScanMatched={handleBarcodeMatched}
        onScanNewBarcode={handleNewBarcodeScanned}
      />

      <AiVisionScanner
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        onAiScanComplete={handleAiScanComplete}
      />
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
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    width: '100%',
    maxWidth: '380px',
    padding: '20px',
    backgroundColor: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  label: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '4px',
  }
};
