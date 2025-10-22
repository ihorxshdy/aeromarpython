#!/bin/bash
echo "🌐 Запуск Aeromar с доступом из локальной сети"

# Получаем текущий IP автоматически
source ./get-ip.sh

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Не удалось определить IP-адрес. Запуск только с localhost."
    LOCAL_IP="localhost"
fi

echo "📡 Ваш текущий IP-адрес: $LOCAL_IP"

# Создаем директорию для логов
mkdir -p /Users/igordvoretskii/Documents/aeromar-python/logs

# Функция для запуска в фоне с логированием
run_component() {
    local name=$1
    local command=$2
    local log_file="/Users/igordvoretskii/Documents/aeromar-python/logs/${name}.log"
    
    echo "▶️  Запуск $name..."
    eval "$command" > "$log_file" 2>&1 &
    local pid=$!
    echo "   PID: $pid, Логи: $log_file"
    echo $pid > "/Users/igordvoretskii/Documents/aeromar-python/logs/${name}.pid"
}

# Проверяем и освобождаем порты
echo "🔍 Проверка портов..."
backend_pid=$(lsof -ti:8000 2>/dev/null)
if [ ! -z "$backend_pid" ]; then
    echo "   Освобождаем порт 8000..."
    kill -9 "$backend_pid" 2>/dev/null
fi

frontend_pid=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$frontend_pid" ]; then
    echo "   Освобождаем порт 3000..."
    kill -9 "$frontend_pid" 2>/dev/null
fi

sleep 2

# Запуск Backend API с доступом из сети
echo "🐍 Запуск Backend API (доступ из сети)..."
run_component "backend" "cd /Users/igordvoretskii/Documents/aeromar-python && source .venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"

# Ждем запуска API
echo "⏳ Ждем запуска API (5 секунд)..."
sleep 5

# Проверяем, что API запустился
if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "✅ Backend API запущен успешно"
else
    echo "⚠️  Backend API может еще запускаться..."
fi

# Запуск React приложения с доступом из сети
echo "⚛️  Запуск React приложения (доступ из сети)..."

# Проверяем зависимости React
if [ ! -d "/Users/igordvoretskii/Documents/aeromar-python/frontend/node_modules" ]; then
    echo "📦 Установка зависимостей React..."
    cd /Users/igordvoretskii/Documents/aeromar-python/frontend
    npm install
    cd /Users/igordvoretskii/Documents/aeromar-python
fi

run_component "react" "cd /Users/igordvoretskii/Documents/aeromar-python/frontend && HOST=0.0.0.0 PORT=3000 npm start"

# Ждем запуска React
echo "⏳ Ждем запуска React (10 секунд)..."
sleep 10

echo ""
echo "✅ Система Aeromar запущена с доступом из локальной сети!"
echo ""
echo "🌐 Локальные URL:"
echo "   🔧 Backend API:      http://localhost:8000"
echo "   📚 API Docs:         http://localhost:8000/docs"  
echo "   ⚛️  React App:       http://localhost:3000"
echo ""
if [ "$LOCAL_IP" != "localhost" ]; then
    echo "🌍 URL для других компьютеров в сети:"
    echo "   🔧 Backend API:      http://$LOCAL_IP:8000"
    echo "   📚 API Docs:         http://$LOCAL_IP:8000/docs"  
    echo "   ⚛️  React App:       http://$LOCAL_IP:3000"
    echo ""
fi
echo "📋 Управление:"
echo "   📊 Статус:           ./check-status.sh"
echo "   📝 Просмотр логов:   tail -f logs/*.log"
echo "   🛑 Остановка:        ./stop-all.sh"
echo ""
echo "🔥 Настройки брандмауэра:"
echo "   Убедитесь, что порты 3000 и 8000 открыты в брандмауэре macOS"
echo "   Системные настройки → Безопасность → Брандмауэр"
