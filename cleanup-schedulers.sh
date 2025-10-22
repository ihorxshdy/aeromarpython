#!/bin/bash
echo "🗑️ Очистка старых планировщиков..."

PROJECT_DIR="/Users/igordvoretskii/Documents/aeromar-python"
SERVICES_DIR="$PROJECT_DIR/backend/app/services"

echo "📂 Перемещение старых файлов в backup директорию..."

# Создаем backup директорию
BACKUP_DIR="$SERVICES_DIR/backup_schedulers_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Перемещаем старые планировщики
if [ -f "$SERVICES_DIR/bracket_scheduler.py" ]; then
    echo "   📄 Перемещаем bracket_scheduler.py"
    mv "$SERVICES_DIR/bracket_scheduler.py" "$BACKUP_DIR/"
fi

if [ -f "$SERVICES_DIR/bracket_scheduler_multithreaded.py" ]; then
    echo "   📄 Перемещаем bracket_scheduler_multithreaded.py"
    mv "$SERVICES_DIR/bracket_scheduler_multithreaded.py" "$BACKUP_DIR/"
fi

if [ -f "$SERVICES_DIR/bracket_scheduler_optimized.py" ]; then
    echo "   📄 Перемещаем bracket_scheduler_optimized.py"
    mv "$SERVICES_DIR/bracket_scheduler_optimized.py" "$BACKUP_DIR/"
fi

# Переименовываем unified в основной
if [ -f "$SERVICES_DIR/bracket_scheduler_unified.py" ]; then
    echo "   🔄 Переименовываем unified в основной bracket_scheduler.py"
    mv "$SERVICES_DIR/bracket_scheduler_unified.py" "$SERVICES_DIR/bracket_scheduler.py"
fi

echo ""
echo "📊 Результат очистки:"
echo "   🗂️  Backup директория: $BACKUP_DIR"
echo "   📋 Файлы в backup:"
ls -la "$BACKUP_DIR/"

echo ""
echo "✅ Очистка завершена!"
echo "   📄 Основной планировщик: $SERVICES_DIR/bracket_scheduler.py"
echo "   🗂️  Старые версии сохранены в: $BACKUP_DIR"

echo ""
echo "🔧 Следующие шаги:"
echo "   1. Обновить импорт в routes.py: UnifiedBracketScheduler -> BracketScheduler"
echo "   2. Перезапустить backend для применения изменений"
echo "   3. Протестировать планирование"