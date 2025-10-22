import csv
import re
from typing import List
from ..models.driver import Driver, Autolift

def parse_drivers_csv(text: str) -> List[Driver]:
    """
    Парсит CSV с водителями в новом формате
    Ожидает только DRIVER_ID и FULL_NAME (без времен смен)
    """
    # Убираем BOM если он есть
    if text.startswith('\ufeff'):
        text = text[1:]
    
    # Нормализуем окончания строк
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return []
    
    # Пропускаем заголовок
    drivers = []
    for i in range(1, len(lines)):
        parts = lines[i].split(';')  # Изменяем разделитель на ;
        if len(parts) >= 2:
            driver_id = parts[0].strip()
            full_name = parts[1].strip()
            
            if driver_id and full_name:
                # Создаем водителя без времен смен (они будут назначены позже)
                drivers.append(Driver(
                    id=driver_id,
                    full_name=full_name,
                    shift_start=0,  # Временные значения по умолчанию
                    shift_end=480   # 8 часов в минутах
                ))
    
    return drivers

def parse_time_to_minutes(time_str: str) -> int:
    """Парсит время в формате HH:MM в минуты от 00:00"""
    time_str = time_str.strip()
    match = re.match(r'^(\d{1,2}):(\d{2})$', time_str)
    if match:
        hours = int(match.group(1))
        minutes = int(match.group(2))
        total_minutes = hours * 60 + minutes
        
        return total_minutes
    return 0
    
    return drivers

def parse_autolifts_csv(text: str) -> List[Autolift]:
    """Парсит CSV с автолифтами"""
    # Убираем BOM если он есть
    if text.startswith('\ufeff'):
        text = text[1:]
    
    # Нормализуем окончания строк
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return []
    
    # Пропускаем заголовок
    autolifts = []
    for i in range(1, len(lines)):
        number = lines[i].strip()
        if number:
            autolifts.append(Autolift(
                id=f"AL{number}",
                number=number
            ))
    
    return autolifts
