#!/bin/bash

# Функция для получения локального IP-адреса
get_local_ip() {
    # Пробуем несколько способов получить IP
    local ip=""
    
    # Способ 1: ifconfig (для macOS/Linux)
    ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    
    # Способ 2: если первый не сработал, пробуем другой формат
    if [ -z "$ip" ]; then
        ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | sed 's/.*inet \([0-9.]*\).*/\1/')
    fi
    
    # Способ 3: через маршрутизацию (если ifconfig не работает)
    if [ -z "$ip" ]; then
        ip=$(route get default | grep interface | awk '{print $2}' | xargs ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    fi
    
    # Способ 4: через системную утилиту (для macOS)
    if [ -z "$ip" ]; then
        ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
    fi
    
    echo "$ip"
}

# Функция для проверки валидности IP
is_valid_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Получаем IP
LOCAL_IP=$(get_local_ip)

if [ -z "$LOCAL_IP" ] || ! is_valid_ip "$LOCAL_IP"; then
    echo "❌ Не удалось определить локальный IP-адрес автоматически"
    echo "🔧 Попробуйте вручную:"
    echo "   ifconfig | grep 'inet '"
    echo "   или настройте вручную в коде"
    exit 1
fi

echo "📡 Обнаружен локальный IP: $LOCAL_IP"
export LOCAL_IP
