from pydantic import BaseModel
from typing import List, Dict, Optional, ClassVar
from enum import Enum
from .flight import Flight, FlightType

class AutoliftType(str, Enum):
    SMS = "SMS"
    DMS_BUSINESS = "DMS_BUSINESS"
    DMS_ECONOMY = "DMS_ECONOMY"

class WindowType(str, Enum):
    LOADING = "LOADING"    # окна 1-19
    UNLOADING = "UNLOADING"  # окна 20-23

class AutoliftConfiguration(BaseModel):
    """Конфигурация автолифта"""
    id: str
    type: AutoliftType
    aircraft_types: List[str]  # типы ВС в автолифте
    window_number: Optional[int] = None  # номер окна для погрузки/разгрузки
    
class AutoliftLoadingRules(BaseModel):
    """Правила загрузки автолифта"""
    
    @staticmethod
    def get_sms_combinations() -> List[Dict[str, int]]:
        """Возвращает допустимые комбинации для СМС флота"""
        return [
            {'SU9': 5},  # SU9×5
            {'SU9': 1, '321': 1, '320': 1},  # SU9+321+320
            {'320': 3},  # 320×3
            {'320': 2, '321': 1},  # 320×2+321
            {'320': 1, '321': 2},  # 320+321×2
            {'321': 3},  # 321×3
            {'737': 3},  # 737×3
            {'737': 1, '320': 2},  # 737+320×2
            {'737': 1, '320': 1, '321': 1},  # 737+320+321
            {'737': 1, '321': 2},  # 737+321×2
        ]
    
    @staticmethod
    def get_dms_business_combinations() -> List[Dict[str, int]]:
        """Возвращает допустимые комбинации для ДМС бизнес-класса (1 автолифт)"""
        return [
            # 777 комбинации
            {'777': 1, '320': 1},
            {'777': 1, '321': 1},
            {'777': 1, '737': 1},
            {'777': 1, 'SU9': 1},
            # 350 комбинации
            {'350': 1, 'SU9': 1},
            {'350': 1, '320': 1},
            {'350': 1, '321': 1},
            {'350': 1, '737': 1},
            # 333 комбинации
            {'333': 1, 'SU9': 1},
            {'333': 1, '320': 1},
            {'333': 1, '321': 1},
            {'333': 1, '737': 1},
        ]
    
    @staticmethod
    def get_dms_economy_types() -> List[str]:
        """Возвращает типы ВС для ДМС эконом-класса (2 автолифт)"""
        return ['777', '333', '350']
    
    @staticmethod
    def validate_sms_combination(aircraft_counts: Dict[str, int]) -> bool:
        """Проверяет, является ли комбинация допустимой для СМС"""
        sms_combinations = AutoliftLoadingRules.get_sms_combinations()
        return aircraft_counts in sms_combinations
    
    @staticmethod
    def validate_dms_business_combination(aircraft_counts: Dict[str, int]) -> bool:
        """Проверяет, является ли комбинация допустимой для ДМС бизнес-класса"""
        dms_combinations = AutoliftLoadingRules.get_dms_business_combinations()
        return aircraft_counts in dms_combinations
    
    @staticmethod
    def validate_dms_economy_combination(aircraft_types: List[str]) -> bool:
        """Проверяет, является ли комбинация допустимой для ДМС эконом-класса"""
        if len(aircraft_types) != 1:
            return False
        economy_types = AutoliftLoadingRules.get_dms_economy_types()
        return aircraft_types[0] in economy_types

class AutoliftTiming(BaseModel):
    """Тайминги операций автолифта"""
    
    # Время начала загрузки автолифта (в минутах до STD)
    SMS_LOAD_START_BEFORE_STD: ClassVar[int] = 180  # за 3ч00мин
    DMS_LOAD_START_BEFORE_STD: ClassVar[int] = 240  # за 4ч00мин
    
    # Время выезда от окна (в минутах до STD)
    WINDOW_TO_DEPARTURE_WITH_DMS: ClassVar[int] = 140  # 2ч20мин если ДМС рейс присутствует
    WINDOW_TO_DEPARTURE_WITHOUT_DMS: ClassVar[int] = 85  # 1ч25мин если ДМС рейс отсутствует
    
    # Время обслуживания на ВС
    SERVICE_START_AFTER_DEPARTURE: ClassVar[int] = 15  # начало через 15 минут после выезда
    SMS_SERVICE_DURATION: ClassVar[int] = 19  # окончание через 19 минут для СМС
    DMS_SERVICE_DURATION: ClassVar[int] = 45  # окончание через 45 минут для ДМС
    
    # Отъезд от ВС
    DEPARTURE_BEFORE_STD: ClassVar[int] = 60  # должен быть за 1 час до времени отправления ВС
    
    # Переезд между ВС
    TRAVEL_TIME_BETWEEN_AIRCRAFT: ClassVar[int] = 20  # 20 минут
    
    # Возврат в окно
    RETURN_TO_WINDOW_TIME: ClassVar[int] = 15  # 15 минут
    
    @staticmethod
    def calculate_loading_start_time(flight: Flight) -> int:
        """Рассчитывает время начала загрузки автолифта"""
        if flight.type == FlightType.SMS:
            return flight.stdMin - AutoliftTiming.SMS_LOAD_START_BEFORE_STD
        else:  # DMS
            return flight.stdMin - AutoliftTiming.DMS_LOAD_START_BEFORE_STD
    
    @staticmethod
    def calculate_departure_time(flight: Flight, has_dms: bool) -> int:
        """Рассчитывает время выезда от окна"""
        if has_dms:
            return flight.stdMin - AutoliftTiming.WINDOW_TO_DEPARTURE_WITH_DMS
        else:
            return flight.stdMin - AutoliftTiming.WINDOW_TO_DEPARTURE_WITHOUT_DMS
    
    @staticmethod
    def calculate_service_times(departure_time: int, flight: Flight) -> tuple[int, int]:
        """Рассчитывает время начала и окончания обслуживания"""
        service_start = departure_time + AutoliftTiming.SERVICE_START_AFTER_DEPARTURE
        
        if flight.type == FlightType.SMS:
            service_end = service_start + AutoliftTiming.SMS_SERVICE_DURATION
        else:  # DMS
            service_end = service_start + AutoliftTiming.DMS_SERVICE_DURATION
            
        return service_start, service_end

class WindowManager(BaseModel):
    """Менеджер окон для погрузки/разгрузки"""
    
    @staticmethod
    def get_loading_windows() -> List[int]:
        """Возвращает номера окон для погрузки (1-19)"""
        return list(range(1, 20))
    
    @staticmethod
    def get_unloading_windows() -> List[int]:
        """Возвращает номера окон для разгрузки (20-23)"""
        return list(range(20, 24))
    
    @staticmethod
    def get_window_type(window_number: int) -> WindowType:
        """Определяет тип окна по его номеру"""
        if 1 <= window_number <= 19:
            return WindowType.LOADING
        elif 20 <= window_number <= 23:
            return WindowType.UNLOADING
        else:
            raise ValueError(f"Недопустимый номер окна: {window_number}")
    
    @staticmethod
    def get_adjacent_windows(window_number: int) -> List[int]:
        """Возвращает соседние окна для ДМС операций"""
        if window_number < 1 or window_number > 23:
            raise ValueError(f"Недопустимый номер окна: {window_number}")
        
        adjacent: List[int] = []
        if window_number > 1:
            adjacent.append(window_number - 1)
        if window_number < 23:
            adjacent.append(window_number + 1)
        
        return adjacent
    
    @staticmethod
    def validate_dms_windows(window1: int, window2: int) -> bool:
        """Проверяет, что окна соседние для ДМС операций"""
        return abs(window1 - window2) == 1
