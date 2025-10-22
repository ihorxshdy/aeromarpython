from typing import Optional, List
from pydantic import BaseModel
from datetime import time

class Shift(BaseModel):
    """Модель смены"""
    shift_start: str
    shift_end: str
    shift_type: Optional[str] = None
    
    @property
    def duration_hours(self) -> float:
        """Возвращает длительность смены в часах"""
        try:
            start_time = time.fromisoformat(self.shift_start + ":00" if ":" not in self.shift_start[-3:] else self.shift_start)
            end_time = time.fromisoformat(self.shift_end + ":00" if ":" not in self.shift_end[-3:] else self.shift_end)
            
            start_minutes = start_time.hour * 60 + start_time.minute
            end_minutes = end_time.hour * 60 + end_time.minute
            
            # Учитываем переход через полночь
            if end_minutes <= start_minutes:
                end_minutes += 24 * 60
            
            return (end_minutes - start_minutes) / 60
        except:
            return 8.0  # По умолчанию 8 часов

class ShiftAssignment(BaseModel):
    """Модель назначения смены водителю"""
    driver_id: str
    shift_start: str
    shift_end: str
    bracket_ids: List[str] = []
