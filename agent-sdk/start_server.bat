@echo off
echo Starting CKS Lite Agent SDK with MiniMax API...

cd /d E:\GalaxyProject\cks-lite\agent-sdk

rem Set environment variables explicitly
set ANTHROPIC_API_KEY=sk-api-Pev2LZqiUnr-in4Eo5fnMNZ2JFR7kI9pyvcStAKtUPrVolmKFx78GA5fEl79JaQ7Al4jYJTTsp1hCuNPB8nGuPXHlC03n5O7VgxbgnKCORpzoDoZnWB4aA0
set ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
set MODEL_NAME=claude-sonnet-4-5-20250929
set MAX_TOKENS=4096
set TEMPERATURE=1.0
set HOST=127.0.0.1
set PORT=7860
set DATA_DIR=./data

echo Using MiniMax API: %ANTHROPIC_BASE_URL%
echo API Key: %ANTHROPIC_API_KEY:~0,20%...

rem Activate venv and start server
call venv\Scripts\activate.bat
python main.py
