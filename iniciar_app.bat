@echo off
title BO growclub - Servidor de Desarrollo
echo ===================================================
echo   BO growclub - Iniciando Sistema de Gestion
echo ===================================================
echo.
echo [1/2] Abriendo aplicacion en el navegador...
cd /d "%~dp0"
start http://localhost:5190

echo [2/2] Iniciando el servidor local de Vite...
echo.
echo Presiona Ctrl+C en esta ventana para apagar el servidor.
echo ---------------------------------------------------
npm run dev -- --force
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se pudo iniciar el servidor. Asegurate de tener Node.js instalado.
    pause
)
