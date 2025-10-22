from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import csv

class Machine(BaseModel):
    id: str
    name: str
    driver: str
    shiftStart: int
    shiftEnd: int
    flex: Optional[bool] = False
    canDoDMS: Optional[bool] = False  # Может ли машина обслуживать DMS рейсы

def time_to_minutes(time_str: str) -> int:
    """Конвертирует время HH:MM в минуты от начала дня"""
    try:
        hours, minutes = map(int, time_str.split(':'))
        return hours * 60 + minutes
    except:
        return 0

def make_machines() -> List[Machine]:
    """Создает список машин на основе CSV файлов водителей и автолифтов"""
    machines: List[Machine] = []
    
    # Пути к CSV файлам
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    drivers_csv = os.path.join(base_dir, 'drivers.csv')
    autolifts_csv = os.path.join(base_dir, 'autolifts.csv')
    
    # Загружаем данные водителей
    drivers_data = {}
    if os.path.exists(drivers_csv):
        try:
            with open(drivers_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    drivers_data[row['DRIVER_ID']] = {
                        'name': row['FULL_NAME'],
                        'shift_start': time_to_minutes(row['SHIFT_START']),
                        'shift_end': time_to_minutes(row['SHIFT_END'])
                    }
        except Exception as e:
            print(f"Ошибка чтения drivers.csv: {e}")
    
    # Загружаем данные автолифтов
    autolift_numbers: List[str] = []
    if os.path.exists(autolifts_csv):
        try:
            with open(autolifts_csv, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader)  # Пропускаем заголовок
                for row in reader:
                    if row:  # Если строка не пустая
                        autolift_numbers.append(str(row[0]).strip())
        except Exception as e:
            print(f"Ошибка чтения autolifts.csv: {e}")
    
    # Создаем машины, сопоставляя водителей и автолифты
    driver_ids = list(drivers_data.keys())
    
    for i, autolift_num in enumerate(autolift_numbers):
        if i < len(driver_ids):
            driver_id = driver_ids[i]
            driver_info = drivers_data[driver_id]
            
            machine = Machine(
                id=f"M{autolift_num}",
                name=f"№ {autolift_num}",
                driver=str(driver_info['name']),
                shiftStart=int(driver_info['shift_start']),
                shiftEnd=int(driver_info['shift_end']),
                flex=False,
                canDoDMS=(int(autolift_num) % 5 == 0)  # Каждая 5-я машина может DMS
            )
            machines.append(machine)
        else:
            # Если водителей меньше чем автолифтов, создаем машину без водителя
            machine = Machine(
                id=f"M{autolift_num}",
                name=f"№ {autolift_num}",
                driver="Не назначен",
                shiftStart=0,
                shiftEnd=0,
                flex=False,
                canDoDMS=(int(autolift_num) % 5 == 0)  # Каждая 5-я машина может DMS
            )
            machines.append(machine)
    
    return machines
