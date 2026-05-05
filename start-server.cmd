@echo off
cd /d "%~dp0"
echo Titan007 odds extractor: http://127.0.0.1:3000
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server.js
) else (
  node server.js
)
