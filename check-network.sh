#!/bin/bash
echo "🔍 Проверка сетевых настроек Aeromar"
echo ""

# Получаем IP
source ./get-ip.sh

if [ -z "$LOCAL_IP" ]; then
    echo "❌ IP-адрес не определен"
    exit 1
fi

echo "📡 Текущий IP-адрес: $LOCAL_IP"
echo ""

# Проверяем статус служб
echo "📊 Статус служб:"
backend_pid=$(cat logs/backend.pid 2>/dev/null)
react_pid=$(cat logs/react.pid 2>/dev/null)

if [ ! -z "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    echo "   ✅ Backend API запущен (PID: $backend_pid)"
    echo "      🌐 http://localhost:8000"
    echo "      🌍 http://$LOCAL_IP:8000"
else
    echo "   ❌ Backend API не запущен"
fi

if [ ! -z "$react_pid" ] && kill -0 "$react_pid" 2>/dev/null; then
    echo "   ✅ React App запущен (PID: $react_pid)"
    echo "      🌐 http://localhost:3000"
    echo "      🌍 http://$LOCAL_IP:3000"
else
    echo "   ❌ React App не запущен"
fi

echo ""
echo "🌐 Полные URL для доступа из сети:"
echo "   Frontend: http://$LOCAL_IP:3000"
echo "   Backend:  http://$LOCAL_IP:8000"
echo "   API Docs: http://$LOCAL_IP:8000/docs"

echo ""
echo "🔧 Проверка портов:"
if lsof -i :8000 >/dev/null 2>&1; then
    echo "   ✅ Порт 8000 (Backend) открыт"
else
    echo "   ❌ Порт 8000 (Backend) закрыт"
fi

if lsof -i :3000 >/dev/null 2>&1; then
    echo "   ✅ Порт 3000 (Frontend) открыт"
else
    echo "   ❌ Порт 3000 (Frontend) закрыт"
fi

echo ""
echo "💡 Если IP изменился, просто перезапустите:"
echo "   ./stop-all.sh && ./start-network.sh"
