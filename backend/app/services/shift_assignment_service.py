from typing import List, Dict, Optional, Any, Tuple
from ..models.shift import Shift, ShiftAssignment
from ..models.flight import Flight, FlightType
from ..utils.constants import RULE
import logging

logger = logging.getLogger(__name__)

class ShiftAssignmentService:
    """Сервис для назначения смен водителям на основе их брекетов"""
    
    def __init__(self, available_shifts: List[Shift]):
        self.available_shifts = available_shifts
        
    def assign_shifts_to_drivers(self, brackets: List[Dict[str, Any]], drivers: List[Dict[str, Any]]) -> List[ShiftAssignment]:
        """
        Назначает смены водителям на основе их брекетов
        Ищет оптимальную смену для каждого водителя
        """
        assignments: List[ShiftAssignment] = []
        
        # Группируем брекеты по водителям
        driver_brackets: Dict[str, List[Dict[str, Any]]] = {}
        for bracket in brackets:
            driver_id = bracket.get('driverId')
            if driver_id:
                if driver_id not in driver_brackets:
                    driver_brackets[driver_id] = []
                driver_brackets[driver_id].append(bracket)
        
        # Для каждого водителя с брекетами находим подходящую смену
        for driver_id, driver_bracket_list in driver_brackets.items():
            best_shift = self._find_best_shift_for_brackets(driver_bracket_list)
            
            if best_shift:
                assignment = ShiftAssignment(
                    driver_id=driver_id,
                    shift_start=best_shift.shift_start,
                    shift_end=best_shift.shift_end,
                    bracket_ids=[bracket['id'] for bracket in driver_bracket_list]
                )
                assignments.append(assignment)
                logger.info(f"Водителю {driver_id} назначена смена {best_shift.shift_start}-{best_shift.shift_end}")
            else:
                logger.warning(f"Не удалось найти подходящую смену для водителя {driver_id}")
        
        return assignments
    
    def _find_best_shift_for_brackets(self, brackets: List[Dict[str, Any]]) -> Optional[Shift]:
        """
        Находит лучшую смену для списка брекетов водителя
        Критерии: 
        1. Смена должна начинаться ДО или В МОМЕНТ начала самой ранней скобки
        2. Смена должна заканчиваться ПОСЛЕ окончания самой поздней скобки  
        3. Предпочтение смене с началом максимально близким к началу скобки
        """
        if not brackets:
            return None
        
        # Определяем временной диапазон всех брекетов в минутах
        all_start_times: List[int] = []
        all_end_times: List[int] = []
        
        for bracket in brackets:
            start_time = bracket.get('startTime')
            end_time = bracket.get('endTime')
            
            logger.debug(f"DEBUG: Bracket startTime: {start_time}, endTime: {end_time}")
            
            if start_time is not None and end_time is not None:
                # Времена уже в минутах от 00:00
                if isinstance(start_time, int):
                    all_start_times.append(start_time)
                if isinstance(end_time, int):
                    all_end_times.append(end_time)
        
        if not all_start_times or not all_end_times:
            return None
        
        # Находим самое раннее начало и самое позднее окончание (в минутах)
        earliest_start_min = min(all_start_times)
        latest_end_min = max(all_end_times)
        
        logger.debug(f"DEBUG: Скобки: {earliest_start_min//60:02d}:{earliest_start_min%60:02d} - {latest_end_min//60:02d}:{latest_end_min%60:02d}")
        
        # Ищем подходящие смены
        suitable_shifts: List[Tuple[Shift, float]] = []
        
        for shift in self.available_shifts:
            # Конвертируем время смены в минуты
            shift_start_min = self._time_str_to_minutes(shift.shift_start)
            shift_end_min = self._time_str_to_minutes(shift.shift_end)
            
            logger.debug(f"DEBUG: Проверяем смену {shift.shift_start}-{shift.shift_end} ({shift_start_min}-{shift_end_min} мин)")
            
            if self._shift_can_accommodate_brackets_optimized(shift_start_min, shift_end_min, earliest_start_min, latest_end_min):
                # Рассчитываем качество смены - чем ближе начало смены к началу скобки, тем лучше
                quality_score = self._calculate_shift_quality_optimized(shift_start_min, shift_end_min, earliest_start_min, latest_end_min)
                suitable_shifts.append((shift, quality_score))
                logger.debug(f"DEBUG: Смена подходит, качество: {quality_score}")
            else:
                logger.debug(f"DEBUG: Смена НЕ подходит")
        
        if not suitable_shifts:
            logger.warning(f"Не найдено подходящих смен для брекетов {earliest_start_min//60:02d}:{earliest_start_min%60:02d} - {latest_end_min//60:02d}:{latest_end_min%60:02d}")
            return None
        
        # Сортируем по качеству (меньше = лучше) и возвращаем лучшую
        suitable_shifts.sort(key=lambda x: x[1])
        best_shift = suitable_shifts[0][0]
        logger.info(f"Выбрана лучшая смена: {best_shift.shift_start}-{best_shift.shift_end} (качество: {suitable_shifts[0][1]})")
        return best_shift
    
    def _time_str_to_minutes(self, time_str: str) -> int:
        """Конвертирует строку времени HH:MM в минуты от 00:00"""
        try:
            parts = time_str.split(':')
            hours = int(parts[0])
            minutes = int(parts[1])
            return hours * 60 + minutes
        except:
            return 0
    
    def _shift_can_accommodate_brackets_optimized(self, shift_start_min: int, shift_end_min: int, bracket_start_min: int, bracket_end_min: int) -> bool:
        """
        Проверяет, может ли смена вместить скобки
        КЛЮЧЕВОЕ ПРАВИЛО: смена должна начинаться ДО или В МОМЕНТ начала скобки
        """
        
        # Обрабатываем смены через полночь (например, 20:00-8:00)
        if shift_end_min < shift_start_min:
            # Смена через полночь - нормализуем время
            shift_end_min += 24 * 60  # Добавляем 24 часа
            
            # Если скобка тоже переходит через полночь
            if bracket_end_min < bracket_start_min:
                bracket_end_min += 24 * 60
        
        # Основные условия:
        # 1. Смена должна начинаться НЕ ПОЗЖЕ начала скобки
        # 2. Смена должна заканчиваться НЕ РАНЬШЕ окончания скобки
        condition1 = shift_start_min <= bracket_start_min  # Смена начинается до/в момент скобки
        condition2 = shift_end_min >= bracket_end_min      # Смена заканчивается после/в момент скобки
        
        return condition1 and condition2
    
    def _calculate_shift_quality_optimized(self, shift_start_min: int, shift_end_min: int, bracket_start_min: int, bracket_end_min: int) -> float:
        """
        Рассчитывает качество смены - чем меньше, тем лучше
        Приоритет: минимальный разрыв между началом смены и началом скобки
        """
        
        # Обрабатываем смены через полночь
        if shift_end_min < shift_start_min:
            shift_end_min += 24 * 60
            if bracket_end_min < bracket_start_min:
                bracket_end_min += 24 * 60
        
        # Основной критерий: разрыв между началом смены и началом скобки
        # Чем меньше разрыв, тем лучше (но смена должна начинаться раньше или одновременно)
        start_gap = bracket_start_min - shift_start_min
        
        # Если смена начинается позже скобки - штраф
        if start_gap < 0:
            return 1000.0  # Большой штраф
        
        # Дополнительные критерии:
        # 1. Длительность смены (предпочитаем более короткие смены)
        shift_duration = shift_end_min - shift_start_min
        bracket_duration = bracket_end_min - bracket_start_min
        duration_penalty = max(0, shift_duration - bracket_duration) * 0.1
        
        # 2. Время простоя после окончания скобки
        end_gap = shift_end_min - bracket_end_min
        end_penalty = end_gap * 0.05
        
        # Итоговая оценка качества
        quality = start_gap + duration_penalty + end_penalty
        
        return quality
    
    def _shift_can_accommodate_brackets(self, shift: Shift, earliest_start: int, latest_end: int) -> bool:
        """УСТАРЕВШАЯ ФУНКЦИЯ - используется _shift_can_accommodate_brackets_optimized"""
        # Конвертируем время смены в минуты
        shift_start_min = self._time_str_to_minutes(shift.shift_start)
        shift_end_min = self._time_str_to_minutes(shift.shift_end)
        
        return self._shift_can_accommodate_brackets_optimized(shift_start_min, shift_end_min, earliest_start, latest_end)
    
    def _calculate_shift_quality(self, shift: Shift, earliest_start: int, latest_end: int) -> float:
        """УСТАРЕВШАЯ ФУНКЦИЯ - используется _calculate_shift_quality_optimized"""
        # Конвертируем время смены в минуты  
        shift_start_min = self._time_str_to_minutes(shift.shift_start)
        shift_end_min = self._time_str_to_minutes(shift.shift_end)
        
        return self._calculate_shift_quality_optimized(shift_start_min, shift_end_min, earliest_start, latest_end)
