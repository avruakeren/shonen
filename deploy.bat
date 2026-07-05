@echo off
echo === Shonen Deploy ===
echo.

REM Add all changes
git add -A

REM Check if there are changes to commit
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No changes to deploy.
    goto push
)

REM Commit
set /p msg="Commit message: "
if "%msg%"=="" set "msg=Update"
git commit -m "%msg%"

:push
echo.
echo Pushing to origin main...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo Done! Vercel will auto-deploy.
) else (
    echo.
    echo Push failed. Check your git remote.
)
pause
