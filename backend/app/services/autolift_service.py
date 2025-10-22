from typing import List, Dict, Optional, Set, Any
from ..models.flight import Flight, FlightType
from ..models.autolift import (
    AutoliftConfiguration, 
    AutoliftLoadingRules, 
    AutoliftTiming, 
    WindowManager,
    AutoliftType,
    WindowType
)
from ..utils.constants import LOADING_WINDOWS, UNLOADING_WINDOWS

class AutoliftService:
    """Сервис для управления автолифтами и планирования операций"""
    
    def __init__(self):
        self.configurations: List[AutoliftConfiguration] = []
        self.window_assignments: Dict[int, str] = {}  # window_number -> autolift_id
    
    def create_autolift_configuration(
        self, 
        flights: List[Flight], 
        autolift_id: str
    ) -> Optional[AutoliftConfiguration]:
        """Создает конфигурацию автолифта на основе рейсов"""
        
        if not flights:
            return None
        
        # Собираем типы ВС
        aircraft_types = [self._normalize_aircraft_type(f.acType) for f in flights]
        aircraft_counts: Dict[str, int] = {}
        for ac_type in aircraft_types:
            aircraft_counts[ac_type] = aircraft_counts.get(ac_type, 0) + 1
        
        # Определяем тип автолифта
        autolift_type = self._determine_autolift_type(flights, aircraft_counts)
        
        if not autolift_type:
            return None
        
        return AutoliftConfiguration(
            id=autolift_id,
            type=autolift_type,
            aircraft_types=aircraft_types
        )
    
    def _normalize_aircraft_type(self, ac_type: str) -> str:
        """Нормализует тип ВС для стандартных обозначений"""
        t = ac_type.upper()
        if t == 'SU9':
            return 'SU9'
        if t == '321':
            return '321'
        if t in ['73H', '739']:
            return '737'
        if t.startswith('32'):  # 320, 32A, 32B, 32N, 32Q
            return '320'
        if t in ['77W', '77R', '773']:
            return '777'
        if t == '359':
            return '350'
        return t
    
    def _determine_autolift_type(
        self, 
        flights: List[Flight], 
        aircraft_counts: Dict[str, int]
    ) -> Optional[AutoliftType]:
        """Определяет тип автолифта на основе рейсов"""
        
        # Проверяем, есть ли DMS рейсы
        has_dms = any(f.type == FlightType.DMS for f in flights)
        has_sms = any(f.type == FlightType.SMS for f in flights)
        
        if has_sms and not has_dms:
            # Только SMS рейсы
            if AutoliftLoadingRules.validate_sms_combination(aircraft_counts):
                return AutoliftType.SMS
        
        elif has_dms and not has_sms:
            # Только DMS рейсы
            if len(aircraft_counts) == 1:
                # Одиночный тип ВС - проверяем эконом
                aircraft_type = list(aircraft_counts.keys())[0]
                if AutoliftLoadingRules.validate_dms_economy_combination([aircraft_type]):
                    return AutoliftType.DMS_ECONOMY
            elif len(aircraft_counts) == 2:
                # Два типа ВС - проверяем бизнес
                if AutoliftLoadingRules.validate_dms_business_combination(aircraft_counts):
                    return AutoliftType.DMS_BUSINESS
        
        elif has_dms and has_sms:
            # Смешанные рейсы - проверяем как DMS бизнес
            if AutoliftLoadingRules.validate_dms_business_combination(aircraft_counts):
                return AutoliftType.DMS_BUSINESS
        
        return None
    
    def assign_window(self, autolift_id: str, window_number: int) -> bool:
        """Назначает окно автолифту"""
        
        # Проверяем, что окно свободно
        if window_number in self.window_assignments:
            return False
        
        # Проверяем, что окно в допустимом диапазоне
        if window_number not in LOADING_WINDOWS and window_number not in UNLOADING_WINDOWS:
            return False
        
        self.window_assignments[window_number] = autolift_id
        
        # Обновляем конфигурацию автолифта
        for config in self.configurations:
            if config.id == autolift_id:
                config.window_number = window_number
                break
        
        return True
    
    def assign_adjacent_windows_for_dms(self, autolift_id: str, primary_window: int) -> bool:
        """Назначает два соседних окна для DMS операций"""
        
        adjacent_windows = WindowManager.get_adjacent_windows(primary_window)
        
        # Находим свободное соседнее окно
        available_adjacent = None
        for adj_window in adjacent_windows:
            if adj_window not in self.window_assignments:
                available_adjacent = adj_window
                break
        
        if available_adjacent is None:
            return False
        
        # Назначаем оба окна
        self.window_assignments[primary_window] = autolift_id
        self.window_assignments[available_adjacent] = f"{autolift_id}_secondary"
        
        return True
    
    def calculate_operation_timeline(self, flights: List[Flight]) -> Dict[str, Any]:
        """Рассчитывает временную линию операций автолифта"""
        
        if not flights:
            return {}
        
        timeline: Dict[str, Any] = {
            'flights': [],
            'loading_start': None,
            'total_duration': 0
        }
        
        # Определяем, есть ли DMS рейсы
        has_dms = any(f.type == FlightType.DMS for f in flights)
        
        # Сортируем рейсы по времени STD
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        
        for i, flight in enumerate(sorted_flights):
            flight_timeline = {}
            
            # Время начала загрузки автолифта
            loading_start = AutoliftTiming.calculate_loading_start_time(flight)
            if timeline['loading_start'] is None or loading_start < timeline['loading_start']:
                timeline['loading_start'] = loading_start
            
            # Время выезда от окна
            departure_time = AutoliftTiming.calculate_departure_time(flight, has_dms)
            
            # Время обслуживания
            service_start, service_end = AutoliftTiming.calculate_service_times(departure_time, flight)
            
            # Время возврата в окно
            return_time = service_end + AutoliftTiming.RETURN_TO_WINDOW_TIME
            
            flight_timeline = {
                'flight_id': flight.id,
                'loading_start': loading_start,
                'departure_time': departure_time,
                'service_start': service_start,
                'service_end': service_end,
                'return_time': return_time,
                'std': flight.stdMin
            }
            
            # Добавляем время переезда, если это не последний рейс
            if i < len(sorted_flights) - 1:
                flight_timeline['travel_to_next'] = AutoliftTiming.TRAVEL_TIME_BETWEEN_AIRCRAFT
            
            timeline['flights'].append(flight_timeline)
        
        # Рассчитываем общую продолжительность
        if timeline['flights']:
            last_flight = timeline['flights'][-1]
            timeline['total_duration'] = last_flight['return_time'] - timeline['loading_start']
        
        return timeline
    
    def validate_autolift_schedule(self, flights: List[Flight]) -> Dict[str, Any]:
        """Проверяет корректность расписания автолифта"""
        
        validation_result: Dict[str, Any] = {
            'is_valid': True,
            'errors': [],
            'warnings': []
        }
        
        if not flights:
            validation_result['errors'].append("Нет рейсов для проверки")
            validation_result['is_valid'] = False
            return validation_result
        
        # Проверяем совместимость типов ВС
        aircraft_types = [self._normalize_aircraft_type(f.acType) for f in flights]
        aircraft_counts: Dict[str, int] = {}
        for ac_type in aircraft_types:
            aircraft_counts[ac_type] = aircraft_counts.get(ac_type, 0) + 1
        
        autolift_type = self._determine_autolift_type(flights, aircraft_counts)
        if not autolift_type:
            validation_result['errors'].append("Недопустимая комбинация типов ВС")
            validation_result['is_valid'] = False
        
        # Проверяем временные ограничения
        timeline = self.calculate_operation_timeline(flights)
        
        for i, flight_timeline in enumerate(timeline.get('flights', [])):
            flight = flights[i]
            
            # Проверяем, что отъезд от ВС происходит за час до STD
            departure_from_aircraft = flight_timeline['service_end']
            time_before_std = flight.stdMin - departure_from_aircraft
            
            if time_before_std < AutoliftTiming.DEPARTURE_BEFORE_STD:
                validation_result['errors'].append(
                    f"Рейс {flight.flightNo}: недостаточно времени до STD ({time_before_std} мин)"
                )
                validation_result['is_valid'] = False
        
        # Проверяем пересечения во времени обслуживания
        flight_timelines = timeline.get('flights', [])
        for i in range(len(flight_timelines)):
            for j in range(i + 1, len(flight_timelines)):
                flight1 = flight_timelines[i]
                flight2 = flight_timelines[j]
                
                # Проверяем пересечение времени обслуживания с учетом переезда
                if not (flight1['service_end'] + AutoliftTiming.TRAVEL_TIME_BETWEEN_AIRCRAFT <= flight2['service_start'] or
                        flight2['service_end'] + AutoliftTiming.TRAVEL_TIME_BETWEEN_AIRCRAFT <= flight1['service_start']):
                    validation_result['warnings'].append(
                        f"Возможное пересечение времени обслуживания рейсов {flights[i].flightNo} и {flights[j].flightNo}"
                    )
        
        return validation_result
    
    def get_available_windows(self, window_type: WindowType) -> List[int]:
        """Возвращает список доступных окон указанного типа"""
        
        if window_type == WindowType.LOADING:
            all_windows = LOADING_WINDOWS
        else:
            all_windows = UNLOADING_WINDOWS
        
        return [w for w in all_windows if w not in self.window_assignments]
    
    def get_window_utilization(self) -> Dict[str, Any]:
        """Возвращает информацию об использовании окон"""
        
        total_loading = len(LOADING_WINDOWS)
        total_unloading = len(UNLOADING_WINDOWS)
        
        used_loading = sum(1 for w in self.window_assignments.keys() if w in LOADING_WINDOWS)
        used_unloading = sum(1 for w in self.window_assignments.keys() if w in UNLOADING_WINDOWS)
        
        return {
            'loading_windows': {
                'total': total_loading,
                'used': used_loading,
                'available': total_loading - used_loading,
                'utilization_percent': (used_loading / total_loading) * 100 if total_loading > 0 else 0
            },
            'unloading_windows': {
                'total': total_unloading,
                'used': used_unloading,
                'available': total_unloading - used_unloading,
                'utilization_percent': (used_unloading / total_unloading) * 100 if total_unloading > 0 else 0
            }
        }
