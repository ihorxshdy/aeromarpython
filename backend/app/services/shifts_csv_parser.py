import csv
from typing import List
from ..models.shift import Shift
import logging

logger = logging.getLogger(__name__)

class ShiftsCSVParser:
    """Парсер CSV файла со сменами"""
    
    @staticmethod
    def parse_shifts_file(file_path: str) -> List[Shift]:
        """
        Парсит CSV файл со сменами
        Ожидает колонки: SHIFT_START, SHIFT_END
        """
        shifts: List[Shift] = []
        
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as file:
                reader = csv.DictReader(file, delimiter=';')
                
                for row in reader:
                    try:
                        shift = Shift(
                            shift_start=row['SHIFT_START'].strip(),
                            shift_end=row['SHIFT_END'].strip()
                        )
                        shifts.append(shift)
                        
                    except Exception as e:
                        logger.warning(f"Ошибка при парсинге строки смены: {row}, ошибка: {e}")
                        continue
                        
        except FileNotFoundError:
            logger.error(f"Файл смен не найден: {file_path}")
        except Exception as e:
            logger.error(f"Ошибка при чтении файла смен: {e}")
            
        logger.info(f"Загружено {len(shifts)} смен из файла {file_path}")
        return shifts
