#!/bin/bash
echo "🛑 Остановка всех сервисов Aeromar..."

PROJECT_DIR="/Users/igordvoretskii/Documents/aeromar-python"
LOGS_DIR="$PROJECT_DIR/logs"

# Функция для безопасного завершения процесса
kill_process_safely() {
    local pid=$1
    local name=$2
    local timeout=${3:-10}
    
    if [ -z "$pid" ] || [ "$pid" = "" ]; then
        return 1
    fi
    
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "   ⏭️  Процесс $name (PID $pid) уже не существует"
        return 1
    fi
    
    echo "   🔄 Завершение $name (PID $pid)..."
    
    # Попытка мягкого завершения
    if kill -TERM "$pid" 2>/dev/null; then
        echo "   ⏳ Ожидание завершения $name..."
        local count=0
        while [ $count -lt $timeout ] && kill -0 "$pid" 2>/dev/null; do
            sleep 1
            count=$((count + 1))
        done
        
        if kill -0 "$pid" 2>/dev/null; then
            echo "   ⚠️  $name не завершился мягко, принудительное завершение..."
            kill -KILL "$pid" 2>/dev/null
            sleep 2
            
            if kill -0 "$pid" 2>/dev/null; then
                echo "   ❌ Не удалось завершить $name (PID $pid)"
                return 1
            else
                echo "   ✅ $name принудительно завершен"
                return 0
            fi
        else
            echo "   ✅ $name мягко завершен"
            return 0
        fi
    else
        echo "   ❌ Не удалось отправить сигнал процессу $name (PID $pid)"
        return 1
    fi
}

# Функция для поиска процессов по командной строке
find_processes_by_pattern() {
    local pattern=$1
    local description=$2
    
    echo "🔍 Поиск процессов: $description..."
    
    # Используем более надежный способ поиска
    local pids=$(ps aux | grep -E "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ ! -z "$pids" ]; then
        echo "   Найдены процессы: $(echo $pids | tr '\n' ' ')"
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                local cmd=$(ps -p $pid -o command= 2>/dev/null | head -c 80)
                kill_process_safely "$pid" "$description[$cmd...]" 15
            fi
        done
        return 0
    else
        echo "   ℹ️  Процессы не найдены"
        return 1
    fi
}

echo "🔍 Завершение процессов по PID файлам..."
if [ -d "$LOGS_DIR" ]; then
    for pid_file in "$LOGS_DIR"/*.pid; do
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            service_name=$(basename "$pid_file" .pid)
            
            if kill_process_safely "$pid" "$service_name" 10; then
                echo "   �️  Удаление $pid_file"
                rm -f "$pid_file"
            fi
        fi
    done
else
    echo "   ℹ️  Директория логов не найдена"
fi

echo ""

# Поиск процессов по различным паттернам
find_processes_by_pattern "uvicorn.*main:app" "Uvicorn Backend"
find_processes_by_pattern "python.*main\.py" "Python Backend"
find_processes_by_pattern "python.*$PROJECT_DIR" "Python Project"
find_processes_by_pattern "node.*next" "Next.js Frontend"
find_processes_by_pattern "npm.*start" "NPM Start"
find_processes_by_pattern "yarn.*start" "Yarn Start"

echo ""
echo "🌐 Освобождение портов..."

# Массив портов для проверки
ports=(8000 3000 8080 5000)

for port in "${ports[@]}"; do
    port_pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$port_pids" ]; then
        echo "   🔍 Процессы на порту $port: $port_pids"
        for pid in $port_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                local cmd=$(ps -p $pid -o command= 2>/dev/null | head -c 50)
                kill_process_safely "$pid" "Port[$port:$cmd...]" 5
            fi
        done
    else
        echo "   ✅ Порт $port свободен"
    fi
done

echo ""
echo "🧹 Дополнительная очистка..."

# Поиск оставшихся процессов, которые могли быть пропущены
remaining_python=$(ps aux | grep -E "(python.*aeromar|uvicorn)" | grep -v grep | awk '{print $2}')
if [ ! -z "$remaining_python" ]; then
    echo "   🔍 Найдены оставшиеся Python процессы: $remaining_python"
    for pid in $remaining_python; do
        kill_process_safely "$pid" "Remaining Python" 5
    done
fi

remaining_node=$(ps aux | grep -E "(node.*3000|npm.*start|yarn.*start)" | grep -v grep | awk '{print $2}')
if [ ! -z "$remaining_node" ]; then
    echo "   🔍 Найдены оставшиеся Node.js процессы: $remaining_node"
    for pid in $remaining_node; do
        kill_process_safely "$pid" "Remaining Node.js" 5
    done
fi

echo ""
echo "🧹 Финальная проверка..."
sleep 3

# Финальная проверка портов
final_issues=0
for port in 8000 3000; do
    final_check=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$final_check" ]; then
        echo "   ❗ Порт $port все еще занят: $final_check"
        final_issues=1
    else
        echo "   ✅ Порт $port: свободен"
    fi
done

# Финальная проверка процессов
final_python=$(ps aux | grep -E "(python.*aeromar|uvicorn)" | grep -v grep | wc -l)
final_node=$(ps aux | grep -E "(node.*3000|npm.*start|yarn.*start)" | grep -v grep | wc -l)

if [ $final_python -gt 0 ]; then
    echo "   ⚠️  Обнаружены оставшиеся Python процессы: $final_python"
    final_issues=1
fi

if [ $final_node -gt 0 ]; then
    echo "   ⚠️  Обнаружены оставшиеся Node.js процессы: $final_node"
    final_issues=1
fi

echo ""
if [ $final_issues -eq 0 ]; then
    echo "✅ Все сервисы успешно остановлены!"
    echo "   🌐 Основные порты свободны"
    echo "   🐍 Python процессы завершены"
    echo "   📦 Node.js процессы завершены"
else
    echo "⚠️  Внимание: некоторые процессы могут еще работать"
    echo ""
    echo "🔧 Команды для принудительной очистки:"
    echo "   sudo lsof -ti:8000,3000 | xargs -r kill -9"
    echo "   sudo pkill -f 'python.*aeromar'"
    echo "   sudo pkill -f 'node.*3000'"
    echo ""
    echo "🔍 Для детальной проверки: ./check-status.sh"
fi

echo ""
echo "💡 Полезные команды:"
echo "   📊 Проверка статуса:  ./check-status.sh"
echo "   🚀 Запуск сервисов:   ./start-network.sh"
echo "   📝 Просмотр логов:    tail -f logs/*.log"

# Функция для безопасного завершения процесса
kill_process_safely() {
    local pid=$1
    local name=$2
    
    if kill -0 "$pid" 2>/dev/null; then
        echo "🔸 Остановка $name (PID: $pid)"
        kill "$pid" 2>/dev/null
        sleep 3
        
        # Если процесс все еще работает, принудительно убиваем
        if kill -0 "$pid" 2>/dev/null; then
            echo "   ⚠️  Принудительная остановка..."
            kill -9 "$pid" 2>/dev/null
            sleep 1
        fi
        
        # Проверяем результат
        if kill -0 "$pid" 2>/dev/null; then
            echo "   ❌ Не удалось остановить $name"
        else
            echo "   ✅ $name остановлен"
        fi
    fi
}

# 1. Остановка процессов по PID файлам
echo "📋 Остановка процессов по PID файлам..."
for pid_file in "$LOGS_DIR"/*.pid; do
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        name=$(basename "$pid_file" .pid)
        kill_process_safely "$pid" "$name"
        rm "$pid_file"
    fi
done

# Дополнительно проверяем порты и убиваем процессы если нужно
echo ""
echo "🔍 Проверка портов..."

# Порт 8000 (Backend)
backend_pid=$(lsof -ti:8000 2>/dev/null)
if [ ! -z "$backend_pid" ]; then
    echo "🔸 Найден процесс на порту 8000 (PID: $backend_pid), останавливаем..."
    kill_process_safely "$backend_pid" "Backend-8000"
fi

# Порт 3000 (Next.js)
nextjs_pid=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$nextjs_pid" ]; then
    echo "🔸 Найден процесс на порту 3000 (PID: $nextjs_pid), останавливаем..."
    kill_process_safely "$nextjs_pid" "NextJS-3000"
fi

# 3. Поиск и остановка всех Python процессов, связанных с проектом
echo ""
echo "🐍 Поиск Python процессов проекта..."

# Ищем Python процессы, которые запущены из директории проекта
python_pids=$(ps aux | grep python | grep "$PROJECT_DIR" | grep -v grep | awk '{print $2}')
if [ ! -z "$python_pids" ]; then
    echo "🔸 Найдены Python процессы проекта:"
    ps aux | grep python | grep "$PROJECT_DIR" | grep -v grep | awk '{print "   PID:", $2, "CMD:", $11, $12, $13}'
    
    for pid in $python_pids; do
        kill_process_safely "$pid" "Python-$pid"
    done
else
    echo "   ℹ️  Python процессы проекта не найдены"
fi

# 4. Поиск и остановка Node.js процессов
echo ""
echo "📦 Поиск Node.js процессов..."

# Ищем node процессы в директории проекта
node_pids=$(ps aux | grep node | grep -E "(next|npm|yarn)" | grep -v grep | awk '{print $2}')
if [ ! -z "$node_pids" ]; then
    echo "🔸 Найдены Node.js процессы:"
    ps aux | grep node | grep -E "(next|npm|yarn)" | grep -v grep | awk '{print "   PID:", $2, "CMD:", $11, $12, $13}'
    
    for pid in $node_pids; do
        kill_process_safely "$pid" "Node-$pid"
    done
else
    echo "   ℹ️  Node.js процессы не найдены"
fi

# 5. Дополнительная проверка uvicorn процессов
echo ""
echo "🚀 Поиск uvicorn процессов..."
uvicorn_pids=$(ps aux | grep uvicorn | grep -v grep | awk '{print $2}')
if [ ! -z "$uvicorn_pids" ]; then
    echo "🔸 Найдены uvicorn процессы:"
    ps aux | grep uvicorn | grep -v grep | awk '{print "   PID:", $2, "CMD:", $11, $12, $13}'
    
    for pid in $uvicorn_pids; do
        kill_process_safely "$pid" "Uvicorn-$pid"
    done
else
    echo "   ℹ️  Uvicorn процессы не найдены"
fi
echo ""
echo "� Финальная проверка портов..."

# Финальная проверка портов
ports_to_check="3000 8000"
for port in $ports_to_check; do
    remaining_pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$remaining_pid" ]; then
        echo "⚠️  На порту $port все еще работает процесс PID: $remaining_pid"
        echo "   Принудительно завершаем..."
        kill -9 "$remaining_pid" 2>/dev/null
    else
        echo "✅ Порт $port свободен"
    fi
done

echo ""
echo "✅ Все процессы остановлены"
echo "📁 Логи сохранены в: $LOGS_DIR"

# Показываем статистику процессов
echo ""
echo "📊 Текущие активные процессы (для проверки):"
echo "Python процессы:"
ps aux | grep python | grep -v grep | wc -l | xargs echo "   Всего:"
echo "Node процессы:"
ps aux | grep node | grep -v grep | wc -l | xargs echo "   Всего:"
echo "Порты 3000 и 8000:"
if lsof -ti:3000 2>/dev/null || lsof -ti:8000 2>/dev/null; then
    echo "   ⚠️  Некоторые порты все еще заняты"
    lsof -ti:3000,8000 2>/dev/null | while read pid; do
        echo "   PID $pid на порту $(lsof -p $pid 2>/dev/null | grep LISTEN | awk '{print $9}' | cut -d: -f2)"
    done
else
    echo "   ✅ Порты свободны"
fi
