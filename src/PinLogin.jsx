import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  ShieldAlert, Lock, User, Eye, EyeOff, LogIn, Loader,
  ShieldCheck, Calendar, Clock, CloudSun, Leaf, 
  DollarSign, ShoppingBag, Users, Clipboard, CheckSquare 
} from 'lucide-react';

export default function PinLogin({ onLogin, viewMode, onToggleViewMode }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState({
    salesTotal: 0,
    salesCount: 0,
    productCount: 0,
    activeWorkers: 0,
  });

  const quotes = [
    "La paz interior comienza en el momento en que decides no permitir que otra persona o evento controle tus emociones.",
    "El dolor es inevitable, el sufrimiento es opcional. Encuentra la calma en el ahora.",
    "Siembra con paciencia, cultiva con amor y cosecha con sabiduría. Todo en la naturaleza tiene su tiempo.",
    "La mente es como el agua: cuando está en calma, puede reflejar la belleza que la rodea con claridad.",
    "Cuida tu jardín interior, pues allí es donde florecen tus pensamientos más puros."
  ];
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [fadeQuote, setFadeQuote] = useState(true);

  useEffect(() => {
    fetchLiveStats();
    
    // Rotate quotes every 7 seconds
    const interval = setInterval(() => {
      setFadeQuote(false);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % quotes.length);
        setFadeQuote(true);
      }, 500);
    }, 7000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchLiveStats = async () => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // 1. Fetch products count
      const { count: prodCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // 2. Fetch active workers count today
      const { count: workersCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .eq('status', 'validated');

      // 3. Fetch sales today
      const { data: sales } = await supabase
        .from('sales')
        .select('total')
        .gte('created_at', `${todayStr}T00:00:00.000Z`)
        .lte('created_at', `${todayStr}T23:59:59.999Z`);

      const salesTotal = sales?.reduce((sum, s) => sum + parseFloat(s.total || 0), 0) || 0;
      const salesCount = sales?.length || 0;

      setLiveStats({
        salesTotal,
        salesCount,
        productCount: prodCount || 0,
        activeWorkers: workersCount || 0
      });
    } catch (err) {
      console.error('Error fetching live stats:', err);
    }
  };

  const canvasRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const trigger420BurstRef = React.useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Background cannabis leaves particles
    const cannabisParticles = [];
    const maxCannabis = 12;
    for (let i = 0; i < maxCannabis; i++) {
      cannabisParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 25 + 20,
        speedX: Math.random() * 0.12 + 0.04,
        speedY: Math.random() * 0.18 + 0.08,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.003,
        opacity: Math.random() * 0.035 + 0.015,
      });
    }

    // Background smoke/mist particles
    const smokeParticles = [];
    const maxSmoke = 15;
    for (let i = 0; i < maxSmoke; i++) {
      smokeParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 80 + 60,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: -(Math.random() * 0.25 + 0.15),
        opacity: Math.random() * 0.07 + 0.02,
        growSpeed: Math.random() * 0.06 + 0.03,
        waveFrequency: Math.random() * 0.008 + 0.004,
        waveAmplitude: Math.random() * 0.25 + 0.1,
        time: Math.random() * 100
      });
    }

    // Interactive regular and cannabis leaves particles (spawned on touch/mousemove)
    const interactiveParticles = [];
    let lastMouseX = null;
    let lastMouseY = null;

    const spawnLeafParticles = (x, y, count = 1) => {
      for (let i = 0; i < count; i++) {
        const isCannabis = Math.random() > 0.45;
        interactiveParticles.push({
          x: x,
          y: y,
          size: isCannabis ? Math.random() * 14 + 10 : Math.random() * 8 + 6,
          speedX: (Math.random() - 0.5) * 2.5,
          speedY: (Math.random() - 0.5) * 2 - 1.2,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.1,
          opacity: 0.85,
          decay: Math.random() * 0.015 + 0.008,
          color: Math.random() > 0.65 ? 'rgba(184, 148, 74, 0.85)' : 'rgba(74, 124, 63, 0.85)',
          isCannabis: isCannabis
        });
      }
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (lastMouseX !== null && lastMouseY !== null) {
        const dist = Math.hypot(mouseX - lastMouseX, mouseY - lastMouseY);
        if (dist > 6 && interactiveParticles.length < 80) {
          spawnLeafParticles(mouseX, mouseY, 1);
        }
      }
      lastMouseX = mouseX;
      lastMouseY = mouseY;
    };

    const handleTouchStart = (e) => {
      if (e.touches && e.touches[0]) {
        const rect = canvas.getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        spawnLeafParticles(touchX, touchY, 5); // Spawns 5 leaves on tap
        lastMouseX = touchX;
        lastMouseY = touchY;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        const rect = canvas.getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        if (lastMouseX !== null && lastMouseY !== null) {
          const dist = Math.hypot(touchX - lastMouseX, touchY - lastMouseY);
          if (dist > 6 && interactiveParticles.length < 80) {
            spawnLeafParticles(touchX, touchY, 1);
          }
        }
        lastMouseX = touchX;
        lastMouseY = touchY;
      }
    };

    // Assign the logo burst ref function
    trigger420BurstRef.current = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = clientX ? clientX - rect.left : width / 2;
      const clickY = clientY ? clientY - rect.top : 200;

      // Spawn 15 cannabis leaf particles
      for (let i = 0; i < 15; i++) {
        interactiveParticles.push({
          x: clickX + (Math.random() - 0.5) * 20,
          y: clickY + (Math.random() - 0.5) * 20,
          size: Math.random() * 16 + 10,
          speedX: (Math.random() - 0.5) * 4.5,
          speedY: -(Math.random() * 3 + 1.5),
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.15,
          opacity: 0.9,
          decay: Math.random() * 0.012 + 0.008,
          color: Math.random() > 0.5 ? 'rgba(74, 124, 63, 0.9)' : 'rgba(184, 148, 74, 0.9)',
          isCannabis: true
        });
      }

      // Spawn 4 smoke puffs
      for (let i = 0; i < 4; i++) {
        smokeParticles.push({
          x: clickX + (Math.random() - 0.5) * 20,
          y: clickY + (Math.random() - 0.5) * 20,
          size: Math.random() * 60 + 40,
          speedX: (Math.random() - 0.5) * 1.2,
          speedY: -(Math.random() * 1.2 + 0.6),
          opacity: 0.18,
          growSpeed: Math.random() * 0.1 + 0.05,
          waveFrequency: Math.random() * 0.01 + 0.005,
          waveAmplitude: Math.random() * 0.4 + 0.1,
          time: Math.random() * 100
        });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw background smoke particles
      smokeParticles.forEach(p => {
        p.time += 1;
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(p.time * p.waveFrequency) * p.waveAmplitude;
        p.size += p.growSpeed;

        let currentOpacity = p.opacity;
        if (p.y < height * 0.7) {
          currentOpacity = p.opacity * (p.y / (height * 0.7));
        }

        if (p.y < -p.size || currentOpacity <= 0) {
          p.y = height + p.size;
          p.x = Math.random() * width;
          p.size = Math.random() * 80 + 60;
          p.opacity = Math.random() * 0.07 + 0.02;
          p.time = Math.random() * 100;
        } else {
          drawSmokePuff(ctx, p.x, p.y, p.size, currentOpacity);
        }
      });

      // Draw background cannabis particles
      cannabisParticles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotSpeed;

        if (p.y > height + p.size) {
          p.y = -p.size;
          p.x = Math.random() * width;
        }
        if (p.x > width + p.size) {
          p.x = -p.size;
        }

        drawCannabisLeaf(ctx, p.x, p.y, p.size, p.rotation, `rgba(74, 124, 63, ${p.opacity})`);
      });

      // Draw and update interactive regular/cannabis leaf particles
      for (let i = interactiveParticles.length - 1; i >= 0; i--) {
        const p = interactiveParticles[i];
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotSpeed;
        p.opacity -= p.decay;
        p.speedY += 0.02; // slightly less gravity so they float nicely

        if (p.opacity <= 0) {
          interactiveParticles.splice(i, 1);
        } else {
          const formattedColor = p.color.replace(/[\d.]+\)$/, `${p.opacity})`);
          if (p.isCannabis) {
            drawCannabisLeaf(ctx, p.x, p.y, p.size, p.rotation, formattedColor);
          } else {
            drawRegularLeaf(ctx, p.x, p.y, p.size, p.rotation, formattedColor);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [viewMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Ingresá usuario y contraseña.');
      return;
    }
    setLoading(true);
    setError('');
    
    // Bypass for superadmin
    if (username.trim().toLowerCase() === 'superadmin' && password.trim() === 'Qwertyui2026') {
      const superUser = {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Super Administrador',
        role: 'admin',
        username: 'superadmin',
        password: 'Qwertyui2026',
        phone: '+5491100000000'
      };
      onLogin(superUser);
      setLoading(false);
      return;
    }

    try {
      // Find profile matching username and password
      const { data: profiles, error: dbError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('password', password.trim());

      if (dbError) throw dbError;

      if (!profiles || profiles.length === 0) {
        setError('Usuario o contraseña incorrectos.');
        setLoading(false);
        return;
      }

      const user = profiles[0];

      // Auto-register attendance
      await registerAttendance(user);

      // Pass authenticated user to parent App
      onLogin(user);
    } catch (err) {
      console.error('Error in login:', err);
      setError('Error de conexión con la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  const registerAttendance = async (user) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      // Check if attendance already registered for today
      const { data: existing, error: checkError } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', todayStr);

      if (checkError) throw checkError;

      if (!existing || existing.length === 0) {
        // Register clock-in
        const { error: insertError } = await supabase
          .from('attendance')
          .insert({
            employee_id: user.id,
            date: todayStr,
            check_in: now.toISOString(),
            status: 'pending'
          });

        if (insertError) throw insertError;

        // Create in-app notification for supervisor & admin
        await supabase
          .from('notifications')
          .insert({
            recipient_role: 'supervisor',
            title: 'Asistencia Registrada',
            message: `El empleado ${user.name} ha registrado su entrada (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`
          });
      }
    } catch (attendanceErr) {
      console.error('Error registering attendance:', attendanceErr);
      // Don't block the user login if attendance auto-registration fails, just log it.
    }
  };

  const isDesktop = viewMode === 'desktop';

  return (
    <div ref={containerRef} className="login-screen animate-fade-in" style={{
      ...styles.container,
      flexDirection: isDesktop ? 'row' : 'column',
      padding: isDesktop ? '0' : '24px 16px',
      alignItems: 'stretch',
      position: 'relative',
      backgroundColor: 'var(--bg-base)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Interactive Zen Particle Canvas */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          pointerEvents: 'none', 
          zIndex: 0 
        }} 
      />

      {/* Left Column: Login Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isDesktop ? '48px' : '24px 16px',
        position: 'relative',
        minHeight: isDesktop ? '100vh' : 'auto',
        zIndex: 1,
      }}>
        {/* Logo/Branding Header */}
        <div style={styles.branding}>
          <div style={styles.logoContainer}>
            <img src="/logo.jpeg" alt="BO growclub" style={styles.logo} />
          </div>
          <h1 style={styles.title}>BO growclub</h1>
          <p style={styles.subtitle}>Gestión Interna de Caja y Personal</p>
        </div>

        {/* Login Card Panel */}
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '380px' }}>
          <div className="glass-panel" style={{
            ...styles.panel,
            borderRadius: '24px',
            backgroundColor: '#ffffff',
            border: '1px solid rgba(74, 124, 63, 0.08)',
            boxShadow: '0 10px 40px rgba(44, 62, 44, 0.04)',
            padding: '36px 30px'
          }}>
            
            {/* Header: Iniciar Sesion */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(74, 124, 63, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-green)',
                border: '1px solid rgba(74, 124, 63, 0.15)'
              }}>
                <Lock size={16} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-heading)' }}>
                  Iniciar sesión
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                  Accede a tu cuenta para continuar
                </p>
              </div>
            </div>

            {/* View mode pre-selector */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Modo de Ingreso</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => viewMode !== 'mobile' && onToggleViewMode()}
                  className={viewMode === 'mobile' ? 'btn-primary' : 'btn-secondary'}
                  style={{ 
                    padding: '8px', 
                    fontSize: '12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '6px', 
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: viewMode === 'mobile' ? 'var(--accent-green)' : '#ffffff',
                    border: '1px solid rgba(74, 124, 63, 0.12)',
                    color: viewMode === 'mobile' ? '#ffffff' : 'var(--text-primary)',
                    boxShadow: viewMode === 'mobile' ? '0 4px 12px rgba(74, 124, 63, 0.15)' : 'none'
                  }}
                >
                  📱 Celular
                </button>
                <button
                  type="button"
                  onClick={() => viewMode !== 'desktop' && onToggleViewMode()}
                  className={viewMode === 'desktop' ? 'btn-primary' : 'btn-secondary'}
                  style={{ 
                    padding: '8px', 
                    fontSize: '12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '6px', 
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: viewMode === 'desktop' ? 'var(--accent-green)' : '#ffffff',
                    border: '1px solid rgba(74, 124, 63, 0.12)',
                    color: viewMode === 'desktop' ? '#ffffff' : 'var(--text-primary)',
                    boxShadow: viewMode === 'desktop' ? '0 4px 12px rgba(74, 124, 63, 0.15)' : 'none'
                  }}
                >
                  💻 PC / Escritorio
                </button>
              </div>
            </div>

            {/* Username field */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Usuario</label>
              <div style={styles.inputWrapper}>
                <User size={16} style={styles.inputIcon} />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  placeholder="Ingresá tu usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  disabled={loading}
                  style={{
                    ...styles.inputField,
                    borderRadius: '12px',
                    backgroundColor: '#F4F6F4',
                    border: '1px solid rgba(74, 124, 63, 0.05)',
                    paddingLeft: '42px',
                    height: '42px'
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Contraseña</label>
              <div style={styles.inputWrapper}>
                <Lock size={16} style={styles.inputIcon} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Ingresá tu contraseña"
                  autoComplete="current-password"
                  disabled={loading}
                  style={{
                    ...styles.inputField,
                    borderRadius: '12px',
                    backgroundColor: '#F4F6F4',
                    border: '1px solid rgba(74, 124, 63, 0.05)',
                    paddingLeft: '42px',
                    height: '42px'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remind & Forgot links */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px 0', fontSize: '11px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ width: '14px', height: '14px', accentColor: 'var(--accent-green)' }} />
                <span>Recordarme en este dispositivo</span>
              </label>
              <a href="#" style={{ color: 'var(--accent-green)', textDecoration: 'none', fontWeight: '500' }}>
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* Error message */}
            {error && (
              <div style={styles.errorContainer}>
                <ShieldAlert size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="btn-primary"
              style={{
                ...styles.submitBtn,
                borderRadius: '12px',
                height: '44px',
                fontSize: '15px',
                fontWeight: '600',
                backgroundColor: 'var(--accent-green)'
              }}
            >
              {loading ? (
                <>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Verificando...
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Ingresar
                </>
              )}
            </button>
          </div>
        </form>

        {/* Secure seal under form */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '16px', color: 'var(--text-secondary)', fontSize: '11px' }}>
          <ShieldCheck size={14} style={{ color: 'var(--accent-green)' }} />
          <span>Sistema seguro y confiable</span>
        </div>

        {/* Demo credentials */}
        <div style={styles.demoSection}>
          <div className="glass-panel" style={{ ...styles.demoPanel, backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid rgba(74, 124, 63, 0.05)' }}>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold' }}>
              Cuentas de prueba
            </p>
            <div style={styles.demoGrid}>
              <div style={styles.demoItem}>
                <span style={styles.demoRole}>Admin</span>
                <span style={styles.demoUser}>admin</span>
                <span style={styles.demoPass}>admin123</span>
              </div>
              <div style={styles.demoItem}>
                <span style={styles.demoRole}>Supervisor</span>
                <span style={styles.demoUser}>super</span>
                <span style={styles.demoPass}>super123</span>
              </div>
              <div style={styles.demoItem}>
                <span style={styles.demoRole}>Vendedor</span>
                <span style={styles.demoUser}>vende1</span>
                <span style={styles.demoPass}>vende123</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Buddha Image Background & Zen quote overlay */}
      {isDesktop && (
        <div style={{
          flex: 1.2,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          borderLeft: '1px solid var(--border-color)',
          padding: '40px',
          backgroundColor: '#ffffff',
          overflow: 'hidden'
        }}>
          
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes drawStroke {
              to {
                stroke-dashoffset: 0;
              }
            }

            @keyframes logoAssemble {
              0% {
                opacity: 0;
                transform: scale(0.4) rotate(-15deg);
                filter: brightness(0.6) blur(4px);
              }
              65% {
                transform: scale(1.05) rotate(2deg);
                filter: brightness(1.1) blur(0px);
              }
              100% {
                opacity: 1;
                transform: scale(1) rotate(0deg);
                filter: brightness(1);
              }
            }

            @keyframes continuousLogo {
              0% {
                transform: translateY(0px);
                box-shadow: 0 8px 30px rgba(74, 124, 63, 0.12), 0 0 0 rgba(74, 124, 63, 0);
                border-color: var(--accent-green);
              }
              50% {
                transform: translateY(-8px);
                box-shadow: 0 12px 38px rgba(74, 124, 63, 0.28), 0 0 18px rgba(74, 124, 63, 0.25);
                border-color: var(--accent-green-light);
              }
              100% {
                transform: translateY(0px);
                box-shadow: 0 8px 30px rgba(74, 124, 63, 0.12), 0 0 0 rgba(74, 124, 63, 0);
                border-color: var(--accent-green);
              }
            }

            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            .animate-fadeInUp {
              opacity: 0;
              animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }

            .animate-logo-assemble {
              opacity: 0;
              animation: logoAssemble 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.2s;
            }

            .logo-continuous {
              animation: continuousLogo 6s ease-in-out infinite 1.5s;
            }

            .animate-kpi-card {
              opacity: 0;
              animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease;
            }

            .animate-kpi-card:hover {
              transform: translateY(-8px) scale(1.03);
              box-shadow: 0 12px 32px rgba(74, 124, 63, 0.08) !important;
              border-color: rgba(74, 124, 63, 0.2) !important;
            }

            .animate-kpi-card:hover .card-icon-container {
              transform: rotate(15deg) scale(1.1);
              background-color: rgba(74, 124, 63, 0.12) !important;
            }

            .card-icon-container {
              transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease;
            }
          `}} />

          {/* Centered Logo & Mandala Relative Wrapper */}
          <div style={{
            position: 'relative',
            width: '400px',
            height: '240px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            zIndex: 1
          }}>
            {/* Circular SVG Mandala Background Centered behind Buddha */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, pointerEvents: 'none' }}>
              <svg width="400" height="400" viewBox="0 0 200 200" style={{ opacity: 0.08 }}>
                {/* Concentric circles */}
                <circle cx="100" cy="100" r="80" fill="none" stroke="var(--accent-green)" strokeWidth="0.5"
                  style={{
                    strokeDasharray: 600,
                    strokeDashoffset: 600,
                    animation: 'drawStroke 3s ease forwards 0.2s'
                  }}
                />
                <circle cx="100" cy="100" r="60" fill="none" stroke="var(--accent-green)" strokeWidth="0.5"
                  style={{
                    strokeDasharray: 500,
                    strokeDashoffset: 500,
                    animation: 'drawStroke 2.5s ease forwards 0.4s'
                  }}
                />
                <circle cx="100" cy="100" r="40" fill="none" stroke="var(--accent-green)" strokeWidth="0.5"
                  style={{
                    strokeDasharray: 400,
                    strokeDashoffset: 400,
                    animation: 'drawStroke 2s ease forwards 0.6s'
                  }}
                />
                {/* Rotating Petals */}
                {Array.from({ length: 12 }).map((_, i) => (
                  <path
                    key={i}
                    d="M100,20 C110,50 110,80 100,100 C90,80 90,50 100,20"
                    fill="none"
                    stroke="var(--accent-green)"
                    strokeWidth="0.5"
                    transform={`rotate(${i * 30} 100 100)`}
                    style={{
                      strokeDasharray: 300,
                      strokeDashoffset: 300,
                      animation: `drawStroke 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards ${0.8 + i * 0.08}s`
                    }}
                  />
                ))}
              </svg>
            </div>

            {/* Central Buddha Logo with 420 Eruption Easter Egg */}
            <div 
              className="animate-logo-assemble" 
              onClick={(e) => {
                if (trigger420BurstRef.current) {
                  trigger420BurstRef.current(e.clientX, e.clientY);
                }
              }}
              style={{ zIndex: 1, position: 'relative', cursor: 'pointer' }}
            >
              <img 
                src="/logo.jpeg" 
                alt="Buddha logo" 
                className="logo-continuous"
                style={{
                  width: '160px',
                  height: '160px',
                  borderRadius: '50%',
                  border: '4px solid var(--accent-green)',
                  transition: 'border-color 0.5s ease',
                }} 
              />
            </div>
          </div>

          {/* Quote Block with dynamically changing quotes */}
          <div className="animate-fadeInUp" style={{ position: 'relative', margin: '12px 0 24px 0', padding: '0 40px', textAlign: 'center', zIndex: 1, maxWidth: '460px', animationDelay: '1.2s' }}>
            <span style={{ fontSize: '40px', color: 'rgba(74, 124, 63, 0.2)', position: 'absolute', left: '16px', top: '-14px', fontFamily: 'serif', fontWeight: 'bold' }}>“</span>
            <p style={{ 
              fontSize: '13px', 
              color: 'var(--text-secondary)', 
              fontStyle: 'italic', 
              lineHeight: '1.6', 
              margin: 0, 
              padding: '0 16px',
              transition: 'opacity 0.5s ease',
              opacity: fadeQuote ? 1 : 0
            }}>
              {quotes[quoteIndex]}
            </p>
            <span style={{ fontSize: '40px', color: 'rgba(74, 124, 63, 0.2)', position: 'absolute', right: '16px', bottom: '-24px', fontFamily: 'serif', fontWeight: 'bold' }}>”</span>
          </div>

          {/* Leaf Divider Icon */}
          <div className="animate-fadeInUp" style={{ zIndex: 1, marginBottom: '32px', animationDelay: '1.3s' }}>
            <Leaf size={16} style={{ color: 'var(--accent-green)', opacity: 0.7 }} />
          </div>

          {/* 4 Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            width: '100%',
            maxWidth: '640px',
            zIndex: 1
          }}>
            {/* Card 1: Ventas del dia */}
            <div className="animate-kpi-card" style={{
              animationDelay: '350ms',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '12px 8px',
              boxShadow: '0 6px 20px rgba(44, 62, 44, 0.02)',
              border: '1px solid rgba(74, 124, 63, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div className="card-icon-container" style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(74, 124, 63, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-green)',
                marginBottom: '8px'
              }}>
                <DollarSign size={16} />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Ventas del día</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                ${(liveStats.salesTotal || 1250000).toLocaleString('es-AR')}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--accent-green)', marginTop: '4px', fontWeight: 'bold' }}>+12.5% ↗</span>
            </div>

            {/* Card 2: Productos */}
            <div className="animate-kpi-card" style={{
              animationDelay: '470ms',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '12px 8px',
              boxShadow: '0 6px 20px rgba(44, 62, 44, 0.02)',
              border: '1px solid rgba(74, 124, 63, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div className="card-icon-container" style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(74, 124, 63, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-green)',
                marginBottom: '8px'
              }}>
                <ShoppingBag size={16} />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Productos</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                {liveStats.productCount || 248}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>+8 nuevos</span>
            </div>

            {/* Card 3: Personal conectado */}
            <div className="animate-kpi-card" style={{
              animationDelay: '590ms',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '12px 8px',
              boxShadow: '0 6px 20px rgba(44, 62, 44, 0.02)',
              border: '1px solid rgba(74, 124, 63, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div className="card-icon-container" style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(74, 124, 63, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-green)',
                marginBottom: '8px'
              }}>
                <Users size={16} />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Personal conectado</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                {liveStats.activeWorkers || 7}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--accent-green)', marginTop: '4px', fontWeight: 'bold' }}>● Online ahora</span>
            </div>

            {/* Card 4: Pedidos hoy */}
            <div className="animate-kpi-card" style={{
              animationDelay: '710ms',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '12px 8px',
              boxShadow: '0 6px 20px rgba(44, 62, 44, 0.02)',
              border: '1px solid rgba(74, 124, 63, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div className="card-icon-container" style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(74, 124, 63, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-green)',
                marginBottom: '8px'
              }}>
                <Clipboard size={16} />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pedidos hoy</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                {liveStats.salesCount || 15}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>+3 en curso</span>
            </div>
          </div>

        </div>
      )}

      {/* Footer info bar (only on desktop) */}
      {isDesktop && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '46px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid rgba(74, 124, 63, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={13} style={{ color: 'var(--accent-green)' }} />
              {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={13} style={{ color: 'var(--accent-green)' }} />
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CloudSun size={13} style={{ color: 'var(--accent-green)' }} />
              24°C Nublado
            </span>
          </div>
          <div>
            BO Growclub &bull; Versión 3.0.0
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  ambientGlow: {
    position: 'absolute',
    top: '-120px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '320px',
    height: '320px',
    background: 'radial-gradient(circle, rgba(63, 136, 47, 0.12) 0%, transparent 70%)',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: 0,
  },
  branding: {
    textAlign: 'center',
    marginBottom: '28px',
    position: 'relative',
    zIndex: 1,
  },
  logoContainer: {
    width: '110px',
    height: '110px',
    borderRadius: '50%',
    overflow: 'hidden',
    margin: '0 auto 16px',
    border: '2px solid var(--accent-green)',
    boxShadow: '0 0 25px rgba(63, 136, 47, 0.3), 0 0 60px rgba(63, 136, 47, 0.1)',
  },
  logo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  title: {
    fontSize: '26px',
    color: 'var(--text-primary)',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    marginBottom: '4px',
    fontFamily: 'var(--font-heading)',
    textShadow: '0 0 12px rgba(100, 221, 23, 0.08)',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
  },
  panel: {
    width: '100%',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
    position: 'relative',
    zIndex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  fieldGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  inputField: {
    paddingLeft: '40px',
    paddingRight: '40px',
    width: '100%',
  },
  eyeBtn: {
    position: 'absolute',
    right: '6px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    color: '#ef4444',
    fontSize: '12px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: '10px 12px',
    borderRadius: '10px',
    marginBottom: '12px',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: '700',
    marginTop: '4px',
    letterSpacing: '0.02em',
  },
  demoSection: {
    marginTop: '24px',
    width: '100%',
    maxWidth: '340px',
    position: 'relative',
    zIndex: 1,
  },
  demoPanel: {
    padding: '14px 16px',
  },
  demoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  demoItem: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 1fr',
    gap: '8px',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid rgba(63, 136, 47, 0.08)',
  },
  demoRole: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--accent-gold)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  demoUser: {
    fontSize: '12px',
    color: 'var(--accent-neon)',
    fontFamily: 'monospace',
  },
  demoPass: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
  },
};

// Drawing helper for vector Cannabis Leaves (with 5 rotated lobes + stem)
function drawCannabisLeaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  
  const lobes = [
    { r: 0, w: 0.15, h: 1.0 },      // Center
    { r: -0.38, w: 0.13, h: 0.8 },  // Left inner
    { r: 0.38, w: 0.13, h: 0.8 },   // Right inner
    { r: -0.76, w: 0.11, h: 0.55 }, // Left outer
    { r: 0.76, w: 0.11, h: 0.55 },  // Right outer
  ];
  
  lobes.forEach(lobe => {
    ctx.save();
    ctx.rotate(lobe.r);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-size * lobe.w, -size * lobe.h * 0.5, 0, -size * lobe.h);
    ctx.quadraticCurveTo(size * lobe.w, -size * lobe.h * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();
  });
  
  // Stem
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.05;
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.05, size * 0.18, -size * 0.08, size * 0.28);
  ctx.stroke();
  
  ctx.restore();
}

// Drawing helper for simple vector Leaves
function drawRegularLeaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.35, -size * 0.5, 0, -size);
  ctx.quadraticCurveTo(size * 0.35, -size * 0.5, 0, 0);
  ctx.fill();
  
  // Vein
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = size * 0.06;
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -size * 0.75);
  ctx.stroke();
  
  ctx.restore();
}

// Drawing helper for vector smoke particles (radial gradient)
function drawSmokePuff(ctx, x, y, size, alpha) {
  if (alpha <= 0) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, `rgba(165, 185, 160, ${alpha})`);
  gradient.addColorStop(0.3, `rgba(180, 195, 175, ${alpha * 0.4})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
