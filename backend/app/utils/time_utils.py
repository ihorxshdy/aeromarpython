import re
from typing import Dict
from .constants import DAY_START, DAY_END, DMS_TYPES, SMS_TYPES, RULE

def uid() -> str:
    """Генерирует уникальный ID"""
    import random
    import string
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))

def clamp(v: float, a: float, b: float) -> float:
    """Ограничивает значение между a и b"""
    return max(a, min(b, v))

def clamp_day(m: int) -> int:
    """Ограничивает минуты в пределах рабочего дня (-6 до +30 часов)"""
    # Используем корректный диапазон времени из констант
    return int(clamp(m, DAY_START, DAY_END))

def to_hhmm(m: int) -> str:
    """Конвертирует минуты в формат HH:MM"""
    m = round(((m % (24*60)) + 24*60) % (24*60))
    h = str(m // 60).zfill(2)
    mm = str(m % 60).zfill(2)
    return f"{h}:{mm}"

def to_min(hhmm: str) -> int:
    """Конвертирует HH:MM в минуты"""
    match = re.match(r'(\d{1,2}):(\d{2})', hhmm)
    if not match:
        return 0
    return int(match.group(1)) * 60 + int(match.group(2))

def is_dms(ac_type: str) -> bool:
    """Проверяет, является ли тип ВС DMS"""
    return ac_type.upper() in DMS_TYPES

def is_sms(ac_type: str) -> bool:
    """Проверяет, является ли тип ВС SMS"""
    return ac_type.upper() in SMS_TYPES

def norm_type(ac_type: str) -> str:
    """Нормализует тип ВС"""
    return ac_type.upper().strip()

def derive_from_std(ac_type: str, std: int) -> Dict[str, int]:
    """Вычисляет времена согласно ТГ из STD"""
    d = is_dms(ac_type)
    
    # Отъезд от ВС за 1 час до STD (60 минут)
    departure_from_aircraft = std - 60
    
    # Окончание обслуживания = отъезд от ВС
    s_end = departure_from_aircraft
    
    # Начало обслуживания = окончание - время обслуживания
    s_start = s_end - (RULE.SERVICE_DMS if d else RULE.SERVICE_SMS)
    
    # Выезд из окна = начало обслуживания - время на дорогу
    k_out = s_start - (RULE.LOAD_DMS if d else RULE.LOAD_SMS)
    
    # Возврат в окно = отъезд от ВС + время на дорогу
    unload_end = departure_from_aircraft + (RULE.LOAD_DMS if d else RULE.LOAD_SMS)
    
    return {
        'kitchenOut': clamp_day(k_out),
        'serviceStart': clamp_day(s_start),
        'serviceEnd': clamp_day(s_end), 
        'unloadEnd': clamp_day(unload_end),
    }
