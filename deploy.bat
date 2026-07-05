@echo off
echo === Shonen Deploy ===
echo.

REM Build fresh data
echo [1/3] Scraping data from otakudesu...
python build.py
if %errorlevel% neq 0 (
    echo WARNING: Build failed, continuing anyway...
)

REM Commit and push
echo.
echo [2/3] Committing changes...
git add -A

git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No changes to commit.
    goto push
)

set /p msg="Commit message: "
if "%msg%"=="" set "msg=Update"
git commit -m "%msg%"

:push
echo.
echo [3/3] Pushing to origin main...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo Done! Vercel will auto-deploy.
) else (
    echo.
    echo Push failed. Check your git remote.
)
pause
