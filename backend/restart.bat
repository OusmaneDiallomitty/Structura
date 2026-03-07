@echo off
echo ====================================
echo  STRUCTURA - Redemarrage complet
echo ====================================
echo.

echo [1/6] Arret de Docker...
docker-compose down

echo.
echo [2/6] Nettoyage Prisma Client...
if exist "node_modules\.prisma" (
    rmdir /s /q "node_modules\.prisma"
    echo ✓ Cache Prisma supprime
) else (
    echo ✓ Pas de cache a nettoyer
)

echo.
echo [3/6] Demarrage Docker (PostgreSQL + Redis)...
docker-compose up -d

echo.
echo [4/6] Attente PostgreSQL (5 secondes)...
timeout /t 5 /nobreak > nul

echo.
echo [5/6] Generation Prisma Client...
call npx prisma generate

echo.
echo [6/6] Push schema vers PostgreSQL...
call npx prisma db push

echo.
echo ====================================
echo  ✓ Configuration terminee !
echo ====================================
echo.
echo Pour demarrer le backend, execute :
echo   npm run dev
echo.
pause
