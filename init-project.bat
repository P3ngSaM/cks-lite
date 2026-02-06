@echo off
chcp 65001 >nul
echo ========================================
echo CKS Lite - 项目初始化脚本
echo ========================================
echo.

:: 检查 Python
echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo ✓ Python 已安装

:: 检查 Node.js
echo.
echo [2/4] 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js 已安装

:: 初始化 Agent SDK
echo.
echo [3/4] 初始化 Agent SDK...
cd agent-sdk

echo - 创建虚拟环境...
python -m venv venv

echo - 激活虚拟环境...
call venv\Scripts\activate.bat

echo - 安装 Python 依赖...
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

echo - 创建环境配置...
if not exist .env (
    copy .env.example .env
    echo ✓ 已创建 .env 文件，请编辑并配置 ANTHROPIC_API_KEY
)

echo - 创建数据目录...
mkdir data 2>nul

cd ..
echo ✓ Agent SDK 初始化完成

:: 初始化桌面应用
echo.
echo [4/4] 初始化桌面应用...
cd desktop-app

if exist package.json (
    echo - 安装 Node.js 依赖...
    npm install
    echo ✓ 桌面应用初始化完成
) else (
    echo ! 桌面应用尚未创建，跳过
)

cd ..

:: 完成
echo.
echo ========================================
echo ✓ 项目初始化完成！
echo ========================================
echo.
echo 下一步：
echo 1. 编辑 agent-sdk\.env 配置 Claude API Key
echo 2. 启动 Agent SDK: cd agent-sdk ^&^& venv\Scripts\activate ^&^& python main.py
echo 3. 启动桌面应用: cd desktop-app ^&^& npm run tauri dev
echo.
pause
