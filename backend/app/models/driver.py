from pydantic import BaseModel
from typing import Optional, List

class Driver(BaseModel):
    id: str
    full_name: str
    shift_start: int  # minutes from 00:00
    shift_end: int    # minutes from 00:00
    assigned_autolift: Optional[str] = None

class Autolift(BaseModel):
    id: str
    number: str
    assigned_driver: Optional[str] = None
    
def make_autolifts() -> List[Autolift]:
    """Создает список автолифтов из CSV"""
    autolifts = []
    numbers = [
        "133", "135", "136", "139", "140", "141", "149", "150", "151", "152", 
        "155", "156", "157", "158", "161", "162", "163", "164", "165", "166", 
        "169", "170", "173", "174", "176", "177", "184", "185", "186", "192", 
        "193", "194", "202", "203", "204", "205", "207", "210", "211", "212", 
        "213", "214", "215", "216", "217", "218", "219", "220", "221", "222", 
        "223", "224", "225", "226", "227", "228", "229", "230", "231", "232"
    ]
    
    for number in numbers:
        autolifts.append(Autolift(
            id=f"AL{number}",
            number=number
        ))
    
    return autolifts

def make_drivers() -> List[Driver]:
    """Создает список водителей из CSV файла"""
    try:
        # Пытаемся загрузить водителей из CSV файла
        from ..services.drivers_csv_parser import parse_drivers_csv
        import os
        
        csv_path = "/Users/igordvoretskii/Documents/aeromar-python/drivers.csv"
        if os.path.exists(csv_path):
            # Пробуем разные кодировки
            for encoding in ['utf-8-sig', 'utf-8', 'cp1251', 'windows-1251', 'iso-8859-1']:
                try:
                    with open(csv_path, 'r', encoding=encoding) as f:
                        csv_content = f.read()
                    drivers = parse_drivers_csv(csv_content)
                    if drivers:
                        print(f"✅ Загружено {len(drivers)} водителей из CSV (кодировка: {encoding})")
                        return drivers
                except UnicodeDecodeError:
                    continue
                except Exception as e:
                    print(f"❌ Ошибка при загрузке с кодировкой {encoding}: {e}")
                    continue
        
        print("⚠️ CSV файл с водителями не найден или не удалось прочитать, используем тестовые данные")
    except Exception as e:
        print(f"❌ Ошибка при загрузке водителей из CSV: {e}")
    
    # Fallback к тестовым данным (но с новой структурой - без времен смен)
    test_drivers = [
        ("DRV001", "Иванов Сергей Александрович"),
        ("DRV002", "Петров Алексей Дмитриевич"),
        ("DRV003", "Сидоров Михаил Владимирович"),
        ("DRV004", "Козлов Андрей Петрович"),
        ("DRV005", "Новиков Владимир Сергеевич"),
        ("DRV006", "Морозов Дмитрий Александрович"),
        ("DRV007", "Волков Павел Михайлович"),
        ("DRV008", "Соловьев Николай Владимирович"),
        ("DRV009", "Васильев Игорь Дмитриевич"),
        ("DRV010", "Зайцев Максим Сергеевич"),
        ("DRV011", "Павлов Артем Александрович"),
        ("DRV012", "Семенов Роман Петрович"),
    ]
    
    return [
        Driver(
            id=driver_id,
            full_name=full_name,
            shift_start=0,    # Без времен смен
            shift_end=480     # 8 часов по умолчанию
        )
        for driver_id, full_name in test_drivers
    ]

def time_to_minutes(time_str: str) -> int:
    """Конвертирует время HH:MM в минуты от 00:00"""
    hours, minutes = map(int, time_str.split(':'))
    total_minutes = hours * 60 + minutes
    # Обработка переходов через полночь
    if total_minutes < 4 * 60:  # До 4:00 считаем следующим днем
        total_minutes += 24 * 60
    return total_minutes
