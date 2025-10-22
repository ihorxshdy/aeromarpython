from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
import datetime

class FlightType(Enum):
    SMS = "SMS"
    DMS = "DMS"

class WindowType(Enum):
    LOADING = "loading"    # Окна погрузки 1-19
    UNLOADING = "unloading" # Окна разгрузки 20-23

class BracketStatus(Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ALERT = "alert"  # Превышение рабочей смены

class DMSRole(Enum):
    ECONOMY = "economy"
    BUSINESS = "business"

class FlightBracket(BaseModel):
    """Скобка рейсов - один наряд для водителя автолифта согласно п.1-3 требований"""
    id: str
    driver_id: str
    autolift_id: str
    flights: List[str]  # ID рейсов в скобке
    
    # Временные параметры (в минутах от 00:00)
    bracket_start: int  # Начало скобки (начало загрузки автолифта)
    bracket_end: int    # Окончание скобки (окончание разгрузки)
    
    # Технологические времена согласно п.3
    loading_start: int  # Начало загрузки (LDT start)
    loading_end: int    # Окончание загрузки (LDT end) 
    departure_time: int # Время выезда от окна погрузки
    
    # Окна согласно п.2
    loading_window: int  # Номер окна погрузки (1-19)
    unloading_window: int # Номер окна разгрузки (20-23)
    
    status: BracketStatus = BracketStatus.PLANNED
    is_overtime: bool = False  # Выходит за пределы 9-часовой смены
    
    # Метаинформация
    bracket_type: FlightType  # SMS или DMS
    total_duration: int  # Полная продолжительность скобки в минутах
    flight_count: int   # Количество рейсов в скобке
    
    # Для DMS рейсов
    dms_role: Optional[DMSRole] = None  # economy или business
    paired_bracket_id: Optional[str] = None  # ID парной скобки для DMS

# Константы технологического графика согласно п.3.1
class TechGraphConstants:
    # Времена до STD для начала загрузки (п.3.1.1)
    SMS_LOADING_START_BEFORE_STD = 155  # 02ч35мин до STD для SMS
    DMS_LOADING_START_BEFORE_STD = 180  # 03ч00мин до STD для DMS
    
    # Времена до STD для выезда (п.3.1.2)
    SMS_DEPARTURE_BEFORE_STD = 85   # 01ч25мин до STD для SMS
    DMS_DEPARTURE_BEFORE_STD = 110   # 01ч50мин до STD для DMS

    # Времена обслуживания (п.3.1.4)
    SMS_SERVICE_TIME = 19  # 19 минут для SMS
    DMS_SERVICE_TIME = 45  # 45 минут для DMS
    
    # Времена перемещения (п.3.1.3, 3.1.5, 3.1.7)
    TRAVEL_TO_FIRST_FLIGHT = 30  # RT1 - 00ч30мин доезд до первого рейса
    TRAVEL_BETWEEN_FLIGHTS = 20  # RT2 - 00ч20мин между рейсами в скобке
    RETURN_FOR_UNLOADING = 25    # URT - 00ч25мин возврат для разгрузки
    
    # Время разгрузки (п.3.1.8)
    UNLOADING_TIME = 15  # ULDT - время разгрузки грязного оборудования
    
    # Интервал между скобками (п.3.1.9)
    BRACKET_INTERVAL = 5  # 00ч05мин между скобками одного работника
    
    # Максимальный разрыв между рейсами в одной скобке (для компактности)
    MAX_GAP_BETWEEN_FLIGHTS = 30  # 30 минут максимум между рейсами в скобке

# СМС типы воздушных судов (реальные коды из выгрузки)
SMS_TYPES = [
    "320", "321", "737", "319",  # Стандартные коды
    "32A", "32B", "32N", "32Q",  # A320 семейство
    "73H", "739",                # B737 семейство  
    "SU9"                        # Суперджет
]

# DMS типы для эконом-класса (реальные коды из выгрузки)
DMS_ECONOMY_TYPES = [
    "777", "350", "330", "787",  # Стандартные коды
    "77W", "77R", "773",         # B777 семейство
    "744",                       # B747
    "333",                       # A330
    "359",
    "332",                       # A333-200
]

# SMS комбинации рейсов (согласно требованиям пользователя)
SMS_COMBINATIONS = [
    
    # Тройные комбинации SMS (основные комбинации)
    {"737": 1, "320": 1, "321": 1},  # 737+320+321
    {"737": 1, "321": 2},            # 737+321×2
    {"320": 2, "321": 1},            # 320×2+321
    {"737": 2, "320": 1},            # 737×2+320
    {"321": 2, "737": 1},            # 321×2+737
    
    # Комбинации с реальными кодами
    {"32A": 1, "321": 1, "737": 1},   # A320neo + A321 + B737
    {"32B": 1, "321": 1, "737": 1},   # A320neo + A321 + B737
    {"73H": 1, "320": 1, "321": 1},   # B737-800 + A320 + A321
    {"739": 1, "320": 1, "321": 1},   # B737-900 + A320 + A321

    # Многорейсовые SU9 комбинации 
    {"SU9": 5},                       # SU9×5 - специальная комбинация                  # SU9×4 - если 5 не помещается в смену
]

# DMS комбинации для БИЗНЕС-класса (DMS+SMS комбинации 1+1)
DMS_BUSINESS_COMBINATIONS = [
    # Комбинации DMS + SMS для бизнес-класса (1+1)
    {"777": 1, "320": 1},   # B777 + A320
    {"777": 1, "321": 1},   # B777 + A321  
    {"777": 1, "737": 1},   # B777 + B737
    {"777": 1, "SU9": 1},   # B777 + SU9
    
    {"350": 1, "320": 1},   # A350 + A320
    {"350": 1, "321": 1},   # A350 + A321
    {"350": 1, "737": 1},   # A350 + B737
    {"350": 1, "SU9": 1},   # A350 + SU9
    
    {"333": 1, "320": 1},   # A330 + A320
    {"333": 1, "321": 1},   # A330 + A321
    {"333": 1, "737": 1},   # A330 + B737
    {"333": 1, "SU9": 1},   # A330 + SU9
    
    {"744": 1, "320": 1},   # B747 + A320
    {"744": 1, "321": 1},   # B747 + A321
    {"744": 1, "737": 1},   # B747 + B737
    {"744": 1, "SU9": 1},   # B747 + SU9

    {"332": 1, "320": 1},   # B332 + A320
    {"332": 1, "321": 1},   # B332 + A321
    {"332": 1, "737": 1},   # B332 + B737
    {"332": 1, "SU9": 1},   # B332 + SU9

    # Реальные коды B777 + SMS
    {"77W": 1, "320": 1},
    {"77W": 1, "321": 1},
    {"77W": 1, "737": 1},
    {"77W": 1, "SU9": 1},
    {"77W": 1, "32A": 1},   # B777 + A320neo
    {"77W": 1, "32B": 1},
    {"77W": 1, "32N": 1},
    {"77W": 1, "32Q": 1},
    {"77W": 1, "73H": 1},   # B777 + B737-800
    {"77W": 1, "739": 1},   # B777 + B737-900
    
    {"77R": 1, "320": 1},
    {"77R": 1, "321": 1},
    {"77R": 1, "737": 1},
    {"77R": 1, "SU9": 1},
    {"77R": 1, "32A": 1},
    {"77R": 1, "32B": 1},
    {"77R": 1, "32N": 1},
    {"77R": 1, "32Q": 1},
    {"77R": 1, "73H": 1},
    {"77R": 1, "739": 1},
    
    {"773": 1, "320": 1},
    {"773": 1, "321": 1},
    {"773": 1, "737": 1},
    {"773": 1, "SU9": 1},
    {"773": 1, "32A": 1},
    {"773": 1, "32B": 1},
    {"773": 1, "32N": 1},
    {"773": 1, "32Q": 1},
    {"773": 1, "73H": 1},
    {"773": 1, "739": 1},
    
    # Реальные коды A350 + SMS
    {"359": 1, "320": 1},
    {"359": 1, "321": 1},
    {"359": 1, "737": 1},
    {"359": 1, "SU9": 1},
    {"359": 1, "32A": 1},
    {"359": 1, "32B": 1},
    {"359": 1, "32N": 1},
    {"359": 1, "32Q": 1},
    {"359": 1, "73H": 1},
    {"359": 1, "739": 1},

        # Реальные коды A350 + SMS
    {"332": 1, "320": 1},
    {"332": 1, "321": 1},
    {"332": 1, "737": 1},
    {"332": 1, "SU9": 1},
    {"332": 1, "32A": 1},
    {"332": 1, "32B": 1},
    {"332": 1, "32N": 1},
    {"332": 1, "32Q": 1},
    {"332": 1, "73H": 1},
    {"332": 1, "739": 1},
]

# DMS комбинации для ЭКОНОМ-класса (только одиночные рейсы)
DMS_ECONOMY_COMBINATIONS = [
    {"777": 1},   # Одиночный B777
    {"350": 1},   # Одиночный A350
    {"333": 1},   # Одиночный A330
    {"744": 1},   # Одиночный B747
    {"77W": 1},   # Одиночный B777-300ER
    {"77R": 1},   # Одиночный B777-200ER
    {"773": 1},   # Одиночный B777-300
    {"359": 1},   # Одиночный A350-900
    {"332": 1},   # Одиночный A332-200
]

def is_sms_type(aircraft_type: str) -> bool:
    """Проверка является ли тип воздушного судна SMS"""
    return aircraft_type.upper() in SMS_TYPES

def is_dms_type(aircraft_type: str) -> bool:
    """Проверка является ли тип воздушного судна DMS"""
    return aircraft_type.upper() in DMS_ECONOMY_TYPES

def get_service_time(flight_type: FlightType) -> int:
    """Получить время обслуживания согласно п.3.1.5, 3.1.6"""
    if flight_type == FlightType.SMS:
        return TechGraphConstants.SMS_SERVICE_TIME
    else:
        return TechGraphConstants.DMS_SERVICE_TIME

def calculate_bracket_duration(flights: List[str], flight_type: FlightType) -> int:
    """
    Расчет продолжительности скобки согласно п.3.1
    
    Формула:
    - Время загрузки: 3 часа до STD первого рейса
    - Обслуживание: 19 мин на рейс + переезды между рейсами
    - Возврат и разгрузка: 30 мин + 15 мин
    """
    flight_count = len(flights)
    
    # Базовое время загрузки (п.3.1.1, 3.1.2)
    loading_time = TechGraphConstants.SMS_LOADING_START_BEFORE_STD
    
    # Время обслуживания всех рейсов (п.3.1.5, 3.1.6)
    service_time = get_service_time(flight_type) * flight_count
    
    # Переезды между рейсами (п.3.1.8)
    travel_time = TechGraphConstants.TRAVEL_BETWEEN_FLIGHTS * (flight_count - 1) if flight_count > 1 else 0
    
    # Возврат и разгрузка (п.3.1.9, 3.1.10)
    return_and_unload = TechGraphConstants.RETURN_FOR_UNLOADING + TechGraphConstants.UNLOADING_TIME
    
    return loading_time + service_time + travel_time + return_and_unload

def validate_sms_combination(aircraft_types: List[str]) -> bool:
    """
    Проверка валидности SMS комбинации
    """
    if len(aircraft_types) == 1:
        return is_sms_type(aircraft_types[0])
    
    # Создаем словарь из списка типов ВС
    aircraft_count = {}
    for ac_type in aircraft_types:
        ac_type_upper = ac_type.upper()
        if ac_type_upper in aircraft_count:
            aircraft_count[ac_type_upper] += 1
        else:
            aircraft_count[ac_type_upper] = 1
    
    # Проверяем против списка допустимых комбинаций
    return aircraft_count in SMS_COMBINATIONS

def validate_dms_combination(aircraft_types: List[str], role: DMSRole) -> bool:
    """
    Проверка валидности DMS комбинации
    """
    if role == DMSRole.ECONOMY:
        # Для эконом-класса: только один рейс DMS типа
        return len(aircraft_types) == 1 and is_dms_type(aircraft_types[0])
    elif role == DMSRole.BUSINESS:
        # Создаем словарь из списка типов ВС
        aircraft_count = {}
        for ac_type in aircraft_types:
            ac_type_upper = ac_type.upper()
            if ac_type_upper in aircraft_count:
                aircraft_count[ac_type_upper] += 1
            else:
                aircraft_count[ac_type_upper] = 1
        
        # Проверяем против DMS бизнес комбинаций
        return aircraft_count in DMS_BUSINESS_COMBINATIONS
    return False

def validate_dms_business_combination(aircraft_types: List[str]) -> bool:
    """
    Валидация DMS+SMS комбинации для бизнес-класса
    Согласно требованиям: возможна комбинация из ДМС+СМС (1+1)
    """
    # Создаем словарь из списка типов ВС
    aircraft_count = {}
    for ac_type in aircraft_types:
        ac_type_upper = ac_type.upper()
        if ac_type_upper in aircraft_count:
            aircraft_count[ac_type_upper] += 1
        else:
            aircraft_count[ac_type_upper] = 1
    
    # Проверяем против DMS+SMS комбинаций
    return aircraft_count in DMS_BUSINESS_COMBINATIONS

def validate_dms_economy_combination(aircraft_types: List[str]) -> bool:
    """
    Валидация DMS комбинации для эконом-класса
    Согласно требованиям: только одиночные ДМС рейсы для эконом-класса
    """
    # Должен быть только один рейс
    if len(aircraft_types) != 1:
        return False
    
    # Проверяем, что это DMS тип
    aircraft_type = aircraft_types[0].upper()
    return aircraft_type in [t.upper() for t in DMS_ECONOMY_TYPES]

class AutoliftLoadingRules:
    """
    Класс для управления правилами загрузки автолифтов согласно требованиям пользователя
    Согласно требованиям: все автолифты равны по объему и могут грузить любые комбинации
    """
    
    @staticmethod
    def get_dms_business_combinations() -> List[Dict[str, int]]:
        """Возвращает все DMS комбинации для бизнес-класса"""
        return DMS_BUSINESS_COMBINATIONS
    
    @staticmethod
    def get_dms_economy_combinations() -> List[Dict[str, int]]:
        """Возвращает все DMS комбинации для эконом-класса"""
        return DMS_ECONOMY_COMBINATIONS
    
    @staticmethod
    def get_sms_combinations() -> List[Dict[str, int]]:
        """Возвращает все SMS комбинации"""
        return SMS_COMBINATIONS
    
    @staticmethod
    def get_dms_economy_types() -> List[str]:
        """Возвращает все DMS типы для эконом-класса"""
        return DMS_ECONOMY_TYPES
    
    @staticmethod
    def can_load_combination(autolift_id: str, aircraft_types: List[str]) -> bool:
        """
        Проверяет, может ли автолифт загрузить данную комбинацию рейсов
        
        Согласно требованиям: все автолифты равны по объему и могут грузить предложенные комбинации.
        Планирование не должно зависеть от номера автолифта.
        """
        # Проверяем, есть ли DMS типы в комбинации
        has_dms = any(is_dms_type(ac_type) for ac_type in aircraft_types)
        has_sms = any(is_sms_type(ac_type) for ac_type in aircraft_types)
        
        # Одиночные DMS эконом рейсы
        if len(aircraft_types) == 1 and has_dms:
            return validate_dms_economy_combination(aircraft_types)
            
        # DMS+SMS комбинации для бизнес-класса
        if has_dms and has_sms:
            return validate_dms_business_combination(aircraft_types)
        
        # Чистые SMS комбинации
        if has_sms and not has_dms:
            return validate_sms_combination(aircraft_types)
        
        return False

def find_loading_window(bracket_start_time: int, used_windows: Dict[int, List[Tuple[int, int]]]) -> Optional[int]:
    """
    Поиск свободного окна погрузки согласно п.2.1
    
    Args:
        bracket_start_time: Время начала скобки в минутах от 00:00
        used_windows: Словарь занятых окон {window_id: [(start, end), ...]}
    
    Returns:
        Номер свободного окна (1-19) или None
    """
    for window in range(1, 20):  # Окна погрузки 1-19
        if window not in used_windows:
            used_windows[window] = []
        
        # Проверяем пересечения с существующими назначениями
        bracket_end_time = bracket_start_time + 240  # Примерная длительность скобки
        
        conflicts = False
        for start, end in used_windows[window]:
            if not (bracket_end_time <= start or bracket_start_time >= end):
                conflicts = True
                break
        
        if not conflicts:
            return window
    
    return None

def find_unloading_window(bracket_end_time: int, used_windows: Dict[int, List[Tuple[int, int]]]) -> Optional[int]:
    """
    Поиск свободного окна разгрузки согласно п.2.2
    
    Args:
        bracket_end_time: Время окончания скобки в минутах от 00:00
        used_windows: Словарь занятых окон {window_id: [(start, end), ...]}
    
    Returns:
        Номер свободного окна (20-23) или None
    """
    for window in range(20, 24):  # Окна разгрузки 20-23
        if window not in used_windows:
            used_windows[window] = []
        
        # Проверяем пересечения с существующими назначениями
        unload_start = bracket_end_time - TechGraphConstants.UNLOADING_TIME
        unload_end = bracket_end_time
        
        conflicts = False
        for start, end in used_windows[window]:
            if not (unload_end <= start or unload_start >= end):
                conflicts = True
                break
        
        if not conflicts:
            return window
    
    return None
