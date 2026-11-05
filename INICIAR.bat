@echo off
setlocal
cd /d "%~dp0"
title Generador Pabbly - Servidor Local
color 0A
echo.
echo  =========================================
echo     GENERADOR PABBLY - VERSION LOCAL
echo  =========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo [AVISO] Node.js no esta instalado o no aparece en PATH.
 echo         Instala Node.js 20.19 o superior desde https://nodejs.org/
 echo         Al terminar, ejecuta INICIAR.bat nuevamente.
 echo.
 choice /C SN /M "Abrir la pagina oficial de Node.js ahora"
 if not errorlevel 2 start "" "https://nodejs.org/"
 pause
 exit /b 1
)
echo [OK] Node.js detectado.
where npm >nul 2>nul
if errorlevel 1 (
 echo [ERROR] npm no aparece en PATH. Vuelve a instalar Node.js LTS.
 pause
 exit /b 1
)
echo [OK] npm disponible.
if not exist "package.json" (
 echo [ERROR] No se encontro package.json en esta carpeta.
 echo         Extrae todo el contenido del ZIP y vuelve a intentarlo.
 pause
 exit /b 1
)
if not exist "node_modules\vite" (
 echo.
 echo [INFO] Instalando Vite por primera vez. Requiere conexion a Internet.
 call npm install
 if errorlevel 1 (
  echo.
  echo [ERROR] No se pudieron instalar las dependencias.
  echo         Comprueba tu conexion y vuelve a ejecutar INICIAR.bat.
  pause
  exit /b 1
 )
)
echo [OK] Dependencias disponibles.
echo.
echo  Generando la version compilada...
call npm run build
if errorlevel 1 (
 echo.
 echo [ERROR] Fallo la compilacion. Revisa el mensaje anterior.
 pause
 exit /b 1
)
echo.
echo  Iniciando servidor en http://127.0.0.1:8765
echo  Cierra esta ventana para detenerlo.
echo.
node server.js
if errorlevel 1 (
 echo.
 echo [ERROR] El servidor se detuvo. Comprueba si el puerto 8765 esta ocupado.
 pause
)
endlocal
