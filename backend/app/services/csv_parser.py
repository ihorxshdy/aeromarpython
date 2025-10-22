import re
from typing import List
from ..utils.time_utils import norm_type, derive_from_std, is_dms, uid
from ..models.flight import Flight, FlightType

def parse_std_to_minutes(std: str) -> tuple[int, str]:
    """Парсит STD в минуты и дату
    
    Returns:
        tuple: (minutes_from_midnight, date_string)
    """
    std = str(std).replace('\u00a0', ' ').strip()
    
    # Формат DD.MM.YYYY HH:MM
    match1 = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})$', std)
    if match1:
        day, month, year, hour, minute = match1.groups()
        
        # Формируем дату в формате YYYY-MM-DD
        if len(year) == 2:
            year = f"20{year}"
        date_str = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        minutes = int(hour) * 60 + int(minute)
        return minutes, date_str
    
    # Формат HH:MM (без даты - используем сегодняшний день)
    match2 = re.match(r'^(\d{1,2}):(\d{2})$', std)
    if match2:
        from datetime import date
        today = date.today()
        date_str = today.strftime("%Y-%m-%d")
        
        minutes = int(match2.group(1)) * 60 + int(match2.group(2))
        return minutes, date_str
    
    # Если не удалось распарсить, возвращаем 0 и сегодняшнюю дату
    from datetime import date
    today = date.today()
    date_str = today.strftime("%Y-%m-%d")
    return 0, date_str

def parse_csv(text: str) -> List[Flight]:
    """Парсит CSV и возвращает список рейсов"""
    # Убираем BOM если он есть
    if text.startswith('\ufeff'):
        text = text[1:]
    
    # Нормализуем окончания строк
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return []
        return []
    
    # Заголовки - определяем разделитель автоматически
    first_line = lines[0]
    if ';' in first_line and first_line.count(';') > first_line.count(','):
        delimiter = ';'
    else:
        delimiter = ','
    
    header = [h.strip().upper() for h in first_line.split(delimiter)]
    print(f"DEBUG: Detected delimiter: '{delimiter}'")
    print(f"DEBUG: Headers found: {header}")
    print(f"DEBUG: Raw first line: '{lines[0]}'")
    print(f"DEBUG: Header after split and upper: {header}")
    
    def get_idx(key: str) -> int:
        # Сначала пробуем точное совпадение
        try:
            idx = header.index(key)
            print(f"DEBUG: Column '{key}' found at index {idx}")
            return idx
        except ValueError:
            pass
        
        # Пробуем альтернативные названия
        alternatives = {
            'FLIGHT': ['FLIGHT NO', 'FLIGHT_NO', 'FLIGHTNO'],
            'FROM': ['FROM', 'DEPARTURE', 'ORIGIN'],
            'TO': ['TO', 'ARRIVAL', 'DESTINATION', 'DEST'],
            'AC': ['ACTYPE', 'AIRCRAFT TYPE', 'AC'],
            'TYPE': ['FLIGHT TYPE', 'TYPE', 'FLIGHTTYPE'],
            'DATE': ['DATE'],
            'ROUTE': ['ROUTE'],
            'STD': ['STD', 'SCHEDULED TIME DEPARTURE', 'STDMIN'],
            'STA': ['STA', 'SCHEDULED TIME ARRIVAL']
        }
        
        if key in alternatives:
            for alt in alternatives[key]:
                try:
                    idx = header.index(alt)
                    print(f"DEBUG: Column '{key}' found as '{alt}' at index {idx}")
                    return idx
                except ValueError:
                    continue
        
        print(f"DEBUG: Column '{key}' NOT FOUND in headers")
        return -1
    
    i_flight = get_idx('FLIGHT')
    i_from = get_idx('FROM')
    i_to = get_idx('TO')
    i_route = get_idx('ROUTE')  # Для формата SVO-LED
    i_std = get_idx('STD')
    i_sta = get_idx('STA')
    i_type = get_idx('TYPE')  # Тип рейса (SMS/DMS)
    i_ac = get_idx('AC')      # Тип ВС (320, 777, 737 и т.д.)

    print(f"DEBUG: Column indices - flight:{i_flight}, from:{i_from}, to:{i_to}, route:{i_route}")
    print(f"DEBUG: Column indices - std:{i_std}, sta:{i_sta}, type:{i_type}, ac:{i_ac}")

    flights: List[Flight] = []

    for i in range(1, len(lines)):
        parts = lines[i].split(delimiter)
        
        def get_part(idx: int) -> str:
            return parts[idx].strip() if 0 <= idx < len(parts) else ''
            
        flight_no = get_part(i_flight)
        std_str = get_part(i_std)
        
        # Определяем FROM и TO
        if i_route >= 0:
            route = get_part(i_route)
            if '-' in route:
                from_airport, to_airport = route.split('-', 1)
                from_airport = from_airport.strip().upper()
                to_airport = to_airport.strip().upper()
            else:
                from_airport = to_airport = ''
        else:
            from_airport = get_part(i_from).upper()
            to_airport = get_part(i_to).upper()
        
        # ИСПРАВЛЕНО: Правильное чтение колонок из CSV:
        # TYPE содержит тип самолета (32A, 32B, 73H, SU9, 320, 77W и т.д.)
        # AC содержит бортовой номер (73763, 73714 и т.д.)
        aircraft_type = get_part(i_type) or '320'  # тип самолета из TYPE колонки
        tail_number = get_part(i_ac) or ''  # бортовой номер из AC колонки
        
        # Отладочный вывод для первых 5 рейсов
        if i <= 5:
            print(f"DEBUG: Row {i}, Flight {flight_no}")
            print(f"  TYPE column (aircraft type): '{aircraft_type}'")
            print(f"  AC column (tail number): '{tail_number}'")
            print(f"  STD string: '{std_str}'")
            print(f"  Parts: {parts}")
        
        if not flight_no or not std_str:
            if i <= 5:
                print(f"DEBUG: Skipping flight {flight_no} - missing flight_no ({not flight_no}) or std_str ({not std_str})")
            continue
        
        ac_type = norm_type(aircraft_type)
        
        # Проверяем формат STD - если это уже минуты, используем напрямую
        flight_date = None
        try:
            std_min = int(std_str)  # Пытаемся парсить как число (минуты)
        except ValueError:
            std_min, flight_date = parse_std_to_minutes(std_str)  # Парсим как время и дату
        
        if std_min == 0:
            if i <= 5:
                print(f"DEBUG: Skipping flight {flight_no} - std_min is 0, std_str was '{std_str}'")
            continue
        
        if i <= 5:
            print(f"DEBUG: Successfully parsed std_min = {std_min}, flight_date = {flight_date} from std_str = '{std_str}'")
        
        # Определяем тип рейса SMS/DMS на основе типа ВС
        flight_type = FlightType.DMS if is_dms(ac_type) else FlightType.SMS
        
        # Отладка для первых 5 рейсов
        if i <= 5:
            print(f"DEBUG: Flight {flight_no}, AC Type: {ac_type}, is_dms: {is_dms(ac_type)}, Final Flight Type: {flight_type}")
        
        # Вычисляем ТГ
        timing = derive_from_std(ac_type, std_min)
        
        # Создаем рейс
        flight = Flight(
            id=uid(),
            flightNo=flight_no,
            route=f"{from_airport}-{to_airport}",
            origin=from_airport if from_airport else None,
            dest=to_airport if to_airport else None,
            acType=ac_type,  # сохраняем исходный тип ВС (320, 777 и т.д.)
            type=flight_type,
            flightDate=flight_date,  # добавляем дату рейса
            stdMin=std_min,
            kitchenOut=timing['kitchenOut'],
            serviceStart=timing['serviceStart'],
            serviceEnd=timing['serviceEnd'],
            unloadEnd=timing['unloadEnd'],
            # Для визуализации используем только время обслуживания самолета
            loadStart=timing['serviceStart'],  # начало обслуживания
            loadEnd=timing['serviceEnd'],      # конец обслуживания
        )
        
        flights.append(flight)
    
    return flights
