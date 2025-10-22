from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List, Dict, Any, Iterable
from ..models.flight import Flight
from ..models.machine import Machine, make_machines
from ..models.driver import Driver, Autolift, make_drivers, make_autolifts
from ..models.bracket import FlightBracket
from ..models.autolift import AutoliftConfiguration, WindowType
from ..models.shift import Shift, ShiftAssignment

from ..services.csv_parser import parse_csv
from ..services.bracket_scheduler import BracketScheduler  # Основной планировщик
from ..services.shifts_csv_parser import ShiftsCSVParser
from ..services.shift_assignment_service import ShiftAssignmentService

router = APIRouter()

# Хранилища данных
flights_storage: List[Flight] = []
machines_storage: List[Machine] = make_machines()
drivers_storage: List[Driver] = make_drivers()
autolifts_storage: List[Autolift] = make_autolifts()
shifts_storage: List[Shift] = []
shift_assignments_storage: List[ShiftAssignment] = []


def _to_camel_case(name: str) -> str:
    parts = name.split('_')
    if not parts:
        return name
    return parts[0] + ''.join(part.capitalize() for part in parts[1:])


def _to_snake_case(name: str) -> str:
    if not name:
        return name
    result: List[str] = []
    for char in name:
        if char.isupper():
            if result and result[-1] != '_':
                result.append('_')
            result.append(char.lower())
        else:
            result.append(char)
    return ''.join(result)


def _iter_keys(field: str) -> Iterable[str]:
    """Возвращает возможные варианты имени поля (snake/camel)."""
    yield field
    if '_' in field:
        candidate = _to_camel_case(field)
        if candidate != field:
            yield candidate
    else:
        candidate = _to_snake_case(field)
        if candidate != field:
            yield candidate


def _get_field(entity: Any, field: str, default: Any = None) -> Any:
    """Безопасно получает значение поля из модели или словаря."""
    if isinstance(entity, dict):
        for key in _iter_keys(field):
            if key in entity:
                return entity[key]
        return default
    return getattr(entity, field, default)


def _set_field(entity: Any, field: str, value: Any) -> None:
    """Безопасно устанавливает значение поля в модели или словаре."""
    if isinstance(entity, dict):
        for key in _iter_keys(field):
            if key in entity:
                entity[key] = value
                return
        entity[field] = value
    else:
        setattr(entity, field, value)


def _find_in_storage(storage: Iterable[Any], field: str, target: str) -> Any:
    """Ищет объект в хранилище по указанному полю."""
    for item in storage:
        if _get_field(item, field) == target:
            return item
    return None

# Загружаем смены по умолчанию при старте
try:
    default_shifts = ShiftsCSVParser.parse_shifts_file("/Users/igordvoretskii/Documents/aeromar-python/shifts.csv")
    shifts_storage.extend(default_shifts)
except Exception as e:
    print(f"Не удалось загрузить смены по умолчанию: {e}")

# Хранилище в памяти (в реальном приложении использовать БД)  
# (Дублирующие определения удалены)
# autolift_service = AutoliftService()  # Временно закомментировано

@router.get("/")
async def root():
    """Корневой эндпоинт"""
    return {"message": "Aeromar Flight Planner API"}

@router.get("/flights", response_model=List[Flight])
async def get_flights():
    """Получить все рейсы"""
    return flights_storage

@router.delete("/flights")
async def clear_flights():
    """Очистить все рейсы"""
    flights_storage.clear()
    return {"message": "Все рейсы удалены"}

@router.post("/flights", response_model=List[Flight])
async def add_flights(flights: List[Flight]):
    """Добавить рейсы"""
    flights_storage.extend(flights)
    return flights_storage

@router.post("/flights/import-csv", response_model=List[Flight])
async def import_csv(file: UploadFile = File(...)):
    """Импорт рейсов из CSV файла"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате CSV")
    
    content = await file.read()
    print(f"DEBUG: Получен файл размером {len(content)} байт")
    
    # Пробуем разные кодировки
    text = None
    for encoding in ['utf-8', 'utf-8-sig', 'cp1251', 'iso-8859-1']:
        try:
            text = content.decode(encoding)
            print(f"DEBUG: Успешно декодировано с кодировкой {encoding}")
            break
        except UnicodeDecodeError:
            print(f"DEBUG: Не удалось декодировать с кодировкой {encoding}")
            continue
    
    if text is None:
        raise HTTPException(status_code=400, detail="Не удалось декодировать файл. Проверьте кодировку.")
    
    print(f"DEBUG: Декодированный текст (первые 200 символов): {repr(text[:200])}")
    
    # Тестируем split на строки
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    print(f"DEBUG: Количество строк после split: {len(lines)}")
    print(f"DEBUG: Первая строка: {repr(lines[0] if lines else 'НЕТ СТРОК')}")
    print(f"DEBUG: Вторая строка: {repr(lines[1] if len(lines) > 1 else 'НЕТ ВТОРОЙ СТРОКИ')}")
    
    try:
        new_flights = parse_csv(text)
        print(f"DEBUG: Импортировано {len(new_flights)} рейсов из CSV")
        # Заменяем все данные новыми (очищаем старые)
        flights_storage.clear()
        flights_storage.extend(new_flights)
        print(f"DEBUG: flights_storage теперь содержит {len(flights_storage)} рейсов")
        
        # Возвращаем полный список для обновления фронтенда
        result = list(flights_storage)
        return result
    except Exception as e:
        print(f"DEBUG: Ошибка при парсинге CSV: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Ошибка при парсинге CSV: {str(e)}")

@router.post("/drivers/import-csv", response_model=List[Driver])
async def import_drivers_csv(file: UploadFile = File(...)):
    """Импорт водителей из CSV файла"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате CSV")
    
    try:
        contents = await file.read()
        text = contents.decode('utf-8')
        
        from ..services.drivers_csv_parser import parse_drivers_csv
        new_drivers = parse_drivers_csv(text)
        
        # Заменяем существующих водителей
        drivers_storage.clear()
        drivers_storage.extend(new_drivers)
        
        return drivers_storage
        
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Ошибка декодирования файла. Убедитесь, что файл в кодировке UTF-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка при парсинге CSV: {str(e)}")

@router.post("/autolifts/import-csv", response_model=List[Autolift])
async def import_autolifts_csv(file: UploadFile = File(...)):
    """Импорт автолифтов из CSV файла"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате CSV")
    
    try:
        contents = await file.read()
        text = contents.decode('utf-8')
        
        from ..services.drivers_csv_parser import parse_autolifts_csv
        new_autolifts = parse_autolifts_csv(text)
        
        # Заменяем существующие автолифты
        autolifts_storage.clear()
        autolifts_storage.extend(new_autolifts)
        
        return autolifts_storage
        
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Ошибка декодирования файла. Убедитесь, что файл в кодировке UTF-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка при парсинге CSV: {str(e)}")

@router.get("/machines", response_model=List[Machine])
async def get_machines():
    """Получить все машины"""
    return machines_storage

@router.post("/assign/auto")
async def auto_assign():
    """Автоматическое назначение рейсов используя BracketScheduler"""
    print(f"DEBUG: flights_storage содержит {len(flights_storage)} рейсов")
    print(f"DEBUG: machines_storage содержит {len(machines_storage)} машин")
    
    if not flights_storage:
        raise HTTPException(status_code=400, detail="Нет рейсов для назначения")
    
    try:
        # Используем BracketScheduler
        print("DEBUG: Используем BracketScheduler...")
        scheduler = BracketScheduler(flights_storage, machines_storage)
        
        # Получаем неназначенные рейсы
        unassigned_flights = [
            f for f in flights_storage
            if not _get_field(f, "vehicleId")
        ]
        print(f"DEBUG: Неназначенных рейсов: {len(unassigned_flights)}")
        
        # Планирование скобок
        result = scheduler.plan_brackets()
        
        # result содержит assignments, brackets, unassigned
        assignments = result.get("assignments", [])
        brackets = result.get("brackets", [])
        
        # Обновляем назначения рейсов
        for assignment in assignments:
            flight_no = assignment.get("flightNo")
            driver_id = assignment.get("driverId") 
            bracket_id = assignment.get("bracketId")
            
            if not flight_no:
                continue
                
            # Находим рейс и обновляем его назначения
            for flight in flights_storage:
                if _get_field(flight, "flightNo") == flight_no:
                    _set_field(flight, "vehicleId", driver_id or "")
                    _set_field(flight, "chainId", bracket_id or "")
                    break
                    
        assigned_count = len(assignments)
        brackets_count = len(brackets)
        print(f"DEBUG: Назначено {assigned_count} рейсов в {brackets_count} скобок")
        
        return {
            "message": f"Планирование скобок выполнено. Создано {brackets_count} скобок", 
            "assigned_count": assigned_count,
            "brackets_count": brackets_count
        }
        
    except Exception as e:
        print(f"DEBUG: Ошибка при автоназначении: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Ошибка при автоназначении: {str(e)}")

@router.post("/assign/reset")
async def reset_assignments():
    """Сброс всех назначений"""
    for flight in flights_storage:
        _set_field(flight, "vehicleId", "")
        _set_field(flight, "chainId", "")
    return {"message": "Назначения сброшены"}

@router.post("/assign/flight/{flight_id}/machine/{machine_id}")
async def assign_flight_to_machine(flight_id: str, machine_id: str):
    """Назначить рейс на конкретную машину"""
    flight = _find_in_storage(flights_storage, "id", flight_id)
    if not flight:
        raise HTTPException(status_code=404, detail="Рейс не найден")
    
    machine = _find_in_storage(machines_storage, "id", machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Машина не найдена")
    
    # Назначить
    _set_field(flight, "vehicleId", machine_id)
    _set_field(flight, "chainId", f"chain_{machine_id}_{flight_id}")
    
    return {
        "message": f"Рейс {_get_field(flight, 'flightNo')} назначен на машину {_get_field(machine, 'name')}",
        "flight": flight
    }

@router.delete("/assign/flight/{flight_id}")
async def unassign_flight(flight_id: str):
    """Снять назначение с рейса"""
    flight = _find_in_storage(flights_storage, "id", flight_id)
    if not flight:
        raise HTTPException(status_code=404, detail="Рейс не найден")
    
    # Снять назначение
    _set_field(flight, "vehicleId", "")
    _set_field(flight, "chainId", "")
    
    return {
        "message": f"Назначение с рейса {_get_field(flight, 'flightNo')} снято",
        "flight": flight
    }

@router.put("/flights/{flight_id}")
async def update_flight(flight_id: str, flight: Flight):
    """Обновить рейс"""
    for i, f in enumerate(flights_storage):
        if _get_field(f, "id") == flight_id:
            flights_storage[i] = flight
            return flight
    raise HTTPException(status_code=404, detail="Рейс не найден")

@router.put("/machines/{machine_id}/driver")
async def update_machine_driver(machine_id: str, driver_data: Dict[str, Any]):
    """Обновить водителя машины"""
    machine = _find_in_storage(machines_storage, "id", machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Машина не найдена")
    
    # Обновить водителя
    _set_field(machine, "driver", driver_data.get("driver", ""))
    
    return {
        "message": f"Водитель машины {_get_field(machine, 'name')} обновлен",
        "machine": machine
    }

@router.delete("/flights/{flight_id}")
async def delete_flight(flight_id: str):
    """Удалить рейс"""
    for i, f in enumerate(flights_storage):
        if _get_field(f, "id") == flight_id:
            del flights_storage[i]
            return {"message": "Рейс удален"}
    raise HTTPException(status_code=404, detail="Рейс не найден")

# Новые эндпоинты для работы с автолифтами (временно недоступны)

@router.post("/autolift/create")
async def create_autolift(flight_ids: List[str]):
    """Создать конфигурацию автолифта из указанных рейсов - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.get("/autolift/configurations")
async def get_autolift_configurations():
    """Получить все конфигурации автолифтов - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.post("/autolift/{autolift_id}/assign-window")
async def assign_window(autolift_id: str, window_number: int):
    """Назначить окно автолифту - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.post("/autolift/{autolift_id}/assign-adjacent-windows")
async def assign_adjacent_windows(autolift_id: str, primary_window: int):
    """Назначить два соседних окна для DMS автолифта - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.get("/autolift/windows/available")
async def get_available_windows(window_type: str):
    """Получить доступные окна - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.get("/autolift/windows/utilization")
async def get_window_utilization():
    """Получить информацию об использовании окон - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.post("/autolift/timeline")
async def calculate_timeline(flight_ids: List[str]):
    """Рассчитать временную линию операций - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.post("/autolift/validate")
async def validate_schedule(flight_ids: List[str]):
    """Проверить корректность расписания автолифта - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.get("/autolift/rules/sms-combinations")
async def get_sms_combinations():
    """Получить допустимые комбинации для СМС флота - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.get("/autolift/rules/dms-combinations")
async def get_dms_combinations():
    """Получить допустимые комбинации для ДМС флота - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")

@router.delete("/autolift/{autolift_id}")
async def delete_autolift(autolift_id: str):
    """Удалить конфигурацию автолифта - временно недоступно"""
    raise HTTPException(status_code=501, detail="Автолифт функции временно недоступны")


# Планировщик скобок (временно недоступен)

@router.post("/brackets/create-schedule")
async def create_bracket_schedule():
    """Создать расписание скобок для всех рейсов"""
    if not flights_storage:
        raise HTTPException(status_code=400, detail="Нет рейсов для планирования")
    
    if not machines_storage:
        raise HTTPException(status_code=400, detail="Нет автолифтов для планирования")
    
    try:
        print(f"🔴 DEBUG: Starting bracket scheduling for {len(flights_storage)} flights")
        print(f"🔴 DEBUG: Flights in storage: {[f.flightNo for f in flights_storage[:5]]}...")  # первые 5
        # Создаем планировщик и планируем все рейсы
        scheduler = BracketScheduler(flights_storage, machines_storage, drivers_storage)
        print(f"🔴 DEBUG: BracketScheduler created, calling plan_brackets...")
        result = scheduler.plan_brackets()  # Убираем параметры!
        print(f"🔴 DEBUG: plan_brackets completed")
        
        # Получаем результаты планирования
        assignments = result.get('assignments', [])
        brackets = result.get('brackets', [])
        unassigned = result.get('unassigned', [])
        
        print(f"🔴 DEBUG: Created {len(brackets)} brackets, {len(assignments)} assignments, {len(unassigned)} unassigned")
        
        # Обновляем рейсы в storage с назначениями
        for assignment in assignments:
            flight_no = assignment.get('flightNo')
            if not flight_no:
                continue
            for flight in flights_storage:
                if _get_field(flight, 'flightNo') == flight_no:
                    # Используем driverId как vehicleId для совместимости
                    _set_field(flight, 'vehicleId', assignment.get('driverId', ''))
                    # Используем bracketId как chainId для группировки в frontend
                    _set_field(flight, 'chainId', assignment.get('bracketId', ''))
                    
        print(f"🔴 DEBUG: Updated flight assignments in storage")
        
        # Подсчитываем статистику
        assigned_count = len(assignments)
        total_count = len(flights_storage)
        
        return {
            "status": "success",
            "message": "Планирование выполнено успешно",
            "stats": {
                "total_flights": total_count,
                "assigned_flights": assigned_count,
                "unassigned_flights": len(unassigned),
                "brackets_created": len(brackets)
            },
            "brackets": brackets,
            "assignments": assignments,
            "unassigned": unassigned
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка планирования: {str(e)}")

@router.post("/brackets/plan-for-flights")
async def plan_brackets_for_flights(flight_ids: List[str]):
    """Создать расписание скобок для указанных рейсов"""
    if not flight_ids:
        raise HTTPException(status_code=400, detail="Не указаны ID рейсов")
    
    # Находим рейсы по ID
    selected_ids = set(flight_ids)
    selected_flights = [f for f in flights_storage if _get_field(f, "id") in selected_ids]
    
    if not selected_flights:
        raise HTTPException(status_code=404, detail="Рейсы не найдены")
    
    if not machines_storage:
        raise HTTPException(status_code=400, detail="Нет автолифтов для планирования")
    
    try:
        # Создаем планировщик только для выбранных рейсов
        scheduler = BracketScheduler(selected_flights, machines_storage)
        result = scheduler.plan_brackets()  # Убираем параметры!

        assignments = result.get("assignments", [])
        brackets = result.get("brackets", [])
        unassigned = result.get("unassigned", [])

        # Сбрасываем старые назначения только для выбранных рейсов
        for flight in flights_storage:
            if _get_field(flight, "id") in selected_ids:
                _set_field(flight, "vehicleId", "")
                _set_field(flight, "chainId", "")

        # Применяем новые назначения
        for assignment in assignments:
            flight_no = assignment.get("flightNo")
            if not flight_no:
                continue
            for flight in flights_storage:
                if (
                    _get_field(flight, "flightNo") == flight_no
                    and _get_field(flight, "id") in selected_ids
                ):
                    _set_field(flight, "vehicleId", assignment.get("driverId", ""))
                    _set_field(flight, "chainId", assignment.get("bracketId", ""))
                    break

        planned_flights = [f for f in flights_storage if _get_field(f, "id") in selected_ids]

        # Подсчитываем статистику
        assigned_count = sum(1 for f in planned_flights if _get_field(f, "vehicleId"))
        total_count = len(planned_flights)
        unique_chains = {
            _get_field(f, "chainId")
            for f in planned_flights
            if _get_field(f, "chainId")
        }

        return {
            "status": "success",
            "message": f"Планирование выполнено для {total_count} рейсов",
            "stats": {
                "total_flights": total_count,
                "assigned_flights": assigned_count,
                "unassigned_flights": len(unassigned),
                "brackets_created": len(unique_chains)
            },
            "brackets": brackets,
            "assignments": assignments,
            "unassigned": unassigned,
            "flights": planned_flights
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка планирования: {str(e)}")

@router.get("/brackets/rules")
async def get_bracket_rules():
    """Получить правила формирования скобок"""
    from ..utils.constants import DMS_ECONOMY_TYPES
    from ..models.bracket import SMS_COMBINATIONS, DMS_BUSINESS_COMBINATIONS
    
    return {
        "sms_combinations": SMS_COMBINATIONS,
        "dms_business_combinations": DMS_BUSINESS_COMBINATIONS,
        "dms_economy_types": list(DMS_ECONOMY_TYPES),
        "timing_rules": {
            "sms_load_start_before_std": 180,  # 3ч00мин
            "dms_load_start_before_std": 240,  # 4ч00мин
            "travel_time_between_aircraft": 20,  # 20 минут
            "return_to_window_time": 15,  # 15 минут
            "service_sms_duration": 19,  # 19 минут
            "service_dms_duration": 45,  # 45 минут
        }
    }

@router.post("/brackets/validate-combination")
async def validate_bracket_combination(request_data: Dict[str, Any]):
    """Проверить допустимость комбинации типов ВС для скобки - временно недоступно"""
    raise HTTPException(status_code=501, detail="Валидация скобок временно недоступна")

# === ВОДИТЕЛИ И АВТОЛИФТЫ ===

@router.get("/drivers", response_model=List[Driver])
async def get_drivers():
    """Получить всех водителей"""
    return drivers_storage

@router.post("/drivers", response_model=List[Driver])
async def add_drivers(drivers: List[Driver]):
    """Добавить водителей"""
    drivers_storage.extend(drivers)
    return drivers_storage

@router.get("/drivers/with-shifts")
async def get_drivers_with_shifts():
    """Получить водителей с назначенными сменами"""
    drivers_with_shifts = []
    
    # Создаем словарь назначений по водителям
    assignments_by_driver: Dict[str, Any] = {}
    for assignment in shift_assignments_storage:
        driver_id = _get_field(assignment, "driver_id") or _get_field(assignment, "driverId")
        if driver_id:
            assignments_by_driver[driver_id] = assignment
    
    for driver in drivers_storage:
        driver_data = {
            "id": _get_field(driver, "id"),
            "full_name": _get_field(driver, "full_name"),
            "shift_start": None,
            "shift_end": None,
            "brackets_count": 0
        }
        
        driver_id = _get_field(driver, "id")
        assignment = assignments_by_driver.get(driver_id) if driver_id else None
        if assignment:
            driver_data["shift_start"] = _get_field(assignment, "shift_start")
            driver_data["shift_end"] = _get_field(assignment, "shift_end")
            bracket_ids = _get_field(assignment, "bracket_ids", []) or []
            driver_data["brackets_count"] = len(bracket_ids)
        
        drivers_with_shifts.append(driver_data)
    
    return drivers_with_shifts

@router.get("/drivers/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str):
    """Получить водителя по ID"""
    driver = _find_in_storage(drivers_storage, "id", driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail=f"Водитель {driver_id} не найден")
    return driver

@router.put("/drivers/{driver_id}", response_model=Driver)
async def update_driver(driver_id: str, driver_data: Driver):
    """Обновить данные водителя"""
    driver = _find_in_storage(drivers_storage, "id", driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail=f"Водитель {driver_id} не найден")
    
    # Обновляем данные
    _set_field(driver, "full_name", driver_data.full_name)
    _set_field(driver, "shift_start", driver_data.shift_start)
    _set_field(driver, "shift_end", driver_data.shift_end)
    _set_field(driver, "assigned_autolift", driver_data.assigned_autolift)
    
    return driver

@router.get("/autolifts", response_model=List[Autolift])
async def get_autolifts():
    """Получить все автолифты"""
    return autolifts_storage

@router.post("/autolifts", response_model=List[Autolift])
async def add_autolifts(autolifts: List[Autolift]):
    """Добавить автолифты"""
    autolifts_storage.extend(autolifts)
    return autolifts_storage

@router.get("/autolifts/{autolift_id}", response_model=Autolift)
async def get_autolift(autolift_id: str):
    """Получить автолифт по ID"""
    autolift = _find_in_storage(autolifts_storage, "id", autolift_id)
    if not autolift:
        raise HTTPException(status_code=404, detail=f"Автолифт {autolift_id} не найден")
    return autolift

@router.post("/assign-autolift/{driver_id}/{autolift_id}")
async def assign_autolift_to_driver(driver_id: str, autolift_id: str):
    """Назначить автолифт водителю"""
    driver = _find_in_storage(drivers_storage, "id", driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail=f"Водитель {driver_id} не найден")
    
    autolift = _find_in_storage(autolifts_storage, "id", autolift_id)
    if not autolift:
        raise HTTPException(status_code=404, detail=f"Автолифт {autolift_id} не найден")
    
    # Проверяем, не назначен ли автолифт другому водителю
    assigned_driver = _get_field(autolift, "assigned_driver")
    if assigned_driver and assigned_driver != driver_id:
        raise HTTPException(
            status_code=400,
            detail=f"Автолифт {_get_field(autolift, 'number')} уже назначен водителю {assigned_driver}"
        )
    
    # Если у водителя уже есть автолифт, освобождаем его
    current_autolift = _get_field(driver, "assigned_autolift")
    if current_autolift:
        old_autolift = _find_in_storage(autolifts_storage, "id", current_autolift)
        if old_autolift:
            _set_field(old_autolift, "assigned_driver", None)
    
    # Назначаем
    _set_field(driver, "assigned_autolift", autolift_id)
    _set_field(autolift, "assigned_driver", driver_id)
    
    return {
        "message": (
            f"Автолифт №{_get_field(autolift, 'number')} назначен водителю {_get_field(driver, 'full_name')}"
        ),
        "driver": driver,
        "autolift": autolift
    }

@router.delete("/assign-autolift/{driver_id}")
async def unassign_autolift_from_driver(driver_id: str):
    """Снять назначение автолифта с водителя"""
    driver = _find_in_storage(drivers_storage, "id", driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail=f"Водитель {driver_id} не найден")
    
    current_autolift = _get_field(driver, "assigned_autolift")
    if not current_autolift:
        raise HTTPException(
            status_code=400,
            detail=f"У водителя {_get_field(driver, 'full_name')} нет назначенного автолифта"
        )
    
    # Освобождаем автолифт
    autolift = _find_in_storage(autolifts_storage, "id", current_autolift)
    if autolift:
        _set_field(autolift, "assigned_driver", None)
    
    _set_field(driver, "assigned_autolift", None)
    
    return {
        "message": f"Назначение автолифта снято с водителя {_get_field(driver, 'full_name')}",
        "driver": driver
    }

@router.post("/auto-assign-autolifts")
async def auto_assign_autolifts():
    """Автоматическое назначение автолифтов водителям"""
    assigned_count = 0
    
    # Сброс существующих назначений
    for driver in drivers_storage:
        _set_field(driver, "assigned_autolift", None)
    for autolift in autolifts_storage:
        _set_field(autolift, "assigned_driver", None)
    
    # Получаем доступные автолифты и водителей
    available_autolifts = [a for a in autolifts_storage if not _get_field(a, "assigned_driver")]
    available_drivers = [d for d in drivers_storage if not _get_field(d, "assigned_autolift")]
    
    # Простое назначение: первому водителю - первый автолифт
    for i, driver in enumerate(available_drivers):
        if i < len(available_autolifts):
            autolift = available_autolifts[i]
            _set_field(driver, "assigned_autolift", _get_field(autolift, "id"))
            _set_field(autolift, "assigned_driver", _get_field(driver, "id"))
            assigned_count += 1
    
    return {
        "message": f"Автоназначение автолифтов выполнено",
        "assigned_count": assigned_count,
        "total_drivers": len(drivers_storage),
        "total_autolifts": len(autolifts_storage)
    }

# ============ НОВЫЕ МАРШРУТЫ ДЛЯ СМЕН ============

@router.get("/shifts", response_model=List[Shift])
async def get_shifts():
    """Получить все доступные смены"""
    return shifts_storage

@router.post("/shifts/upload")
async def upload_shifts(file: UploadFile = File(...)):
    """Загрузить смены из CSV файла"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате CSV")
    
    try:
        # Читаем содержимое файла
        contents = await file.read()
        temp_file_path = f"/tmp/{file.filename}"
        
        # Сохраняем во временный файл
        with open(temp_file_path, "wb") as f:
            f.write(contents)
        
        # Парсим смены
        shifts = ShiftsCSVParser.parse_shifts_file(temp_file_path)
        
        # Очищаем старые смены и сохраняем новые
        shifts_storage.clear()
        shifts_storage.extend(shifts)
        
        return {
            "message": f"Загружено {len(shifts)} смен",
            "shifts_count": len(shifts)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке файла: {str(e)}")

@router.get("/shift-assignments", response_model=List[ShiftAssignment])
async def get_shift_assignments():
    """Получить назначения смен водителям"""
    return shift_assignments_storage

@router.post("/shift-assignments/auto-assign")
async def auto_assign_shifts():
    """
    Автоматически назначить смены водителям на основе их брекетов.
    Требует наличия созданных брекетов.
    """
    print("DEBUG: Начинаем автоназначение смен")
    
    if not shifts_storage:
        print("DEBUG: Нет доступных смен в shifts_storage")
        raise HTTPException(status_code=400, detail="Сначала загрузите доступные смены")
    
    print(f"DEBUG: Найдено {len(shifts_storage)} смен")
    print(f"DEBUG: Найдено {len(flights_storage)} рейсов")
    print(f"DEBUG: Найдено {len(drivers_storage)} водителей")
    
    try:
        # Создаем планировщик брекетов для получения актуальных брекетов
        print("DEBUG: Создаем планировщик брекетов")
        scheduler = BracketScheduler(flights_storage, machines_storage, drivers_storage)
        
        print("DEBUG: Запускаем планирование брекетов")
        planning_result = scheduler.plan_brackets()
        
        print(f"DEBUG: Результат планирования: {len(planning_result.get('brackets', []))} брекетов")
        
        if not planning_result.get("brackets"):
            print("DEBUG: Нет созданных брекетов")
            raise HTTPException(status_code=400, detail="Нет созданных брекетов для назначения смен")
        
        # Создаем сервис назначения смен
        print("DEBUG: Создаем сервис назначения смен")
        shift_service = ShiftAssignmentService(shifts_storage)
        
        # Назначаем смены
        print("DEBUG: Назначаем смены водителям")
        assignments = shift_service.assign_shifts_to_drivers(
            planning_result["brackets"], 
            drivers_storage
        )
        
        print(f"DEBUG: Создано {len(assignments)} назначений смен")
        
        # Очищаем старые назначения и сохраняем новые
        shift_assignments_storage.clear()
        shift_assignments_storage.extend(assignments)
        
        return {
            "message": f"Назначено смен: {len(assignments)}",
            "assignments": [
                {
                    "driver_id": _get_field(a, "driver_id"),
                    "shift_start": _get_field(a, "shift_start"),
                    "shift_end": _get_field(a, "shift_end"),
                    "brackets_count": len(_get_field(a, "bracket_ids", []) or [])
                }
                for a in assignments
            ]
        }
        
    except Exception as e:
        print(f"DEBUG: Ошибка при назначении смен: {str(e)}")
        print(f"DEBUG: Тип ошибки: {type(e).__name__}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Ошибка при назначении смен: {str(e)}")

@router.delete("/shift-assignments")
async def clear_shift_assignments():
    """Очистить все назначения смен"""
    shift_assignments_storage.clear()
    return {"message": "Назначения смен очищены"}
