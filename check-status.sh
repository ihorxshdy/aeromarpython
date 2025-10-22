#!/bin/bash
echo "🔍 Проверка статуса системы Aeromar..."

PROJECT_DIR="/Users/igordvoretskii/Documents/aeromar-python"
LOGS_DIR="$PROJECT_DIR/logs"

echo "📊 Статус портов:"
echo "=================="

# Проверка порта 8000 (Backend)
backend_pid=$(lsof -ti:8000 2>/dev/null)
if [ ! -z "$backend_pid" ]; then
    backend_cmd=$(ps -p $backend_pid -o comm= 2>/dev/null)
    echo "✅ Порт 8000 (Backend): ЗАНЯТ - PID $backend_pid ($backend_cmd)"
    echo "   URL: http://localhost:8000"
else
    echo "❌ Порт 8000 (Backend): СВОБОДЕН"
fi

# Проверка порта 3000 (Frontend)
frontend_pid=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$frontend_pid" ]; then
    frontend_cmd=$(ps -p $frontend_pid -o comm= 2>/dev/null)
    echo "✅ Порт 3000 (Frontend): ЗАНЯТ - PID $frontend_pid ($frontend_cmd)"
    echo "   URL: http://localhost:3000"
else
    echo "❌ Порт 3000 (Frontend): СВОБОДЕН"
fi

echo ""
echo "📋 PID файлы:"
echo "=============="
if [ -d "$LOGS_DIR" ]; then
    for pid_file in "$LOGS_DIR"/*.pid; do
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            name=$(basename "$pid_file" .pid)
            
            if kill -0 "$pid" 2>/dev/null; then
                cmd=$(ps -p $pid -o comm= 2>/dev/null)
                echo "✅ $name: PID $pid ($cmd) - АКТИВЕН"
            else
                echo "❌ $name: PID $pid - НЕАКТИВЕН (файл устарел)"
            fi
        fi
    done
    
    if [ ! -f "$LOGS_DIR"/*.pid ]; then
        echo "ℹ️  PID файлы не найдены"
    fi
else
    echo "ℹ️  Директория логов не существует"
fi

echo ""
echo "🐍 Python процессы проекта:"
echo "============================"
python_count=$(ps aux | grep python | grep "$PROJECT_DIR" | grep -v grep | wc -l)
if [ $python_count -gt 0 ]; then
    echo "Найдено процессов: $python_count"
    ps aux | grep python | grep "$PROJECT_DIR" | grep -v grep | while read line; do
        pid=$(echo $line | awk '{print $2}')
        cmd=$(echo $line | awk '{print $11, $12, $13}')
        echo "   PID $pid: $cmd"
    done
else
    echo "ℹ️  Python процессы проекта не найдены"
fi

echo ""
echo "📦 Node.js процессы:"
echo "===================="
node_count=$(ps aux | grep -E "(node|npm|yarn)" | grep -v grep | wc -l)
if [ $node_count -gt 0 ]; then
    echo "Найдено процессов: $node_count"
    ps aux | grep -E "(node|npm|yarn)" | grep -v grep | while read line; do
        pid=$(echo $line | awk '{print $2}')
        cmd=$(echo $line | awk '{print $11, $12, $13}')
        echo "   PID $pid: $cmd"
    done
else
    echo "ℹ️  Node.js процессы не найдены"
fi

echo ""
echo "🚀 Uvicorn процессы:"
echo "===================="
uvicorn_count=$(ps aux | grep uvicorn | grep -v grep | wc -l)
if [ $uvicorn_count -gt 0 ]; then
    echo "Найдено процессов: $uvicorn_count"
    ps aux | grep uvicorn | grep -v grep | while read line; do
        pid=$(echo $line | awk '{print $2}')
        cmd=$(echo $line | awk '{print $11, $12, $13}')
        echo "   PID $pid: $cmd"
    done
else
    echo "ℹ️  Uvicorn процессы не найдены"
fi

echo ""
echo "📝 Логи:"
echo "========"
if [ -d "$LOGS_DIR" ]; then
    for log_file in "$LOGS_DIR"/*.log; do
        if [ -f "$log_file" ]; then
            name=$(basename "$log_file" .log)
            size=$(ls -lh "$log_file" | awk '{print $5}')
            modified=$(ls -l "$log_file" | awk '{print $6, $7, $8}')
            echo "📄 $name.log: $size (изменен: $modified)"
        fi
    done
    
    # Проверяем, есть ли лог-файлы
    log_count=$(find "$LOGS_DIR" -name "*.log" -type f 2>/dev/null | wc -l)
    if [ $log_count -eq 0 ]; then
        echo "ℹ️  Лог файлы не найдены"
    fi
else
    echo "ℹ️  Директория логов не существует"
fi

echo ""
echo "🌐 Тест подключения:"
echo "===================="

# Тест Backend API
if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "✅ Backend API (localhost:8000): ДОСТУПЕН"
else
    echo "❌ Backend API (localhost:8000): НЕДОСТУПЕН"
fi

# Тест Frontend
if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "✅ Frontend (localhost:3000): ДОСТУПЕН"
else
    echo "❌ Frontend (localhost:3000): НЕДОСТУПЕН"
fi

echo ""
echo "💡 Команды управления:"
echo "======================"
echo "   🚀 Запуск:     ./start-network.sh"
echo "   🛑 Остановка:  ./stop-all.sh"
echo "   📝 Логи:       tail -f logs/*.log"
echo "   🔄 Рестарт:    ./stop-all.sh && sleep 3 && ./start-network.sh"