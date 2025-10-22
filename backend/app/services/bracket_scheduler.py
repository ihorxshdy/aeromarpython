"""
Новый планировщик скобок с полной реализацией логики из документации
"""
from typing import List, Dict, Optional, Set, Any, Tuple
from ..models.flight import Flight, FlightType
from ..models.machine import Machine
from ..models.bracket import SMS_COMBINATIONS, DMS_BUSINESS_COMBINATIONS
from ..utils.time_utils import uid
from ..utils.constants import RULE
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class BracketScheduler:
    """
    Планировщик скобок с полной бизнес-логикой.
    Следует 4-стран         if len(brackets) < 2:
            self.logger.info("❌ Недостаточно скобок для объединения")
            return assignments, brackets
            
        self.logger.info(f"🔗 Анализируем {len(brackets)} скобок для объединения")
        
        # Показываем все доступные скобки
        for i, bracket in enumerate(brackets):
            driver_name = bracket.get('driver', {}).get('name', 'НЕТ')
            self.logger.info(f"   Скобка {i+1}: {bracket['startTime']//60:02d}:{bracket['startTime']%60:02d}-{bracket['endTime']//60:02d}:{bracket['endTime']%60:02d}, водитель: {driver_name}")   self.logger.info(f"🔗 Анализируем {len(brackets)} скобок для объединения")
        
        # Сортируем скобки по времени начала
        sorted_brackets = sorted(brackets, key=lambda b: b["startTime"])
        used_bracket_ids = set()ецификации с временными расчетами от STD,
    ограничениями по длительности и специфическими комбинациями.
    """
    
    def __init__(self, flights: List[Flight], machines: List[Machine], drivers: Optional[List[Any]] = None):
        self.flights = flights
        self.machines = machines
        self.drivers_list = drivers or []
        self.logger = logger

    def _fits_driver_shift(self, bracket_flights: List[Flight], driver: Dict) -> bool:
        """
        Временно отключаем проверку смен водителей,
        так как смены теперь назначаются после создания брекетов
        """
        return True  # Всегда возвращаем True, так как смены будут назначены позже

    def _find_best_driver_for_bracket(self, bracket_flights: List[Flight], available_drivers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Находит лучшего доступного водителя для брекета.
        Поскольку смены назначаются после планирования, выбираем первого доступного.
        """
        if not available_drivers or not bracket_flights:
            return None
        
        # Возвращаем первого доступного водителя
        return available_drivers[0] if available_drivers else None
        
    def plan_brackets(self) -> Dict[str, Any]:
        """Основной метод планирования скобок с оптимизацией"""
        flights = self.flights
        
        if not flights:
            return {"assignments": [], "brackets": [], "unassigned": []}
        
        self.logger.info(f"🎯 Начинаем оптимизированное планирование для {len(flights)} рейсов")
        
        # Результаты планирования
        assignments = []
        brackets = []
        unassigned_flights = []
        assigned_flight_ids = set()
        
        # Сортируем рейсы по STD
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        
        # Группируем по типу самолета для комбинаций
        available_flights = {f.flightNo: f for f in sorted_flights}
        
        # Получаем водителей
        drivers = self._get_available_drivers()
        driver_index = 0
        
        self.logger.info(f"📊 Доступно водителей: {len(drivers)}")
        
        # Анализируем типы рейсов
        su9_count = len([f for f in sorted_flights if f.acType == "SU9"])
        sms_count = len([f for f in sorted_flights if hasattr(f, 'type') and f.type.value == "SMS"])
        dms_count = len([f for f in sorted_flights if hasattr(f, 'type') and f.type.value == "DMS"])
        self.logger.info(f"📈 Рейсы по типам: SU9={su9_count}, SMS={sms_count}, DMS={dms_count}")
        
        # Пробуем создать скобки согласно комбинациям
        # 1. SU9 x 5 комбинации с оптимизацией по времени
        su9_flights = [f for f in sorted_flights if f.acType == "SU9"]
        
        # Ищем оптимальные группы из 5 SU9 рейсов
        used_su9_indices = set()
        while len([i for i in range(len(su9_flights)) if i not in used_su9_indices]) >= 5 and driver_index < len(drivers):
            available_su9 = [su9_flights[i] for i in range(len(su9_flights)) if i not in used_su9_indices]
            
            if len(available_su9) >= 5:
                best_combination = None
                best_quality_score = float('inf')  # Теперь ищем лучшее качество
                best_indices = None
                
                # Ищем наиболее качественную группу из 5 рейсов
                from itertools import combinations
                for combo_indices in combinations(range(len(available_su9)), 5):
                    candidate_flights = [available_su9[i] for i in combo_indices]
                    
                    if self._check_flight_intervals(candidate_flights):
                        quality_score = self._calculate_bracket_quality(candidate_flights)
                        
                        if quality_score < best_quality_score:
                            best_quality_score = quality_score
                            best_combination = candidate_flights
                            # Получаем настоящие индексы в оригинальном массиве
                            real_indices = []
                            for flight in candidate_flights:
                                for orig_i, orig_flight in enumerate(su9_flights):
                                    if orig_flight.flightNo == flight.flightNo and orig_i not in used_su9_indices:
                                        real_indices.append(orig_i)
                                        break
                            best_indices = real_indices
                
                if best_combination and best_indices:
                    # Используем следующего доступного водителя
                    if driver_index < len(drivers):
                        best_driver = drivers[driver_index]
                        bracket = self._create_bracket_with_driver(best_combination, best_driver)
                        if bracket:
                            brackets.append(bracket)
                            for flight in best_combination:
                                assigned_flight_ids.add(flight.flightNo)
                                assignments.append({
                                    "flightNo": flight.flightNo,
                                    "driverId": best_driver["id"],
                                    "bracketId": bracket["id"],
                                    "serviceStart": flight.serviceStart,
                                    "serviceEnd": flight.serviceEnd
                                })
                            used_su9_indices.update(best_indices)
                            driver_index += 1
                        else:
                            break
                    else:
                        break
                else:
                    break
            else:
                break
        
        # 2. SMS 3-рейсовые комбинации
        sms_flights = [f for f in sorted_flights if f.flightNo not in assigned_flight_ids and f.type.value == "SMS"]
        driver_index = self._create_sms_combinations(sms_flights, drivers, driver_index, assignments, brackets, assigned_flight_ids)
        
        # 3. DMS+SMS бизнес комбинации
        remaining_flights = [f for f in sorted_flights if f.flightNo not in assigned_flight_ids]
        driver_index = self._create_dms_business_combinations(remaining_flights, drivers, driver_index, assignments, brackets, assigned_flight_ids)
        
        # 4. НОВАЯ ЛОГИКА: Объединяем существующие скобки для водителей
        if len(brackets) > 1:  # Есть смысл объединять только если больше одной скобки
            self.logger.info(f"� Пытаемся объединить скобки для водителей: {len(brackets)} скобок доступно")
            assignments, brackets = self._combine_brackets_for_drivers(assignments, brackets, drivers)
        
        # Остальные рейсы остаются неназначенными
        for flight in sorted_flights:
            if flight.flightNo not in assigned_flight_ids:
                unassigned_flights.append({
                    "flightNo": flight.flightNo,
                    "acType": flight.acType,
                    "std": f"{flight.stdMin // 60:02d}:{flight.stdMin % 60:02d}",
                    "flightType": flight.type.value
                })
        
        return {
            "assignments": assignments,
            "brackets": brackets,
            "unassigned": unassigned_flights
        }
    
    def _calculate_shift_start_time(self, bracket_start_time: int) -> int:
        """
        Рассчитывает время начала смены водителя.
        Смена должна начинаться ранее начала скобки, но с ближайшего начала часа.
        
        Args:
            bracket_start_time: Время начала скобки в минутах от 00:00
            
        Returns:
            Время начала смены в минутах от 00:00 (может быть отрицательным для предыдущих суток)
        """
        from ..utils.constants import DAY_START
        
        # Переводим время скобки в часы и минуты
        bracket_hours = bracket_start_time // 60
        bracket_minutes = bracket_start_time % 60
        
        # Если есть минуты, то берем предыдущий час
        if bracket_minutes > 0:
            shift_start_hour = bracket_hours
        else:
            # Если время ровное (например, 08:00), берем на час раньше
            shift_start_hour = bracket_hours - 1
        
        # Вместо обрезки до 0, ограничиваем минимальным временем DAY_START
        shift_start_minutes = shift_start_hour * 60
        if shift_start_minutes < DAY_START:
            shift_start_minutes = DAY_START
            
        return shift_start_minutes

    def _get_available_drivers(self) -> List[Dict[str, Any]]:
        """Получает список доступных водителей"""
        if self.drivers_list:
            # Используем реальных водителей из системы
            return [
                {
                    "id": driver.id,
                    "name": driver.full_name,
                    "available": True,
                    "shift_start": None,  # Будет рассчитано при назначении
                    "shift_end": None
                }
                for driver in self.drivers_list
            ]
        else:
            # Создаем фиктивных водителей для тестирования (фолбэк)
            return [
                {
                    "id": f"driver_{i+1}", 
                    "name": f"Водитель {i+1}", 
                    "available": True,
                    "shift_start": None,
                    "shift_end": None
                }
                for i in range(20)  # 20 водителей
            ]
    
    def _create_bracket_with_driver(self, flights: List[Flight], driver: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Создает скобку с назначенным водителем с правильными границами"""
        if not flights:
            return None
        
        from ..utils.constants import RULE
        
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        
        # Определяем правильные границы скобки
        first_flight = sorted_flights[0]
        last_flight = sorted_flights[-1]
        
        # Начало скобки: за LOAD_SMS/LOAD_DMS минут до STD первого рейса
        # Проверяем тип первого рейса для определения времени начала погрузки
        if first_flight.type == "DMS":
            bracket_start = first_flight.stdMin - RULE.LOAD_DMS  # 180 минут (3ч00мин) до STD для ШФ
            flight_type = "DMS"
        else:  # SMS рейсы
            bracket_start = first_flight.stdMin - RULE.LOAD_SMS  # 155 минут (2ч35мин) до STD для УФ
            flight_type = "SMS"
        
        # Конец скобки: через RETURN_UNLOAD после окончания обслуживания последнего рейса
        bracket_end = last_flight.serviceEnd + RULE.RETURN_UNLOAD  # +20 минут
        
        # Рассчитываем время начала смены водителя
        shift_start = self._calculate_shift_start_time(bracket_start)
        
        # Обновляем информацию о водителе
        driver_copy = driver.copy()
        driver_copy["shift_start"] = shift_start
        driver_copy["shift_end"] = bracket_end + 60  # Смена заканчивается через час после скобки
        
        bracket = {
            "id": uid(),
            "driverId": driver_copy["id"],
            "driver": driver_copy,
            "flights": [f.flightNo for f in sorted_flights],
            "startTime": bracket_start,  # Время начала погрузки автолифта
            "endTime": bracket_end,      # Время окончания скобки
            "shiftStart": shift_start,   # Время начала смены водителя
            "shiftEnd": driver_copy["shift_end"],  # Время окончания смены
            "flightCount": len(flights),
            "bracketType": f"{len(flights)}-flight bracket",
            "firstFlightType": flight_type  # Используем определенный выше тип
        }
        
        return bracket
    
    def _create_sms_combinations(self, sms_flights: List[Flight], drivers: List[Dict[str, Any]], 
                               driver_index: int, assignments: List[Dict[str, Any]], 
                               brackets: List[Dict[str, Any]], assigned_flight_ids: set) -> int:
        """Создает оптимальные SMS комбинации, ищя соседние рейсы по времени"""
        
        # Создаем копию для работы
        remaining_sms = [f for f in sms_flights if f.flightNo not in assigned_flight_ids]
        
        while len(remaining_sms) >= 3 and driver_index < len(drivers):
            best_combination = None
            best_quality_score = float('inf')  # Теперь ищем минимальное качество (лучшее)
            best_indices = None
            
            # Ищем наиболее качественную комбинацию из 3 рейсов
            for i in range(len(remaining_sms)):
                for j in range(i + 1, len(remaining_sms)):
                    for k in range(j + 1, len(remaining_sms)):
                        candidate_flights = [remaining_sms[i], remaining_sms[j], remaining_sms[k]]
                        
                        if self._check_flight_intervals(candidate_flights):
                            # Вычисляем качество комбинации
                            quality_score = self._calculate_bracket_quality(candidate_flights)
                            
                            # Выбираем наиболее качественную (минимальный quality_score)
                            if quality_score < best_quality_score:
                                best_quality_score = quality_score
                                best_combination = candidate_flights
                                best_indices = [i, j, k]
            
            if best_combination:
                # Используем следующего доступного водителя
                if driver_index < len(drivers):
                    best_driver = drivers[driver_index]
                    bracket = self._create_bracket_with_driver(best_combination, best_driver)
                    if bracket:
                        brackets.append(bracket)
                        for flight in best_combination:
                            assigned_flight_ids.add(flight.flightNo)
                            assignments.append({
                                "flightNo": flight.flightNo,
                                "driverId": best_driver["id"],
                                "bracketId": bracket["id"],
                                "serviceStart": flight.serviceStart,
                                "serviceEnd": flight.serviceEnd
                            })
                        
                        # Убираем использованные рейсы (в обратном порядке индексов)
                        if best_indices:
                            for idx in sorted(best_indices, reverse=True):
                                remaining_sms.pop(idx)
                        
                        driver_index += 1
                    
                    self.logger.info(f"✅ Создана оптимальная SMS скобка с качеством {best_quality_score:.2f}")
                else:
                    break
            else:
                # Если не нашли подходящих комбинаций, выходим
                break
        
        return driver_index
    
    def _create_dms_business_combinations(self, remaining_flights: List[Flight], drivers: List[Dict[str, Any]],
                                        driver_index: int, assignments: List[Dict[str, Any]],
                                        brackets: List[Dict[str, Any]], assigned_flight_ids: Set[str]) -> int:
        """Создает оптимальные DMS+SMS бизнес комбинации, ищя наиболее близкие по времени пары"""
        
        # Фильтруем доступные рейсы
        dms_flights = [f for f in remaining_flights 
                      if hasattr(f, 'type') and f.type.value == "DMS" 
                      and f.flightNo not in assigned_flight_ids]
        sms_flights = [f for f in remaining_flights 
                      if hasattr(f, 'type') and f.type.value == "SMS" 
                      and f.flightNo not in assigned_flight_ids]
        
        # Ищем оптимальные пары DMS+SMS
        used_dms = set()
        used_sms = set()
        
        while dms_flights and sms_flights and driver_index < len(drivers):
            best_pair = None
            best_time_gap = float('inf')
            
            # Ищем пару с минимальным временным разрывом
            for dms_flight in dms_flights:
                if dms_flight.flightNo in used_dms:
                    continue
                    
                for sms_flight in sms_flights:
                    if sms_flight.flightNo in used_sms:
                        continue
                        
                    # Вычисляем временной разрыв между рейсами
                    time_gap = abs(dms_flight.stdMin - sms_flight.stdMin)
                    
                    bracket_flights = [dms_flight, sms_flight]
                    if self._check_flight_intervals(bracket_flights) and time_gap < best_time_gap:
                        best_time_gap = time_gap
                        best_pair = (dms_flight, sms_flight)
            
            if best_pair:
                dms_flight, sms_flight = best_pair
                bracket_flights = [dms_flight, sms_flight]
                
                # Используем следующего доступного водителя
                if driver_index < len(drivers):
                    best_driver = drivers[driver_index]
                    bracket = self._create_bracket_with_driver(bracket_flights, best_driver)
                    if bracket:
                        brackets.append(bracket)
                        for flight in bracket_flights:
                            assigned_flight_ids.add(flight.flightNo)
                            assignments.append({
                                "flightNo": flight.flightNo,
                                "driverId": best_driver["id"],
                                "bracketId": bracket["id"],
                                "serviceStart": flight.serviceStart,
                                "serviceEnd": flight.serviceEnd
                            })
                        
                        used_dms.add(dms_flight.flightNo)
                        used_sms.add(sms_flight.flightNo)
                        driver_index += 1
                        
                        self.logger.info(f"✅ Создана оптимальная DMS+SMS скобка с временным разрывом {best_time_gap} минут")
                    else:
                        break
                else:
                    break
            else:
                # Если не нашли подходящих пар, выходим
                break
            
            # Обновляем списки доступных рейсов
            dms_flights = [f for f in dms_flights if f.flightNo not in used_dms]
            sms_flights = [f for f in sms_flights if f.flightNo not in used_sms]
        
        return driver_index

    def _create_mock_autolifts(self) -> List[Dict[str, Any]]:
        """Создает фиктивные автолифты для тестирования"""
        return [
            {
                "id": "AL001",
                "type": "DMS",
                "capacity": 5,
                "available": True
            },
            {
                "id": "AL002", 
                "type": "SMS",
                "capacity": 3,
                "available": True
            }
        ]
    
    def _check_flight_intervals(self, flights: List[Flight]) -> bool:
        """
        Улучшенная проверка возможности создания компактной скобки
        с учетом времени переезда между ВС и                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  gограничений на промежутки
        """
        if len(flights) <= 1:
            return True
            
        # Сортируем по STD времени
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        
        # 1. Проверяем общий временной диапазон (не более 4 часов для компактности)
        time_span = sorted_flights[-1].stdMin - sorted_flights[0].stdMin
        if time_span > 240:  # 4 часа максимум (было 6 часов)
            return False
        
        # 2. Проверяем интервалы между соседними рейсами
        from ..utils.constants import RULE
        
        for i in range(len(sorted_flights) - 1):
            current_flight = sorted_flights[i]
            next_flight = sorted_flights[i + 1]
            
            # Время между окончанием обслуживания текущего рейса и началом следующего
            interval = next_flight.serviceStart - current_flight.serviceEnd
            
            # Используем константы из constants.py
            MIN_TRANSFER_TIME = RULE.TRAVEL  # 25 минут на переезд между бортами
            MIN_INTERVAL = 18  # минимум 18 минут между рейсами
            MAX_INTERVAL = 28  # максимум 28 минут между рейсами для компактности
            
            # Проверяем, что интервал находится в допустимом диапазоне
            if interval < MIN_INTERVAL:
                return False  # Слишком мало времени между рейсами
                
            if interval > MAX_INTERVAL:
                return False  # Слишком большой промежуток, скобка не компактная
        
        # 3. Дополнительная проверка: рейсы не должны пересекаться по времени обслуживания
        for i in range(len(sorted_flights) - 1):
            current_end = sorted_flights[i].serviceEnd
            next_start = sorted_flights[i + 1].serviceStart
            if current_end > next_start:
                return False  # Пересечение по времени обслуживания
        
        return True
    
    def _calculate_bracket_quality(self, flights: List[Flight]) -> float:
        """
        Вычисляет качество скобки (чем меньше, тем лучше).
        Учитывает временной диапазон, промежутки между рейсами и эффективность.
        """
        if len(flights) <= 1:
            return 0.0
            
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        
        # Общий временной диапазон (в минутах)
        time_span = sorted_flights[-1].stdMin - sorted_flights[0].stdMin
        
        # Сумма простоев между рейсами
        total_idle_time = 0
        for i in range(len(sorted_flights) - 1):
            current_flight = sorted_flights[i]
            next_flight = sorted_flights[i + 1]
            idle_time = next_flight.serviceStart - current_flight.serviceEnd
            total_idle_time += idle_time
        
        # Общее время обслуживания
        total_service_time = sum(f.serviceEnd - f.serviceStart for f in flights)
        
        # Коэффициент эффективности (чем больше времени обслуживания относительно общего времени, тем лучше)
        if time_span > 0:
            efficiency = total_service_time / time_span
        else:
            efficiency = 1.0
            
        # Итоговая оценка качества (чем меньше, тем лучше)
        # Штрафуем за большой временной диапазон и за большие простои
        quality_score = time_span * 0.7 + total_idle_time * 1.2 - efficiency * 100
        
        return quality_score
    
    def _create_bracket(self, flights: List[Flight], autolift: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Создает скобку из рейсов с правильным временем начала погрузки"""
        if not flights:
            return None
        
        from ..utils.constants import RULE
        
        sorted_flights = sorted(flights, key=lambda f: f.stdMin)
        first_flight = sorted_flights[0]
        last_flight = sorted_flights[-1]
        
        # Определяем правильное время начала скобки
        if first_flight.type == "DMS":
            bracket_start = first_flight.stdMin - RULE.LOAD_DMS  # 180 минут (3ч00мин) до STD для ШФ
            flight_type = "DMS"
        else:  # SMS рейсы
            bracket_start = first_flight.stdMin - RULE.LOAD_SMS  # 155 минут (2ч35мин) до STD для УФ
            flight_type = "SMS"
        
        # Конец скобки: через RETURN_UNLOAD после окончания обслуживания последнего рейса
        bracket_end = last_flight.serviceEnd + RULE.RETURN_UNLOAD  # +20 минут
        
        bracket = {
            "id": uid(),
            "machineId": autolift["id"],
            "flights": [f.flightNo for f in sorted_flights],
            "startTime": bracket_start,  # Время начала погрузки автолифта
            "endTime": bracket_end,      # Время окончания скобки
            "flightCount": len(flights),
            "bracketType": f"{len(flights)}-flight bracket",
            "firstFlightType": flight_type  # Тип первого рейса
        }
        
        return bracket

    def _combine_brackets_for_drivers(self, assignments: List[Dict[str, Any]], 
                                     brackets: List[Dict[str, Any]], 
                                     drivers: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Объединяет существующие скобки для одного водителя, если между ними подходящий промежуток
        """
        if len(brackets) < 2:
            return assignments, brackets
            
        self.logger.info(f"� Анализируем {len(brackets)} скобок для объединения")
        
        # Сортируем скобки по времени начала
        sorted_brackets = sorted(brackets, key=lambda b: b["startTime"])
        
        new_assignments = []
        new_brackets = []
        used_bracket_ids = set()
        
        # Пытаемся найти пары скобок для объединения
        combinations_found = 0
        for i in range(len(sorted_brackets)):
            if sorted_brackets[i]["id"] in used_bracket_ids:
                continue
                
            first_bracket = sorted_brackets[i]
            
            # Ищем вторую скобку, которую можно назначить тому же водителю
            for j in range(i + 1, len(sorted_brackets)):
                if sorted_brackets[j]["id"] in used_bracket_ids:
                    continue
                    
                second_bracket = sorted_brackets[j]
                
                # Проверяем, можно ли объединить эти скобки
                if self._can_combine_brackets(first_bracket, second_bracket):
                    combinations_found += 1
                    self.logger.info(f"🔗 Найдена пара #{combinations_found} для объединения:")
                    self.logger.info(f"   Первая скобка: {first_bracket['startTime']//60:02d}:{first_bracket['startTime']%60:02d}-{first_bracket['endTime']//60:02d}:{first_bracket['endTime']%60:02d}")
                    self.logger.info(f"   Вторая скобка: {second_bracket['startTime']//60:02d}:{second_bracket['startTime']%60:02d}-{second_bracket['endTime']//60:02d}:{second_bracket['endTime']%60:02d}")
                    self.logger.info(f"   Промежуток: {second_bracket['startTime'] - first_bracket['endTime']} минут")
                    
                    # Находим вторую скобку в исходном списке и переназначаем водителя
                    for bracket in brackets:
                        if bracket["id"] == second_bracket["id"]:
                            bracket["driverId"] = first_bracket["driverId"]
                            bracket["driver"] = first_bracket["driver"].copy()
                            self.logger.info(f"✅ Переназначили скобку водителю {first_bracket['driver']['name']}")
                            break
                    
                    # Обновляем назначения для второй скобки
                    for assignment in assignments:
                        if assignment.get("bracketId") == second_bracket["id"]:
                            assignment["driverId"] = first_bracket["driverId"]
                    
                    # Отмечаем скобки как использованные
                    used_bracket_ids.add(first_bracket["id"])
                    used_bracket_ids.add(second_bracket["id"])
                    break
            
            # Если не нашли пару, просто отмечаем как использованную
            if first_bracket["id"] not in used_bracket_ids:
                used_bracket_ids.add(first_bracket["id"])
        
        self.logger.info(f"✅ Объединение завершено: {combinations_found} пар создано")
        return assignments, brackets
    
    def _can_combine_brackets(self, first_bracket: Dict[str, Any], second_bracket: Dict[str, Any]) -> bool:
        """
        Проверяет, можно ли объединить две скобки для одного водителя
        """
        first_end = first_bracket["endTime"]
        second_start_original = second_bracket["startTime"]
        
        # Промежуток между скобками
        gap = second_start_original - first_end
        
        # Проверяем, что промежуток в допустимых пределах (20-60 минут)
        # Увеличиваем максимум до 60 минут для большей гибкости
        if 20 <= gap <= 60:
            return True
            
        return False
    

    

