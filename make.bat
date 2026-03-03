@echo off

if "%1"=="" goto help
if "%1"=="help" goto help
if "%1"=="install_base" goto install_base
if "%1"=="install_deps" goto install_deps
if "%1"=="build_docs" goto build_docs
if "%1"=="build" goto build
if "%1"=="test" goto test
if "%1"=="run" goto run
if "%1"=="build_wasm" goto build_wasm
if "%1"=="build_docker" goto build_docker
if "%1"=="run_docker" goto run_docker

:help
echo Available commands:
echo   make.bat install_base  - Install Node.js
echo   make.bat install_deps  - Install dependencies (npm install)
echo   make.bat build_docs    - Build API docs
echo   make.bat build         - Build the CLI binary
echo   make.bat test          - Run tests locally
echo   make.bat run           - Run the CLI
echo   make.bat build_wasm    - Build the WASM output
echo   make.bat build_docker  - Build Docker images
echo   make.bat run_docker    - Run Docker images
goto end

:install_base
echo Please install Node.js ^>= 18.0.0 manually if not installed.
npm --version || echo npm not found. Please install Node.js.
goto end

:install_deps
call npm install
goto end

:build_docs
call npm run docs
goto end

:build
call npm run build
goto end

:test
call npm run test
goto end

:run
call npm run build
node dist\cli.js %2 %3 %4 %5 %6 %7 %8 %9
goto end

:build_wasm
echo Building WASM (browser bundle)...
call npx esbuild dist\index.js --bundle --platform=browser --outfile=wasm\cdd-ts.js
goto end

:build_docker
docker build -f debian.Dockerfile -t cdd-ts:debian .
docker build -f alpine.Dockerfile -t cdd-ts:alpine .
goto end

:run_docker
docker run -d -p 8080:8080 --name cdd-ts-test cdd-ts:alpine
timeout /t 2 /nobreak
curl -X POST -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"version\",\"id\":1}" http://localhost:8080
docker stop cdd-ts-test
docker rm cdd-ts-test
goto end

:end
