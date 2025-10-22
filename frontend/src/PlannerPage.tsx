import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent,
  closestCenter,
  pointerWithin,
  rectIntersection 
} from '@dnd-kit/core';
import { Flight, Machine, Driver, DriverWithShift } from './types';
import { flightAPI, machineAPI, driverAPI, shiftsAPI } from './api';
import { DAY_START, DAY_END, GRID_STEP, toHHMM } from './utils';
import { DraggableFlight } from './components/DraggableFlight';
import { DroppableMachineSlot } from './components/DroppableMachineSlot';
import { DroppableUnassigned } from './components/DroppableUnassigned';
import { PlannerControls } from './components/PlannerControls';

// Интерфейс для изменений назначений
interface FlightAssignmentChange {
  id: string;
  flightId: string;
  flightNo: string;
  fromMachine?: string;
  toMachine?: string;
  originalVehicleId?: string;
  newVehicleId?: string;
}

// Кастомный модификатор для ограничения перемещения только по вертикали
const restrictToVerticalAxis = (args: any) => {
  const { transform, draggingNodeRect, activatorEvent } = args;
  
  if (!draggingNodeRect || !activatorEvent) {
    return transform;
  }

  return {
    x: 0, // Блокируем горизонтальное перемещение
    y: transform.y, // Оставляем вертикальное перемещение
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  };
};

const PlannerPage: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [autolifts, setAutolifts] = useState<string[]>([]); // Добавляем состояние для автолифтов
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Состояние для водителей с назначенными сменами
  const [driversWithShifts, setDriversWithShifts] = useState<DriverWithShift[]>([]);
  
  // Drag and Drop состояние
  const [activeFlight, setActiveFlight] = useState<Flight | null>(null);
  
  // Состояние для отслеживания изменений назначений
  const [pendingChanges, setPendingChanges] = useState<FlightAssignmentChange[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  
  // Водители и назначения машин
  // (уже объявлено выше)
  
  // Состояние для редактируемых времен смены водителей
  const [customShiftTimes, setCustomShiftTimes] = useState<{
    [driverId: string]: {
      shiftStart: number;
      shiftEnd: number;
    }
  }>({});
  
  // Состояние для высоты подвала
  const [basementHeight, setBasementHeight] = useState(120); // Высота для неназначенных рейсов
  const [isResizing, setIsResizing] = useState(false);

  // Новые состояния для управления
  const [horizontalScale, setHorizontalScale] = useState(1);
  // Состояние окон для каждой цепочки отдельно
  const [chainWindows, setChainWindows] = useState<{
    [chainId: string]: {
      loadingWindow?: number;
      unloadingWindow?: number;
    }
  }>({});
  
  // Состояние автолифтов для каждой цепочки
  const [chainAutolifts, setChainAutolifts] = useState<{
    [chainId: string]: string;
  }>({});
  
  // Статусы рейсов
  const [flightStatuses, setFlightStatuses] = useState<Record<string, 'completed' | 'in-progress' | 'planned'>>({});

  // Множественный выбор рейсов для создания скобок
  const [selectedFlights, setSelectedFlights] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Состояние для отображения временного зазора при перетаскивании
  const [hoverMachineId, setHoverMachineId] = useState<string | null>(null);
  const [timeGapInfo, setTimeGapInfo] = useState<{
    machineId: string;
    beforeGap?: {
      flight?: Flight;
      gap: number;
      insertTime: number;
    };
    afterGap?: {
      flight?: Flight;
      gap: number;
      insertTime: number;
    };
  } | null>(null);

  // Функция для получения статуса рейса
  const getFlightStatus = (flight: Flight): 'completed' | 'in-progress' | 'planned' => {
    return flightStatuses[flight.flightNo] || 'planned';
  };

  // Функция для обновления статуса рейса
  const updateFlightStatus = (flightNo: string, status: 'completed' | 'in-progress' | 'planned') => {
    setFlightStatuses(prev => ({
      ...prev,
      [flightNo]: status
    }));
  };

  // Загружаем данные при инициализации
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      console.log('🔄 [DEBUG] loadData стартует...');
      console.log('🔍 [DEBUG] Начальные состояния:');
      console.log('🔍 [DEBUG] customShiftTimes:', customShiftTimes);
      console.log('🔍 [DEBUG] driversWithShifts:', driversWithShifts.length, 'водителей');
      let machinesData = [];
      let driversData = [];
      let flightsData = [];
      let autoliftsResponse;
      try {
        [machinesData, driversData, flightsData, autoliftsResponse] = await Promise.all([
          machineAPI.getMachines(),
          driverAPI.getDrivers().catch((err) => {
            console.error('❌ [DEBUG] Ошибка загрузки водителей:', err);
            throw err;
          }),
          flightAPI.getFlights(),
          fetch('/autolifts.csv')
        ]);
        
        // Дополнительно загружаем водителей со сменами
        try {
          const driversWithShiftsData = await shiftsAPI.getDriversWithShifts();
          console.log('✅ Водители со сменами загружены:', driversWithShiftsData.length);
          setDriversWithShifts(driversWithShiftsData);
        } catch (err) {
          console.warn('⚠️ Ошибка загрузки водителей со сменами:', err);
          // Это не критично, просто назначенные смены не будут отображаться
        }
        
      } catch (err) {
        console.error('❌ [DEBUG] Ошибка в Promise.all при загрузке данных:', err);
        setError('Ошибка загрузки данных');
        setLoading(false);
        return;
      }
      try {
        console.log('✅ Машины загружены:', machinesData.length);
        console.log('✅ Водители загружены:', driversData.length);
        console.log('✅ Рейсы загружены:', flightsData.length);
        console.log('🔍 Первый водитель:', driversData[0]);
        setMachines(machinesData);
        setDrivers(driversData);
        setFlights(flightsData);
        // Парсим автолифты из CSV
        try {
          const autoliftsText = await autoliftsResponse.text();
          console.log('📄 Сырой текст автолифтов:', autoliftsText.substring(0, 200));
          const autoliftsData = autoliftsText
            .split('\n')
            .slice(1)
            .map(line => line.trim())
            .filter(line => line.length > 0);
          console.log('✅ Автолифты загружены:', autoliftsData);
          setAutolifts(autoliftsData);
        } catch (e) {
          console.warn('⚠️ Ошибка загрузки автолифтов, используем резервный список:', e);
          const fallbackAutolifts = ['133', '135', '136', '139', '140', '141', '149', '150', '151', '152', '153', '154', '155', '156', '157', '158', '159', '160'];
          setAutolifts(fallbackAutolifts);
        }
        // НЕ инициализируем customShiftTimes при загрузке, 
        // чтобы getDriverShiftTime использовал данные из drivers как fallback
        console.log('✅ Водители созданы:', driversData.length);
        
        // Загружаем водителей с назначенными сменами при инициализации
        try {
          const driversWithShiftsData = await shiftsAPI.getDriversWithShifts();
          console.log('✅ Загружены водители с назначенными сменами:', driversWithShiftsData.length);
          setDriversWithShifts(driversWithShiftsData);
        } catch (err) {
          console.warn('⚠️ Не удалось загрузить данные о назначенных сменах:', err);
        }
        // Загружаем сохраненные цепочки из localStorage
        const savedChains = localStorage.getItem('flight-chains');
        if (savedChains) {
          try {
            const chainData = JSON.parse(savedChains);
            console.log('✅ Загружены сохраненные цепочки:', Object.keys(chainData).length);
            
            // Применяем сохраненные chainId к рейсам
            const updatedFlights = flightsData.map(flight => ({
              ...flight,
              chainId: chainData[flight.id] || flight.chainId || ''
            }));
            setFlights(updatedFlights);
          } catch (e) {
            console.warn('⚠️ Ошибка загрузки сохраненных цепочек:', e);
          }
        }
        
        // Загружаем сохраненные автолифты для цепочек
        const savedAutolifts = localStorage.getItem('chain-autolifts');
        if (savedAutolifts) {
          try {
            const autoliftData = JSON.parse(savedAutolifts);
            console.log('✅ Загружены сохраненные автолифты:', Object.keys(autoliftData).length);
            setChainAutolifts(autoliftData);
          } catch (e) {
            console.warn('⚠️ Ошибка загрузки сохраненных автолифтов:', e);
          }
        }
        
      } catch (err) {
        console.error('❌ Ошибка загрузки данных:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Сохранение цепочек в localStorage при изменении
  useEffect(() => {
    if (flights.length > 0) {
      const chainData: Record<string, string> = {};
      flights.forEach(flight => {
        if (flight.chainId) {
          chainData[flight.id] = flight.chainId;
        }
      });
      localStorage.setItem('flight-chains', JSON.stringify(chainData));
      console.log('💾 Цепочки сохранены в localStorage');
    }
  }, [flights]);
  
  // Сохранение автолифтов в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('chain-autolifts', JSON.stringify(chainAutolifts));
    console.log('💾 Автолифты сохранены в localStorage');
  }, [chainAutolifts]);

  // Функция для извлечения номера автолифта из машины
  const getAutoliftFromMachine = (machineId: string): string => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return '';
    
    // Извлекаем номер из ID машины (например, "M133" -> "133")
    const autoliftNumber = machine.id.replace('M', '');
    return autoliftNumber;
  };

  // Функция для автоматического назначения автолифта цепочке на основе машины
  const autoAssignAutolift = (chainId: string, machineId: string) => {
    // Если автолифт уже назначен, не меняем
    if (chainAutolifts[chainId]) return;
    
    const autoliftNumber = getAutoliftFromMachine(machineId);
    if (autoliftNumber) {
      setChainAutolifts(prev => ({
        ...prev,
        [chainId]: autoliftNumber
      }));
      console.log(`🔧 Автоматически назначен автолифт ${autoliftNumber} для цепочки ${chainId}`);
    }
  };

  // Функция для получения времени смены водителя (пользовательское или по умолчанию)
  const getDriverShiftTime = (driverId: string) => {
    // Сначала проверяем кастомные настройки
    if (customShiftTimes[driverId]) {
      console.log(`🔍 getDriverShiftTime(${driverId}): возвращаю customShiftTimes:`, customShiftTimes[driverId]);
      return customShiftTimes[driverId];
    }
    
    // Затем проверяем назначенные смены
    const driverWithShift = driversWithShifts.find(d => d.id === driverId);
    if (driverWithShift && driverWithShift.shift_start && driverWithShift.shift_end) {
      // Парсим время смены в минуты (если это строка в формате HH:MM)
      const parseTime = (timeStr: string | number, isEndTime: boolean = false) => {
        if (typeof timeStr === 'number') return timeStr;
        const [hours, minutes] = timeStr.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes;
        
        // Если это время окончания смены и оно меньше или равно 8:00 (480 минут),
        // то считаем его временем следующего дня
        if (isEndTime && totalMinutes <= 8 * 60) {
          totalMinutes += 24 * 60; // Добавляем 24 часа
        }
        
        return totalMinutes;
      };
      
      const result = {
        shiftStart: parseTime(driverWithShift.shift_start, false),
        shiftEnd: parseTime(driverWithShift.shift_end, true)
      };
      console.log(`🔍 getDriverShiftTime(${driverId}): возвращаю driversWithShifts:`, result);
      return result;
    }
    
    // Наконец, используем данные из drivers
    const driver = drivers.find(d => d.id === driverId);
    if (driver) {
      console.log(`🔍 getDriverShiftTime(${driverId}): возвращаю driver data:`, { shiftStart: driver.shift_start, shiftEnd: driver.shift_end });
      return { shiftStart: driver.shift_start, shiftEnd: driver.shift_end };
    }
    
    console.log(`🔍 getDriverShiftTime(${driverId}): возвращаю default:`, { shiftStart: 6 * 60, shiftEnd: 22 * 60 });
    return { shiftStart: 6 * 60, shiftEnd: 22 * 60 };
  };

  // Функция для вычисления длительности смены
  const calculateShiftDuration = (shiftStart: number, shiftEnd: number) => {
    let duration = shiftEnd - shiftStart;
    
    // Если конец смены меньше начала, значит смена переходит через полночь
    if (duration < 0) {
      duration = (24 * 60) + duration; // Добавляем 24 часа
    }
    
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return `${hours}ч ${minutes > 0 ? minutes + 'м' : ''}`.trim();
  };

  // Функция для обновления времени смены водителя
  const updateDriverShiftTime = (driverId: string, field: 'shiftStart' | 'shiftEnd', value: number) => {
    setCustomShiftTimes(prev => ({
      ...prev,
      [driverId]: {
        ...prev[driverId],
        [field]: value
      }
    }));
  };

  // Функция для сокращения имени до формата "Фамилия И.О."
  const formatDriverName = (fullName: string): string => {
    if (!fullName || fullName.trim() === '') return 'Без имени';
    
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]; // Если только одно слово
    
    if (parts.length === 2) {
      // Если два слова: "Фамилия Имя" -> "Фамилия И."
      const surname = parts[0];
      const firstName = parts[1];
      return `${surname} ${firstName.charAt(0).toUpperCase()}.`;
    }
    
    if (parts.length >= 3) {
      // Если три или больше слов: "Фамилия Имя Отчество" -> "Фамилия И.О."
      const surname = parts[0];
      const firstName = parts[1];
      const middleName = parts[2];
      return `${surname} ${firstName.charAt(0).toUpperCase()}.${middleName.charAt(0).toUpperCase()}.`;
    }
    
    return fullName; // Fallback
  };

  // Константы для ширины колонок
  const DRIVER_INFO_WIDTH = 140;  // Ширина колонки с информацией о водителе (уменьшена с 160 до 140)
  const MACHINE_SELECT_WIDTH = 75; // Ширина колонки с выбором машины (увеличена с 65 до 75)
  const SHIFT_TIME_WIDTH = 95; // Ширина колонки с временем смены (увеличена с 80 до 95)
  const WORK_DURATION_WIDTH = 59; // Ширина колонки с расчетным временем работы (уменьшена с 79 до 59)
  const TOTAL_DRIVERS_WIDTH = 369; // Фиксированная общая ширина (140 + 75 + 95 + 59 = 369)

  // Масштаб и настройки отображения
  const basePxPerMin = 4;  // Увеличили с 2 до 4 для лучшего разделения
  const pxPerMin = basePxPerMin * horizontalScale;  // X - масштабируется только горизонтально
  const laneH = 55;      // Увеличили высоту строк с 45 до 55 для отображения полной информации
  const fontPx = Math.max(9, Math.min(11, laneH/5)); // Адаптировали размер шрифта

  // Скролл и «сейчас»
  const mainRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const basementRef = useRef<HTMLDivElement>(null); // Для подвала с неназначенными рейсами
  const driversRef = useRef<HTMLDivElement>(null); // Для синхронизации скролла водителей
  
  useEffect(() => {
    // Синхронизация горизонтального скролла между временной шкалой, основной диаграммой и basement
    const timer = setTimeout(() => {
      const timeHeader = footRef.current;
      const mainArea = mainRef.current;
      const basement = basementRef.current;
      
      console.log('🔄 Настройка синхронизации скролла...');
      
      if (!timeHeader || !mainArea || !basement) {
        console.log('❌ Не все контейнеры найдены:', {
          timeHeader: !!timeHeader, 
          mainArea: !!mainArea,
          basement: !!basement
        });
        return;
      }

      let isScrolling = false;
      
      // Функция синхронизации скролла
      const syncHorizontalScroll = (sourceScrollLeft: number, sourceElement: HTMLElement) => {
        if (isScrolling) return;
        isScrolling = true;
        
        // Синхронизируем все элементы, кроме источника
        if (sourceElement !== timeHeader && timeHeader.scrollLeft !== sourceScrollLeft) {
          timeHeader.scrollLeft = sourceScrollLeft;
        }
        if (sourceElement !== mainArea && mainArea.scrollLeft !== sourceScrollLeft) {
          mainArea.scrollLeft = sourceScrollLeft;
        }
        if (sourceElement !== basement && basement.scrollLeft !== sourceScrollLeft) {
          basement.scrollLeft = sourceScrollLeft;
        }
        
        requestAnimationFrame(() => {
          isScrolling = false;
        });
      };

      // Создаем обработчики для каждого элемента
      const onTimeHeaderScroll = () => {
        syncHorizontalScroll(timeHeader.scrollLeft, timeHeader);
      };
      
      const onMainAreaScroll = () => {
        syncHorizontalScroll(mainArea.scrollLeft, mainArea);
      };
      
      const onBasementScroll = () => {
        syncHorizontalScroll(basement.scrollLeft, basement);
      };

      // Добавляем слушатели на все три элемента
      timeHeader.addEventListener('scroll', onTimeHeaderScroll, { passive: true });
      mainArea.addEventListener('scroll', onMainAreaScroll, { passive: true });
      basement.addEventListener('scroll', onBasementScroll, { passive: true });
      
      console.log('✅ Синхронизация горизонтального скролла настроена для всех трех областей');

      return () => {
        timeHeader.removeEventListener('scroll', onTimeHeaderScroll);
        mainArea.removeEventListener('scroll', onMainAreaScroll);
        basement.removeEventListener('scroll', onBasementScroll);
      };
    }, 500);

    return () => clearTimeout(timer);
  }, []);
  
  // Синхронизация вертикального скролла между основной диаграммой и блоком водителей
  useEffect(() => {
    const mainArea = mainRef.current;
    const driversArea = driversRef.current;
    
    if (!mainArea || !driversArea) return;
    
    let isVerticalScrolling = false;
    
    const syncScrollTop = (sourceScrollTop: number, source: string) => {
      if (isVerticalScrolling) return;
      isVerticalScrolling = true;
      
      if (source !== 'main') mainArea.scrollTop = sourceScrollTop;
      if (source !== 'drivers') driversArea.scrollTop = sourceScrollTop;
      
      requestAnimationFrame(() => {
        isVerticalScrolling = false;
      });
    };
    
    const onMainVerticalScroll = () => {
      if (!isVerticalScrolling) {
        syncScrollTop(mainArea.scrollTop, 'main');
      }
    };
    
    const onDriversVerticalScroll = () => {
      if (!isVerticalScrolling) {
        syncScrollTop(driversArea.scrollTop, 'drivers');
      }
    };
    
    mainArea.addEventListener('scroll', onMainVerticalScroll);
    driversArea.addEventListener('scroll', onDriversVerticalScroll);
    
    return () => {
      mainArea.removeEventListener('scroll', onMainVerticalScroll);
      driversArea.removeEventListener('scroll', onDriversVerticalScroll);
    };
  }, []);

  const [nowLeft, setNowLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      const left = (m - DAY_START) * pxPerMin;
      setNowLeft(left);
    };
    
    tick();
    const timer = setInterval(tick, 10_000);
    return () => clearInterval(timer);
  }, [pxPerMin]);

  // Функция центрирования на красной линии текущего времени
  const centerOnCurrentTime = () => {
    const timeHeader = footRef.current;
    const mainArea = mainRef.current;
    const basement = basementRef.current;
    
    if (!timeHeader || !mainArea || !basement) {
      console.warn('⚠️ Не удалось найти элементы для центрирования на текущем времени');
      return;
    }
    
    // Вычисляем позицию для центрирования красной линии
    const containerWidth = mainArea.clientWidth;
    const scrollPosition = Math.max(0, nowLeft - containerWidth / 2);
    
    console.log('🎯 Центрируем на текущем времени. nowLeft:', nowLeft, 'scrollPosition:', scrollPosition);
    
    // Синхронно устанавливаем скролл для всех трех областей
    timeHeader.scrollLeft = scrollPosition;
    mainArea.scrollLeft = scrollPosition;
    basement.scrollLeft = scrollPosition;
  };

  // Обработка клавиш для управления режимом multi-select
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMultiSelectMode) {
        clearSelection();
        console.log('🔄 Выход из режима multi-select по Escape');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMultiSelectMode]);

  // Очистка overflow при размонтировании компонента
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Импорт CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoAfterImport, setAutoAfterImport] = useState(true);
  
  const onPick = () => fileRef.current?.click();
  
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setLoading(true);
      setError(null); // Очищаем предыдущие ошибки
      console.log('📁 Импортируем файл:', file.name, 'размер:', file.size);
      
      const importedFlights = await flightAPI.importCSV(file);
      console.log('✅ Импорт завершен, получено рейсов:', importedFlights.length);
      
      // Принудительно обновляем состояние
      setFlights([...importedFlights]); // Создаем новый массив для триггера ререндера
      
      if (autoAfterImport) {
        console.log('🤖 Запускаем автоназначение...');
        await handleAutoAssign();
      }
      
      // Очищаем input для возможности повторного импорта того же файла
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    } catch (err) {
      console.error('❌ Ошибка импорта CSV:', err);
      setError(`Ошибка импорта CSV: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  // Автоназначение
  const handleAutoAssign = async () => {
    try {
      console.log('🔍 handleAutoAssign: Начинаем автоназначение');
      setLoading(true);
      
      console.log('🔍 handleAutoAssign: Вызываем flightAPI.autoAssign()');
      const result = await flightAPI.autoAssign();
      console.log('🔍 handleAutoAssign: autoAssign результат:', result);
      
      console.log('🔍 handleAutoAssign: Загружаем обновленные рейсы');
      const updatedFlights = await flightAPI.getFlights();
      console.log('🔍 handleAutoAssign: Получено рейсов:', updatedFlights.length);
      
      setFlights(updatedFlights);
      setError(null);
      console.log('🔍 handleAutoAssign: Автоназначение завершено успешно');
    } catch (err) {
      console.error('🔍 handleAutoAssign: Ошибка автоназначения:', err);
      setError('Ошибка автоназначения');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Автоназначение смен
  const handleAutoAssignShifts = async () => {
    try {
      setLoading(true);
      console.log('🔍 handleAutoAssignShifts: Начинаем назначение смен');
      
      const result = await shiftsAPI.autoAssignShifts();
      console.log('🔍 handleAutoAssignShifts: Результат назначения смен:', result);
      
      // Обновляем данные водителей с новыми сменами
      const driversWithShifts = await shiftsAPI.getDriversWithShifts();
      console.log('🔍 handleAutoAssignShifts: Водители с назначенными сменами:', driversWithShifts);
      
      // Сохраняем данные в состояние
      setDriversWithShifts(driversWithShifts);
      console.log('🔍 handleAutoAssignShifts: Установлено driversWithShifts:', driversWithShifts.length, 'водителей');
      
      // Сбрасываем пользовательские изменения времени смен, чтобы показать актуальные данные
      setCustomShiftTimes({});
      console.log('🔍 handleAutoAssignShifts: Сброшены customShiftTimes');
      
      setError(null);
      console.log('🔍 handleAutoAssignShifts: Назначение смен завершено успешно');
      
      // Можно показать уведомление о результате
      alert(`Назначено смен: ${result.assignments?.length || 0}`);
      
    } catch (err) {
      console.error('🔍 handleAutoAssignShifts: Ошибка назначения смен:', err);
      setError('Ошибка назначения смен');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Сброс назначений
  const handleResetAssign = async () => {
    try {
      setLoading(true);
      await flightAPI.resetAssignments();
      const updatedFlights = await flightAPI.getFlights();
      setFlights(updatedFlights);
      setError(null);
    } catch (err) {
      setError('Ошибка сброса');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Вычисления для отображения - обеспечиваем консистентность
  const actualDayEnd = useMemo(() => {
    // Находим максимальное время окончания среди всех рейсов
    let maxTime = DAY_END;
    
    flights.forEach(flight => {
      if (flight.loadEnd > maxTime) {
        maxTime = flight.loadEnd;
      }
      if (flight.serviceEnd > maxTime) {
        maxTime = flight.serviceEnd;
      }
      if (flight.unloadEnd > maxTime) {
        maxTime = flight.unloadEnd;
      }
    });
    
    // Добавляем буфер и выравниваем по часам
    const bufferTime = 60; // 1 час буфера
    const extendedTime = maxTime + bufferTime;
    const alignedTime = Math.ceil(extendedTime / 60) * 60; // Выравниваем по часам
    
    return Math.max(DAY_END, alignedTime);
  }, [flights]);
  
  const totalWidth = useMemo(() => (actualDayEnd - DAY_START) * pxPerMin, [pxPerMin, actualDayEnd]);
  const gridLines: number[] = useMemo(() => {
    const lines: number[] = [];
    for (let m = DAY_START; m <= actualDayEnd; m += GRID_STEP) {
      lines.push(m);
    }
    return lines;
  }, [actualDayEnd]);
  
  // Особые точки времени для выделения
  const midnightMarkers: number[] = [];
  // Полночь (0:00) - граница дней
  midnightMarkers.push(0);
  // Если в диапазоне есть следующая полночь
  if (actualDayEnd >= 24 * 60) {
    midnightMarkers.push(24 * 60);
  }

  // Группируем рейсы по машинам
  const flightsByMachine = useMemo(() => {
    const byMachine: Record<string, Flight[]> = {};
    machines.forEach(m => byMachine[m.id] = []);
    
    flights.forEach(f => {
      if (f.vehicleId && f.vehicleId.trim() !== '') {
        byMachine[f.vehicleId] = byMachine[f.vehicleId] || [];
        byMachine[f.vehicleId].push(f);
      }
    });
    
    // Сортируем по времени
    Object.values(byMachine).forEach(list => 
      list.sort((a, b) => a.serviceStart - b.serviceStart)
    );
    
    console.log('🔄 Рейсы по машинам/водителям:', byMachine);
    console.log('🔄 Всего рейсов:', flights.length, 'назначенных:', flights.filter(f => f.vehicleId && f.vehicleId.trim() !== '').length);
    
    return byMachine;
  }, [flights, machines]);

  // Функция для расчета слоев перекрывающихся рейсов
  const calculateFlightLayers = useMemo(() => {
    const layersByMachine: Record<string, Array<{ flight: Flight; layer: number }>> = {};
    
    Object.entries(flightsByMachine).forEach(([machineId, machineFlights]) => {
      const flightsWithLayers: Array<{ flight: Flight; layer: number }> = [];
      
      machineFlights.forEach(flight => {
        // Находим подходящий слой для этого рейса
        let layer = 0;
        let placed = false;
        
        while (!placed) {
          // Проверяем, есть ли конфликт с рейсами на этом слое
          const conflictOnLayer = flightsWithLayers.some(item => 
            item.layer === layer && 
            !(flight.serviceEnd <= item.flight.serviceStart || flight.serviceStart >= item.flight.serviceEnd)
          );
          
          if (!conflictOnLayer) {
            flightsWithLayers.push({ flight, layer });
            placed = true;
          } else {
            layer++;
          }
        }
      });
      
      layersByMachine[machineId] = flightsWithLayers;
    });
    
    return layersByMachine;
  }, [flightsByMachine]);

  // Функция для получения количества слоев для машины
  const getLayerCount = (machineId: string): number => {
    const layers = calculateFlightLayers[machineId] || [];
    return Math.max(1, ...layers.map(item => item.layer + 1));
  };

  // Функция для получения количества слоев для водителя (по его driverId как vehicleId)
  const getLayerCountForDriver = (driverId: string): number => {
    const layers = calculateFlightLayers[driverId] || [];
    return Math.max(1, ...layers.map(item => item.layer + 1));
  };

  // Функция для получения слоя рейса
  const getFlightLayer = (flightId: string, machineId: string): number => {
    const layers = calculateFlightLayers[machineId] || [];
    const item = layers.find(item => item.flight.id === flightId);
    return item?.layer || 0;
  };

  // Функция для получения границ цепочки по слоям (верхний и нижний слой)
  const getChainLayerBounds = (chainId: string, machineId: string): { minLayer: number; maxLayer: number; top: number; height: number } => {
    const layers = calculateFlightLayers[machineId] || [];
    const chainLayers = layers.filter(item => item.flight.chainId === chainId).map(item => item.layer);
    
    if (chainLayers.length === 0) {
      return { minLayer: 0, maxLayer: 0, top: 0, height: 25 };
    }
    
    const minLayer = Math.min(...chainLayers);
    const maxLayer = Math.max(...chainLayers);
    const totalLayers = getLayerCount(machineId);
    const flightHeight = laneH - 12; // Увеличили высоту рейса
    const layerSpacing = flightHeight + 6; // Увеличили расстояние между слоями
    
    if (totalLayers === 1) {
      // Если только один слой, скобка центрируется как обычно
      return {
        minLayer: 0,
        maxLayer: 0,
        top: (laneH - 25) / 2, // Центрируем скобку увеличенной высоты
        height: 25 // Увеличили высоту скобки
      };
    } else {
      // Если несколько слоев, скобка охватывает все слои цепочки
      const dynamicLaneH = Math.max(laneH, totalLayers * layerSpacing + 12);
      const totalHeight = totalLayers * layerSpacing;
      const centerY = dynamicLaneH / 2;
      const startY = centerY - totalHeight / 2;
      
      const chainTop = startY + minLayer * layerSpacing;
      const chainBottom = startY + maxLayer * layerSpacing + flightHeight;
      const chainHeight = Math.max(25, chainBottom - chainTop); // Увеличили минимальную высоту
      
      return {
        minLayer,
        maxLayer,
        top: chainTop,
        height: chainHeight
      };
    }
  };

  // Неназначенные рейсы
  const unassignedFlights = flights.filter(f => !f.vehicleId || f.vehicleId.trim() === '');
  
  // Цепочки/скобки по chainId, от kitchenOut первого до unloadEnd последнего
  const chainsByMachine = useMemo(() => {
    // сгруппировать рейсы по водителю и chainId (пустым рейсам даём свой "solo-..." chainId)
    const byM: Record<string, Record<string, Flight[]>> = {};
    for (const d of drivers) byM[d.id] = {};
    for (const f of flights) if (f.vehicleId) {
      const mid = f.vehicleId;
      const cid = f.chainId && f.chainId.length ? f.chainId : `solo-${f.id}`;
      (byM[mid][cid] ??= []).push(f);
    }
    const res: Record<string, Array<{chainId: string; machineId: string; start: number; end: number}>> = {};
    for (const mid of Object.keys(byM)) {
      const chains = byM[mid];
      const arr: Array<{chainId: string; machineId: string; start: number; end: number}> = [];
      for (const cid of Object.keys(chains)) {
        const list = chains[cid].slice().sort((a,b)=>a.serviceStart-b.serviceStart);
        // Показываем скобки только для реальных цепочек (не solo) и если в цепочке больше 1 рейса
        if (cid.startsWith('solo-') || list.length < 2) continue; 
        
        // ПРАВИЛЬНЫЕ границы скобки согласно константам
        const firstFlight = list[0];
        const lastFlight = list[list.length - 1];
        
        // Начало скобки: за LOAD_SMS/LOAD_DMS минут до STD первого рейса
        const isDMS = firstFlight.type === 'DMS';
        const LOAD_TIME = isDMS ? 180 : 155; // LOAD_DMS = 180, LOAD_SMS = 155
        const start = firstFlight.stdMin - LOAD_TIME;
        
        // Конец скобки: через RETURN_UNLOAD после окончания обслуживания последнего рейса  
        const RETURN_UNLOAD = 20;
        const end = lastFlight.serviceEnd + RETURN_UNLOAD;
        arr.push({ chainId: cid, machineId: mid, start: Math.max(DAY_START, start), end: Math.min(actualDayEnd, end) });
      }
      // сортируем только для стабильного рендера
      arr.sort((a,b)=>a.start-b.start);
      res[mid] = arr;
    }
    return res;
  }, [flights, drivers]);
  
  // Алгоритм размещения неназначенных рейсов без наложений
  const arrangeUnassignedFlights = useMemo(() => {
    const flightsWithPositions = [...unassignedFlights].sort((a, b) => a.serviceStart - b.serviceStart);
    const lanes: { [key: number]: { start: number; end: number }[] } = {};
    
    return flightsWithPositions.map(flight => {
      let laneIndex = 0;
      
      // Найдем свободную полосу
      while (lanes[laneIndex]) {
        const hasConflict = lanes[laneIndex].some(existing => 
          !(flight.serviceEnd <= existing.start || flight.serviceStart >= existing.end)
        );
        if (!hasConflict) break;
        laneIndex++;
      }
      
      // Добавим рейс в эту полосу
      if (!lanes[laneIndex]) lanes[laneIndex] = [];
      lanes[laneIndex].push({ start: flight.serviceStart, end: flight.serviceEnd });
      
      return { ...flight, laneIndex };
    });
  }, [unassignedFlights]);

  // Custom collision detection для приоритизации области неназначенных
  const customCollisionDetection = (args: any) => {
    const { droppableRects, droppableContainers, active, pointerCoordinates } = args;
    
    if (!pointerCoordinates) {
      return rectIntersection(args);
    }
    
    // Сначала проверяем, находимся ли мы в области неназначенных
    const unassignedContainer = droppableContainers.find((container: any) => container.id === 'unassigned');
    if (unassignedContainer) {
      const rect = droppableRects.get('unassigned');
      if (rect) {
        const isWithinUnassigned = 
          pointerCoordinates.x >= rect.left &&
          pointerCoordinates.x <= rect.right &&
          pointerCoordinates.y >= rect.top &&
          pointerCoordinates.y <= rect.bottom;
        
        if (isWithinUnassigned) {
          return [{ id: 'unassigned' }];
        }
      }
    }
    
    // Если не в области неназначенных, используем стандартный алгоритм
    return rectIntersection(args);
  };

  // Функция для вычисления временных зазоров при вставке рейса
  const calculateTimeGap = (machineId: string, insertTime: number) => {
    const machineFlights = flightsByMachine[machineId] || [];
    const sortedFlights = [...machineFlights].sort((a, b) => a.serviceStart - b.serviceStart);
    
    if (!activeFlight) return { machineId };
    
    const draggedFlightStart = activeFlight.serviceStart;
    const draggedFlightEnd = activeFlight.serviceEnd;
    const draggedFlightDuration = draggedFlightEnd - draggedFlightStart;
    
    let beforeFlight: Flight | undefined;
    let afterFlight: Flight | undefined;
    
    // Находим рейсы до и после позиции вставки
    for (let i = 0; i < sortedFlights.length; i++) {
      const flight = sortedFlights[i];
      if (flight.serviceStart <= insertTime) {
        beforeFlight = flight;
      }
      if (flight.serviceStart > insertTime && !afterFlight) {
        afterFlight = flight;
        break;
      }
    }
    
    const result: {
      machineId: string;
      beforeGap?: { flight?: Flight; gap: number; insertTime: number };
      afterGap?: { flight?: Flight; gap: number; insertTime: number };
    } = { machineId };
    
    // Вычисляем зазор слева от перетаскиваемого рейса (от начала обслуживания)
    if (beforeFlight) {
      const beforeGap = draggedFlightStart - beforeFlight.serviceEnd;
      if (beforeGap >= 0) {
        result.beforeGap = {
          flight: beforeFlight,
          gap: beforeGap,
          insertTime: beforeFlight.serviceEnd
        };
      }
    } else {
      // Перед первым рейсом
      const beforeGap = draggedFlightStart - DAY_START;
      if (beforeGap >= 0) {
        result.beforeGap = {
          gap: beforeGap,
          insertTime: DAY_START
        };
      }
    }
    
    // Вычисляем зазор справа от перетаскиваемого рейса (от конца обслуживания)
    if (afterFlight) {
      const afterGap = afterFlight.serviceStart - draggedFlightEnd;
      if (afterGap >= 0) {
        result.afterGap = {
          flight: afterFlight,
          gap: afterGap,
          insertTime: draggedFlightEnd
        };
      }
    } else {
      // После последнего рейса
      const afterGap = actualDayEnd - draggedFlightEnd;
      if (afterGap >= 0) {
        result.afterGap = {
          gap: afterGap,
          insertTime: draggedFlightEnd
        };
      }
    }
    
    return result;
  };
  
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const flight = flights.find(f => f.id === active.id);
    if (flight) {
      setActiveFlight(flight);
      setIsDragging(true);
      // Блокируем скролл страницы во время перетаскивания
      document.body.style.overflow = 'hidden';
    }
  };

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    
    if (!active || !over || !activeFlight) return;
    
    // Если наводимся на машину, вычисляем временной зазор
    if (over.data.current?.type === 'machine') {
      const machineId = over.id as string;
      
      // Используем время начала обслуживания рейса как позицию вставки
      const currentTime = activeFlight.serviceStart;
      
      const gapInfo = calculateTimeGap(machineId, currentTime);
      setTimeGapInfo(gapInfo);
      setHoverMachineId(machineId);
    } else {
      // Сбрасываем информацию о зазоре
      setTimeGapInfo(null);
      setHoverMachineId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFlight(null);
    setIsDragging(false);
    setTimeGapInfo(null); // Очищаем информацию о зазоре
    setHoverMachineId(null);
    // Восстанавливаем скролл страницы
    document.body.style.overflow = '';
    
    console.log('🎯 DragEnd:', { 
      activeId: active.id, 
      overId: over?.id, 
      overType: over?.data.current?.type
    });
    
    if (!over) {
      return;
    }
    
    const flightId = active.id as string;
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;
    
    // Если перетаскиваем на машину
    if (over.data.current?.type === 'machine') {
      const machineId = over.id as string;
      const machine = machines.find(m => m.id === machineId);
      
      // Проверяем, действительно ли это изменение (не на ту же машину)
      if (flight.vehicleId === machineId) {
        return; // Никаких изменений не было
      }
      
      // Проверяем, есть ли уже изменение для этого рейса
      const existingChangeIndex = pendingChanges.findIndex(c => c.flightId === flight.id);
      
      if (existingChangeIndex >= 0) {
        // Обновляем существующее изменение
        const existingChange = pendingChanges[existingChangeIndex];
        
        // Если возвращаем на исходную машину, удаляем изменение
        if (existingChange.originalVehicleId === machineId) {
          setPendingChanges(prev => prev.filter(c => c.flightId !== flight.id));
          setFlights(prev => prev.map(f => 
            f.id === flightId ? { ...f, vehicleId: machineId } : f
          ));
          return;
        }
        
        // Иначе обновляем изменение
        const updatedChange: FlightAssignmentChange = {
          ...existingChange,
          toMachine: machine?.name || machineId,
          newVehicleId: machineId
        };
        
        setPendingChanges(prev => prev.map(c => 
          c.id === existingChange.id ? updatedChange : c
        ));
      } else {
        // Создаем новое изменение
        const changeId = Date.now().toString();
        const change: FlightAssignmentChange = {
          id: changeId,
          flightId: flight.id,
          flightNo: flight.flightNo,
          fromMachine: flight.vehicleId ? machines.find(m => m.id === flight.vehicleId)?.name : 'Неназначенные',
          toMachine: machine?.name || machineId,
          originalVehicleId: flight.vehicleId,
          newVehicleId: machineId
        };
        
        setPendingChanges(prev => [...prev, change]);
      }
      
      // Локально обновляем рейс
      setFlights(prev => prev.map(f => 
        f.id === flightId ? { ...f, vehicleId: machineId } : f
      ));
    }
    
    // Если перетаскиваем в неназначенные
    if (over.data.current?.type === 'unassigned') {
      // Проверяем, действительно ли это изменение (не был ли уже неназначенным)
      if (!flight.vehicleId) {
        return; // Никаких изменений не было
      }
      
      // Проверяем, есть ли уже изменение для этого рейса
      const existingChangeIndex = pendingChanges.findIndex(c => c.flightId === flight.id);
      
      if (existingChangeIndex >= 0) {
        const existingChange = pendingChanges[existingChangeIndex];
        
        // Если возвращаем к исходному неназначенному состоянию, удаляем изменение
        if (!existingChange.originalVehicleId) {
          setPendingChanges(prev => prev.filter(c => c.flightId !== flight.id));
          setFlights(prev => prev.map(f => 
            f.id === flightId ? { ...f, vehicleId: '' } : f
          ));
          return;
        }
        
        // Иначе обновляем изменение
        const updatedChange: FlightAssignmentChange = {
          ...existingChange,
          toMachine: 'Неназначенные',
          newVehicleId: ''
        };
        
        setPendingChanges(prev => prev.map(c => 
          c.id === existingChange.id ? updatedChange : c
        ));
      } else {
        const changeId = Date.now().toString();
        const machine = machines.find(m => m.id === flight.vehicleId);
        const change: FlightAssignmentChange = {
          id: changeId,
          flightId: flight.id,
          flightNo: flight.flightNo,
          fromMachine: machine?.name || flight.vehicleId,
          toMachine: 'Неназначенные',
          originalVehicleId: flight.vehicleId,
          newVehicleId: ''
        };
        
        setPendingChanges(prev => [...prev, change]);
      }
      
      // Локально обновляем рейс
      setFlights(prev => prev.map(f => 
        f.id === flightId ? { ...f, vehicleId: '' } : f
      ));
    }
  };

  // Функции для работы с изменениями назначений
  const handleRemoveChange = (changeId: string) => {
    const change = pendingChanges.find(c => c.id === changeId);
    if (!change) return;
    
    // Возвращаем рейс к оригинальному состоянию
    setFlights(prev => prev.map(f => 
      f.id === change.flightId 
        ? { ...f, vehicleId: change.originalVehicleId || '' }
        : f
    ));
    
    // Удаляем изменение из списка
    setPendingChanges(prev => prev.filter(c => c.id !== changeId));
  };
  
  const handleApplyChanges = async () => {
    try {
      setLoading(true);
      
      // Применяем все изменения на сервере
      for (const change of pendingChanges) {
        if (change.newVehicleId) {
          await flightAPI.assignFlight(change.flightId, change.newVehicleId);
        } else {
          await flightAPI.unassignFlight(change.flightId);
        }
      }
      
      // Обновляем данные с сервера
      const updatedFlights = await flightAPI.getFlights();
      setFlights(updatedFlights);
      
      // Очищаем список изменений
      setPendingChanges([]);
      setShowSaveDialog(false);
      
    } catch (err) {
      setError('Ошибка применения изменений');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancelChanges = () => {
    // Возвращаем все рейсы к оригинальному состоянию
    let updatedFlights = [...flights];
    
    pendingChanges.forEach(change => {
      updatedFlights = updatedFlights.map(f => 
        f.id === change.flightId 
          ? { ...f, vehicleId: change.originalVehicleId || '' }
          : f
      );
    });
    
    setFlights(updatedFlights);
    setPendingChanges([]);
    setShowSaveDialog(false);
  };
    // Функции для работы с изменениями назначений
  
  // Функции для работы с множественным выбором и скобками
  const toggleFlightSelection = (flightId: string) => {
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;

    setSelectedFlights(prev => {
      const newSelected = new Set(prev);
      
      if (newSelected.has(flightId)) {
        // Убираем рейс из выбора
        newSelected.delete(flightId);
      } else {
        // Добавляем рейс в выбор, но только если он на той же машине
        if (newSelected.size > 0) {
          // Проверяем что все уже выбранные рейсы на той же машине
          const selectedFlightIds = Array.from(newSelected);
          const selectedFlightObjects = flights.filter(f => selectedFlightIds.includes(f.id));
          const firstMachine = selectedFlightObjects[0]?.vehicleId;
          
          if (flight.vehicleId !== firstMachine) {
            // Показываем сообщение и не добавляем рейс
            console.log('Нельзя выбрать рейсы с разных машин');
            return prev; // Возвращаем предыдущий набор без изменений
          }
        }
        
        // Все проверки пройдены - добавляем рейс
        newSelected.add(flightId);
      }
      return newSelected;
    });
  };

  const clearSelection = () => {
    setSelectedFlights(new Set());
    setIsMultiSelectMode(false);
    setSelectedChain(null);
  };

  const handleChainClick = (chainId: string) => {
    setSelectedChain(selectedChain === chainId ? null : chainId);
  };

  const breakSelectedChain = () => {
    if (!selectedChain) {
      alert('Выберите скобку для разбития, кликнув по ней');
      return;
    }
    
    breakChain(selectedChain);
    setSelectedChain(null);
  };

  const createChainFromSelected = () => {
    if (selectedFlights.size < 2) {
      alert('Выберите минимум 2 рейса для создания скобки');
      return;
    }

    // Проверяем что все выбранные рейсы на одной машине
    const selectedFlightIds = Array.from(selectedFlights);
    const selectedFlightObjects = flights.filter(f => selectedFlightIds.includes(f.id));
    
    if (selectedFlightObjects.length === 0) return;
    
    const firstMachine = selectedFlightObjects[0].vehicleId;
    const allOnSameMachine = selectedFlightObjects.every(f => f.vehicleId === firstMachine);
    
    if (!allOnSameMachine) {
      alert('Все рейсы должны быть на одной машине для создания скобки');
      return;
    }

    if (!firstMachine) {
      alert('Нельзя создать скобку для неназначенных рейсов');
      return;
    }

    // Создаем новый chainId
    const newChainId = `chain-${Date.now()}`;
    
    // Обновляем рейсы
    setFlights(prev => prev.map(f => 
      selectedFlightIds.includes(f.id) 
        ? { ...f, chainId: newChainId }
        : f
    ));

    // Автоматически назначаем автолифт для новой цепочки на основе машины
    autoAssignAutolift(newChainId, firstMachine);

    // Очищаем выбор
    clearSelection();
  };

  const breakChain = (chainId: string) => {
    if (!chainId || chainId.startsWith('solo-')) return;
    
    // Убираем chainId у всех рейсов в этой скобке
    setFlights(prev => prev.map(f => 
      f.chainId === chainId 
        ? { ...f, chainId: '' }
        : f
    ));
  };

  const handleFlightClick = (event: React.MouseEvent, flightId: string) => {
    if (event.shiftKey) {
      setIsMultiSelectMode(true);
      
      const flight = flights.find(f => f.id === flightId);
      if (!flight) return;
      
      // Проверяем совместимость с уже выбранными рейсами
      if (selectedFlights.size > 0) {
        const selectedFlightIds = Array.from(selectedFlights);
        const selectedFlightObjects = flights.filter(f => selectedFlightIds.includes(f.id));
        const firstMachine = selectedFlightObjects[0]?.vehicleId;
        
        if (flight.vehicleId !== firstMachine) {
          // Визуальная обратная связь - подсветим неудачную попытку
          console.log('❌ Нельзя выбрать рейсы с разных машин');
          
          // Временно подсветим рейс красным
          const element = event.currentTarget as HTMLElement;
          const originalBorder = element.style.border;
          element.style.border = '3px solid #DC2626';
          element.style.backgroundColor = '#FEE2E2';
          
          setTimeout(() => {
            element.style.border = originalBorder;
            element.style.backgroundColor = '';
          }, 500);
          
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      
      toggleFlightSelection(flightId);
      event.preventDefault();
      event.stopPropagation();
    } else if (!isMultiSelectMode) {
      // Обычный клик без shift - очищаем выбор
      clearSelection();
    }
  };
  
  // Функция для назначения машины водителю
  const handleDriverMachineChange = (driverId: string, machineId: string) => {
    setDrivers(prevDrivers => 
      prevDrivers.map(d => 
        d.id === driverId 
          ? { ...d, machineId: machineId || '' }
          : { ...d, machineId: d.machineId === machineId ? '' : d.machineId } // Убираем машину у других водителей
      )
    );
  };
  
  // Функция для проверки превышения времени смены
  const checkDriverOvertime = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return false;
    
    // Получаем рейсы водителя напрямую по его ID (vehicleId = driverId)
    const driverFlights = flightsByMachine[driverId] || [];
    if (driverFlights.length === 0) return false;
    
    const firstFlight = driverFlights[0];
    const lastFlight = driverFlights[driverFlights.length - 1];
    
    const shiftTime = getDriverShiftTime(driver.id);
    return firstFlight.serviceStart < shiftTime.shiftStart || lastFlight.serviceEnd > shiftTime.shiftEnd;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Загрузка...</div>
      </div>
    );
  }

  return (
    <DndContext 
      onDragStart={handleDragStart} 
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveFlight(null);
        setIsDragging(false);
        setTimeGapInfo(null);
        setHoverMachineId(null);
        document.body.style.overflow = '';
      }}
      autoScroll={false}
      collisionDetection={customCollisionDetection}
    >
      <div className="h-screen flex flex-col overflow-hidden" style={{ 
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        cursor: isResizing ? 'ns-resize' : 'default' 
      }}>
      {/* Компактный заголовок в спокойном стиле */}
      <div className="shadow-md border-b flex-none z-50" style={{ 
        background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
        height: '32px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 className="text-xl font-semibold" style={{ 
          margin: 0, 
          lineHeight: '1',
          color: '#475569'
        }}>
          Аэромар
        </h1>
      </div>

      {/* Компактная панель действий */}
      <div className="border-b px-4 py-2 flex-none z-40" style={{
        background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div className="flex items-center justify-between">
          {/* Левая группа - основные действия */}
          <div className="flex items-center gap-2">
            {/* Импорт CSV */}
            <button
              onClick={onPick}
              disabled={loading}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0c4a6e',
                borderColor: '#7dd3fc',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Импорт CSV файла"
            >
              Импорт
            </button>
            
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={onFile}
              className="hidden"
            />
            
            {/* Автоназначение */}
            <button
              onClick={handleAutoAssign}
              disabled={loading || flights.length === 0}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0c4a6e',
                borderColor: '#7dd3fc',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Автоматическое назначение рейсов"
            >
              Авто
            </button>

            {/* Назначение смен */}
            <button
              onClick={handleAutoAssignShifts}
              disabled={loading}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#f0fdf4',
                color: '#166534',
                borderColor: '#86efac',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Автоматическое назначение смен водителям"
            >
              Смены
            </button>
            
            {/* Сброс */}
            <button
              onClick={handleResetAssign}
              disabled={loading}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0c4a6e',
                borderColor: '#7dd3fc',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Сброс всех назначений"
            >
              Сброс
            </button>

            {/* Обновить */}
            <button
              onClick={async () => {
                console.log('🔄 Перезагружаем данные...');
                try {
                  setLoading(true);
                  const [machinesData, flightsData] = await Promise.all([
                    machineAPI.getMachines(),
                    flightAPI.getFlights()
                  ]);
                  console.log('✅ Обновлены данные - машины:', machinesData.length, 'рейсы:', flightsData.length);
                  setMachines(machinesData);
                  setFlights(flightsData);
                } catch (err) {
                  console.error('❌ Ошибка обновления:', err);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#e0f2fe',
                color: '#0c4a6e',
                borderColor: '#7dd3fc',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Обновить данные"
            >
              Обновить
            </button>
            
            {/* Центрирование на текущем времени */}
            <button
              onClick={centerOnCurrentTime}
              disabled={loading}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: '#fef3c7',
                color: '#92400e',
                borderColor: '#fde68a',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Центрировать диаграмму на текущем времени"
            >
              К текущему времени
            </button>
            
            {/* Сохранить расстановку */}
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={loading || pendingChanges.length === 0}
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
              style={{
                backgroundColor: pendingChanges.length > 0 ? '#e0f2fe' : '#f1f5f9',
                color: pendingChanges.length > 0 ? '#0c4a6e' : '#64748b',
                borderColor: pendingChanges.length > 0 ? '#7dd3fc' : '#cbd5e1',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title={`Сохранить изменения (${pendingChanges.length})`}
            >
              Сохранить {pendingChanges.length > 0 && `(${pendingChanges.length})`}
            </button>
            
            {/* Управление скобками */}
            <div className="flex items-center gap-1 border-l pl-3 ml-2">
              <button
                onClick={createChainFromSelected}
                disabled={selectedFlights.size < 2}
                className="px-3 py-1 text-xs font-medium rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: selectedFlights.size >= 2 ? '#e0f2fe' : '#f8fafc',
                  color: selectedFlights.size >= 2 ? '#0369a1' : '#94a3b8',
                  borderColor: selectedFlights.size >= 2 ? '#7dd3fc' : '#e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                title="Создать скобку из выбранных рейсов (Shift+клик для выбора)"
              >
                Скобка ({selectedFlights.size})
              </button>
              
              <button
                onClick={breakSelectedChain}
                disabled={!selectedChain}
                className="px-3 py-1 text-xs font-medium rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: selectedChain ? '#fecaca' : '#f8fafc',
                  color: selectedChain ? '#dc2626' : '#94a3b8',
                  borderColor: selectedChain ? '#fca5a5' : '#e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                title="Разбить выбранную скобку (сначала кликните по скобке)"
              >
                Разбить
              </button>
              
              <button
                onClick={clearSelection}
                disabled={selectedFlights.size === 0}
                className="px-3 py-1 text-xs font-medium rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: selectedFlights.size > 0 ? '#fef3c7' : '#f8fafc',
                  color: selectedFlights.size > 0 ? '#92400e' : '#94a3b8',
                  borderColor: selectedFlights.size > 0 ? '#fde68a' : '#e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                title="Очистить выбор"
              >
                Очистить
              </button>
            </div>
            
            {/* Индикатор режима multi-select */}
            {isMultiSelectMode && (
              <div className="px-2 py-1 text-xs font-medium rounded border transition-all duration-200"
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  borderColor: '#fde68a',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                title="Режим выбора рейсов активен. Перетаскивание отключено. Нажмите 'Очистить' для выхода."
              >
                🎯 Режим выбора
              </div>
            )}
          </div>

          {/* Правая группа - настройки */}
          <div className="flex items-center gap-2">
            {/* Автоназначение после импорта в стиле кнопки */}
            <label 
              className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200 flex items-center gap-2 cursor-pointer"
              style={{
                backgroundColor: autoAfterImport ? '#e0f2fe' : '#f8fafc',
                color: autoAfterImport ? '#0c4a6e' : '#64748b',
                borderColor: autoAfterImport ? '#7dd3fc' : '#e2e8f0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              title="Автоматически назначать рейсы после импорта"
            >
              <input
                type="checkbox"
                checked={autoAfterImport}
                onChange={e => setAutoAfterImport(e.target.checked)}
                className="hidden"
              />
              <span className="w-3 h-3 rounded border flex items-center justify-center text-xs"
                style={{
                  backgroundColor: autoAfterImport ? '#0c4a6e' : 'transparent',
                  borderColor: autoAfterImport ? '#0c4a6e' : '#94a3b8',
                  color: 'white'
                }}
              >
                {autoAfterImport && '✓'}
              </span>
              Автоназначение
            </label>
            
            {/* Масштаб в стиле кнопки */}
            <div className="flex items-center">
              <select
                value={horizontalScale}
                onChange={(e) => setHorizontalScale(Number(e.target.value))}
                className="px-3 py-1 text-xs font-semibold rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: '#e0f2fe',
                  color: '#0c4a6e',
                  borderColor: '#7dd3fc',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  cursor: 'pointer'
                }}
                title="Масштаб диаграммы"
              >
                <option value={0.5}>Масштаб 50%</option>
                <option value={1}>Масштаб 100%</option>
                <option value={1.5}>Масштаб 150%</option>
                <option value={2}>Масштаб 200%</option>
              </select>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="mt-1 p-2 rounded text-xs" style={{
            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            color: '#dc2626',
            border: '1px solid #fca5a5',
            boxShadow: '0 1px 2px rgba(220, 38, 38, 0.1)'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Основной контент */}
      <div className="flex-1 flex flex-col min-h-0">
          {/* Главная диаграмма Ганта */}
          <div 
            className="overflow-auto border-b"
            style={{ 
              height: `calc(100vh - 120px - ${basementHeight}px)`,
              minHeight: '200px'
            }}
          >
            {/* Заголовок с временной шкалой */}
            <div className="flex-none border-b flex z-30" style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              borderBottomColor: '#cbd5e1',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              height: `${laneH}px`,
              boxSizing: 'border-box'
            }}>
              {/* Разделенный заголовок для водителей и автолифтов */}
              <div className="flex-none flex" style={{ 
                width: `${TOTAL_DRIVERS_WIDTH}px`,
                borderRight: '1px solid #e5e7eb'
              }}>
                {/* Заголовок "Работник" */}
                <div 
                  className="flex-none px-2 py-1 flex items-center justify-center"
                  style={{ 
                    width: `${DRIVER_INFO_WIDTH}px`, 
                    height: '100%',
                    borderRight: '1px solid #cbd5e1',
                    background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1), inset -1px 0 3px rgba(0,0,0,0.05)',
                    boxSizing: 'border-box'
                  }}
                >
                  <div className="text-xs font-semibold" style={{ 
                    color: '#475569'
                  }}>
                    Работник
                  </div>
                </div>
                
                {/* Заголовок "Автолифт" */}
                <div 
                  className="flex-none px-2 py-1 flex items-center justify-center"
                  style={{ 
                    width: `${MACHINE_SELECT_WIDTH}px`, 
                    height: '100%',
                    borderRight: '1px solid #cbd5e1',
                    background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1), inset -1px 0 3px rgba(0,0,0,0.05)',
                    boxSizing: 'border-box'
                  }}
                >
                  <div className="text-xs font-semibold" style={{ 
                    color: '#475569'
                  }}>
                    Автолифт
                  </div>
                </div>
                
                {/* Заголовок "Время смены" */}
                <div 
                  className="flex-none px-2 py-1 flex items-center justify-center"
                  style={{ 
                    width: `${SHIFT_TIME_WIDTH}px`, 
                    height: '100%',
                    borderRight: '1px solid #cbd5e1',
                    background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1), inset -1px 0 3px rgba(0,0,0,0.05)',
                    boxSizing: 'border-box'
                  }}
                >
                  <div className="text-xs font-semibold" style={{ 
                    color: '#475569'
                  }}>
                    Время смены
                  </div>
                </div>
                
                {/* Заголовок "Длительность" */}
                <div 
                  className="flex-none px-2 py-1 flex items-center justify-center"
                  style={{ 
                    width: `${WORK_DURATION_WIDTH}px`, 
                    height: '100%',
                    background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1), inset -1px 0 3px rgba(0,0,0,0.05)',
                    boxSizing: 'border-box'
                  }}
                >
                  <div className="text-xs font-semibold" style={{ 
                    color: '#475569'
                  }}>
                    Δt
                  </div>
                </div>
              </div>
              
              {/* Временная шкала с прямым скроллом */}
              <div 
                ref={footRef}
                className="flex-1 overflow-x-auto overflow-y-hidden"
                style={{ height: `${laneH}px`, boxSizing: 'border-box' }}
              >
                <div style={{ 
                  position: 'relative', 
                  width: totalWidth,
                  minWidth: totalWidth,
                  height: '100%',
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                }}>
                    {gridLines.map(minutes => {
                      const isHour = minutes % 60 === 0;
                      const isMidnight = minutes === 0 || minutes === 24 * 60;
                      
                      return (
                        <div
                          key={minutes}
                          style={{
                            position: 'absolute',
                            left: (minutes - DAY_START) * pxPerMin,
                            top: 0,
                            bottom: 0,
                            width: isMidnight ? '3px' : '1px',
                            backgroundColor: isMidnight ? '#3b82f6' : isHour ? '#64748b' : '#cbd5e1',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            paddingBottom: '2px',
                            boxShadow: isMidnight ? '0 0 4px rgba(59,130,246,0.5)' : isHour ? '0 0 2px rgba(100,116,139,0.3)' : 'none',
                            zIndex: isMidnight ? 5 : 1
                          }}
                        >
                          {isHour && (
                            <span style={{
                              fontSize: '7px',
                              color: isMidnight ? '#1d4ed8' : '#475569',
                              backgroundColor: 'rgba(255,255,255,0.9)',
                              padding: '1px 3px',
                              borderRadius: '2px',
                              border: `1px solid ${isMidnight ? '#3b82f6' : '#cbd5e1'}`,
                              fontWeight: isMidnight ? '700' : '500',
                              textShadow: '0 1px 1px rgba(255,255,255,0.8)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              whiteSpace: 'nowrap'
                            }}>
                              {toHHMM(minutes)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Линия "сейчас" в заголовке */}
                    <div
                      style={{
                        position: 'absolute',
                        left: nowLeft,
                        top: 0,
                        bottom: 0,
                        width: '2px',
                        background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
                        zIndex: 10,
                        boxShadow: '0 0 8px rgba(239,68,68,0.6), 0 0 4px rgba(239,68,68,0.8)'
                      }}
                    />
                  </div>
                </div>
            </div>
            
            {/* Область с машинами и рейсами */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="flex" style={{ minHeight: '100%' }}>
              {/* Фиксированный столбец с водителями и машинами */}
              <div 
                ref={driversRef}
                className="flex-none bg-white sticky left-0 z-10"
                style={{ 
                  width: `${TOTAL_DRIVERS_WIDTH}px`, 
                  borderRight: '1px solid #e5e7eb',
                  boxShadow: '2px 0 8px rgba(0,0,0,0.1)'
                }}
              >
                {drivers.map((driver, index) => {
                  const hasOvertime = checkDriverOvertime(driver.id);
                  const machine = driver.machineId && driver.machineId !== '' ? machines.find(m => m.id === driver.machineId) : null;
                  const layerCount = getLayerCountForDriver(driver.id);
                  const flightHeight = laneH - 12;
                  const layerSpacing = flightHeight + 6;
                  const dynamicLaneH = layerCount === 1 ? laneH : Math.max(laneH, layerCount * layerSpacing + 12);
                  
                  return (
                    <div key={driver.id} className="border-b border-gray-200 flex" style={{ height: dynamicLaneH, boxSizing: 'border-box' }}>
                      {/* Информация о водителе */}
                      <div 
                        className={`flex-none px-2 py-1 ${hasOvertime ? 'bg-red-100' : 'bg-white'} flex flex-col justify-center`} 
                        style={{ 
                          width: `${DRIVER_INFO_WIDTH}px`, 
                          borderRight: '1px solid #e5e7eb',
                          boxSizing: 'border-box'
                        }}
                      >
                        {/* Имя водителя в сокращенном формате */}
                        <div style={{ 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          color: '#111827',
                          lineHeight: '1.2',
                          marginBottom: '2px'
                        }}>
                          {formatDriverName(driver.full_name)}
                        </div>
                        
                        {/* Время смены (оригинальное для справки) */}
                        <div style={{ 
                          fontSize: '9px', 
                          color: '#6b7280',
                          lineHeight: '1.2'
                        }}>
                          {(() => {
                            const driverWithShift = driversWithShifts.find(d => d.id === driver.id);
                            if (driverWithShift && driverWithShift.shift_start && driverWithShift.shift_end) {
                              return `${driverWithShift.shift_start} - ${driverWithShift.shift_end}`;
                            }
                            return `${toHHMM(driver.shift_start)} - ${toHHMM(driver.shift_end)}`;
                          })()}
                        </div>
                      </div>
                      
                      {/* Панель назначения машины */}
                      <div 
                        className={`flex-none px-2 py-1 bg-white flex flex-col justify-center`} 
                        style={{ 
                          width: `${MACHINE_SELECT_WIDTH}px`,
                          borderRight: '1px solid #e5e7eb',
                          boxSizing: 'border-box'
                        }}
                      >
                        <select
                          value={driver.machineId || ''}
                          onChange={(e) => handleDriverMachineChange(driver.id, e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white mb-1"
                          style={{ fontSize: '10px' }}
                        >
                          <option value="">Выберите машину</option>
                          {machines.map(machine => (
                            <option key={machine.id} value={machine.id}>
                              {machine.name}
                            </option>
                          ))}
                        </select>
                        
                        {/* Отображаем название назначенной машины или статус */}
                        <div style={{ fontSize: '9px', color: '#6b7280', lineHeight: '1.2' }}>
                          {driver.machineId && driver.machineId !== '' 
                            ? machines.find(m => m.id === driver.machineId)?.name || 'Машина не найдена'
                            : 'Машина не назначена (необязательно)'
                          }
                        </div>
                        
                        {/* Информационное сообщение */}
                        <div className="text-xs text-gray-400" style={{ fontSize: '8px', lineHeight: '1.2' }}>
                          ℹ️ Можно назначить машину
                        </div>
                      </div>
                      
                      {/* Колонка редактируемого времени смены */}
                      <div 
                        className="flex-none bg-white flex flex-col justify-center items-center gap-1" 
                        style={{ 
                          width: `${SHIFT_TIME_WIDTH}px`,
                          borderRight: '1px solid #e5e7eb',
                          boxSizing: 'border-box',
                          padding: '1px 2px'
                        }}
                      >
                        {/* Время начала смены */}
                        <input
                          type="time"
                          value={toHHMM(getDriverShiftTime(driver.id).shiftStart)}
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            updateDriverShiftTime(driver.id, 'shiftStart', hours * 60 + minutes);
                          }}
                          className="text-xs border border-gray-300 rounded bg-white"
                          style={{ 
                            fontSize: '9px', 
                            height: '16px', 
                            width: '65px',
                            padding: '1px 3px',
                            textAlign: 'center'
                          }}
                        />
                        
                        {/* Время окончания смены */}
                        <input
                          type="time"
                          value={toHHMM(getDriverShiftTime(driver.id).shiftEnd)}
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            updateDriverShiftTime(driver.id, 'shiftEnd', hours * 60 + minutes);
                          }}
                          className="text-xs border border-gray-300 rounded bg-white"
                          style={{ 
                            fontSize: '9px', 
                            height: '16px', 
                            width: '65px',
                            padding: '1px 3px',
                            textAlign: 'center'
                          }}
                        />
                      </div>
                      
                      {/* Колонка продолжительности смены */}
                      <div 
                        className="flex-none px-1 py-1 bg-gray-50 flex items-center justify-center" 
                        style={{ 
                          width: `${WORK_DURATION_WIDTH}px`,
                          boxSizing: 'border-box'
                        }}
                      >
                        <div className="text-center">
                          <div style={{ 
                            fontSize: '11px', 
                            fontWeight: '600', 
                            color: '#374151',
                            lineHeight: '1.2'
                          }}>
                            {(() => {
                              const shiftTime = getDriverShiftTime(driver.id);
                              return calculateShiftDuration(shiftTime.shiftStart, shiftTime.shiftEnd);
                            })()}
                          </div>
                          <div style={{ 
                            fontSize: '8px', 
                            color: '#6b7280',
                            lineHeight: '1.2'
                          }}>
                            часов
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Область с рейсами с активным скроллом */}
              <div 
                ref={mainRef}
                className="flex-1 bg-gray-50 overflow-x-auto overflow-y-auto"
                style={{ boxShadow: 'inset 2px 0 8px rgba(0,0,0,0.05)' }}
              >
                <div style={{ width: totalWidth, minWidth: totalWidth, minHeight: '100%' }}>
                  {drivers.map((driver, index) => {
                    // Получаем рейсы водителя напрямую по его ID (vehicleId = driverId)
                    const driverFlights = flightsByMachine[driver.id] || [];
                    // Оставляем машину для отображения в UI, но не требуем её для рейсов
                    const machine = driver.machineId && driver.machineId !== '' ? machines.find(m => m.id === driver.machineId) : null;
                    const layerCount = machine ? getLayerCount(machine.id) : getLayerCountForDriver(driver.id);
                    const flightHeight = laneH - 12;
                    const layerSpacing = flightHeight + 6;
                    const dynamicLaneH = layerCount === 1 ? laneH : Math.max(laneH, layerCount * layerSpacing + 12);
                    
                    return (
                      <div key={driver.id} className="border-b border-gray-200" style={{ height: dynamicLaneH, boxSizing: 'border-box' }}>
                        <div style={{ position: 'relative', width: totalWidth, minWidth: totalWidth, height: '100%', boxSizing: 'border-box' }}>
                          {/* Вертикальные линии сетки времени */}
                          {gridLines.map(minutes => {
                            const isHour = minutes % 60 === 0;
                            const isMidnight = minutes === 0 || minutes === 24 * 60;
                            
                            return (
                              <div
                                key={minutes}
                                style={{
                                  position: 'absolute',
                                  left: (minutes - DAY_START) * pxPerMin,
                                  top: 0,
                                  bottom: 0,
                                  width: isMidnight ? '3px' : '1px',
                                  backgroundColor: isMidnight ? '#3b82f6' : isHour ? '#9ca3af' : '#e5e7eb',
                                  opacity: isMidnight ? 0.8 : 0.7,
                                  zIndex: isMidnight ? 5 : 1
                                }}
                              />
                            );
                          })}
                          
                          {/* Смена водителя (небесно-голубой фон) - используем пользовательское время */}
                          {(() => {
                            const shiftTime = getDriverShiftTime(driver.id);
                            const shiftStart = shiftTime.shiftStart;
                            const shiftEnd = shiftTime.shiftEnd;
                            
                            // Если смена не переходит через полночь или полностью в следующем дне
                            if (shiftEnd > shiftStart) {
                              return (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: Math.max(0, (shiftStart - DAY_START) * pxPerMin),
                                    top: 0,
                                    width: (shiftEnd - shiftStart) * pxPerMin,
                                    height: '100%',
                                    backgroundColor: '#87ceeb', // Небесно-голубой
                                    opacity: 0.15,
                                    borderRadius: '2px',
                                    zIndex: 1
                                  }}
                                />
                              );
                            } else {
                              // Смена переходит через полночь - отображаем два блока
                              const endOfDay = 24 * 60; // 24:00 в минутах
                              const startOfNextDay = 0; // 0:00 в минутах
                              const actualShiftEnd = shiftEnd - 24 * 60; // Убираем добавленные 24 часа для отображения
                              
                              return (
                                <>
                                  {/* Первая часть смены (до полуночи) */}
                                  {shiftStart < endOfDay && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: Math.max(0, (shiftStart - DAY_START) * pxPerMin),
                                        top: 0,
                                        width: (Math.min(endOfDay, actualDayEnd) - shiftStart) * pxPerMin,
                                        height: '100%',
                                        backgroundColor: '#87ceeb',
                                        opacity: 0.15,
                                        borderRadius: '2px',
                                        zIndex: 1
                                      }}
                                    />
                                  )}
                                  
                                  {/* Вторая часть смены (после полуночи) */}
                                  {actualShiftEnd > DAY_START && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: Math.max(0, (DAY_START - DAY_START) * pxPerMin),
                                        top: 0,
                                        width: (actualShiftEnd - DAY_START) * pxPerMin,
                                        height: '100%',
                                        backgroundColor: '#87ceeb',
                                        opacity: 0.15,
                                        borderRadius: '2px',
                                        zIndex: 1
                                      }}
                                    />
                                  )}
                                </>
                              );
                            }
                          })()}
                          
                          {/* Визуализация временных зазоров при перетаскивании */}
                          {timeGapInfo && timeGapInfo.machineId === machine?.id && activeFlight && (
                            <>
                              {/* Зазор слева от рейса (от начала обслуживания) */}
                              {timeGapInfo.beforeGap && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: (timeGapInfo.beforeGap.insertTime - DAY_START) * pxPerMin,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: Math.max(30, timeGapInfo.beforeGap.gap * pxPerMin),
                                    height: 10,
                                    backgroundColor: timeGapInfo.beforeGap.gap < 25 
                                      ? 'rgba(239, 68, 68, 0.15)' // Красный если < 25 мин (более прозрачный)
                                      : 'rgba(107, 114, 128, 0.15)', // Серый если >= 25 мин (более прозрачный)
                                    border: timeGapInfo.beforeGap.gap < 25 
                                      ? '1px dashed #ef4444' 
                                      : '1px dashed #6b7280',
                                    borderRadius: '3px',
                                    zIndex: 15,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    color: timeGapInfo.beforeGap.gap < 25 ? '#dc2626' : '#374151',
                                    fontWeight: '500'
                                  }}
                                >
                                  {Math.floor(timeGapInfo.beforeGap.gap)}мин
                                </div>
                              )}
                              
                              {/* Зазор справа от рейса (от конца обслуживания) */}
                              {timeGapInfo.afterGap && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: (timeGapInfo.afterGap.insertTime - DAY_START) * pxPerMin,
                                    top: '30%',
                                    transform: 'translateY(-50%)',
                                    width: Math.max(30, timeGapInfo.afterGap.gap * pxPerMin),
                                    height: 10,
                                    backgroundColor: timeGapInfo.afterGap.gap < 25 
                                      ? 'rgba(239, 68, 68, 0.15)' // Красный если < 25 мин (более прозрачный)
                                      : 'rgba(107, 114, 128, 0.15)', // Серый если >= 25 мин (более прозрачный)
                                    border: timeGapInfo.afterGap.gap < 25 
                                      ? '1px dashed #ef4444' 
                                      : '1px dashed #6b7280',
                                    borderRadius: '3px',
                                    zIndex: 15,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    color: timeGapInfo.afterGap.gap < 25 ? '#dc2626' : '#374151',
                                    fontWeight: '500'
                                  }}
                                >
                                  {Math.floor(timeGapInfo.afterGap.gap)}мин
                                </div>
                              )}
                            </>
                          )}
                          
                          <DroppableMachineSlot
                            machine={machine || {id: driver.id, name: 'Водитель', driver: driver.full_name, shiftStart: 0, shiftEnd: 1440}}
                            laneH={dynamicLaneH}
                            totalWidth={totalWidth}
                          >
                            {/* Полоски для скобок-цепочек с индивидуальными окнами */}
                            {chainsByMachine[driver.id]?.map((chain, idx) => {
                              const xPos = (chain.start - DAY_START) * pxPerMin;
                              const xPosEnd = (chain.end - DAY_START) * pxPerMin;
                              const width = Math.max(4, xPosEnd - xPos);
                              const currentChainWindows = chainWindows[chain.chainId] || {};
                              
                              // Получаем границы цепочки по слоям
                              const layerBounds = getChainLayerBounds(chain.chainId, driver.id);
                                
                                return (
                                  <div key={`chain-${driver.id}-${chain.chainId}-${idx}`}>
                                    {/* Фиолетовая полоса */}
                                    <div 
                                      className="absolute border-2 border-purple-500"
                                      style={{
                                        left: xPos,
                                        width: width,
                                        top: layerBounds.top, // Позиционируем от верхнего слоя
                                        height: layerBounds.height, // Высота охватывает все слои
                                        borderRadius: '4px',
                                        backgroundColor: selectedChain === chain.chainId 
                                          ? 'rgba(239, 68, 68, 0.2)' // Красноватый для выбранной
                                          : 'rgba(147, 51, 234, 0.1)', // Обычный фиолетовый
                                        border: selectedChain === chain.chainId 
                                          ? '2px solid #EF4444' // Красная граница для выбранной
                                          : '2px solid #9333EA', // Фиолетовая граница
                                        zIndex: 1,
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => handleChainClick(chain.chainId)}
                                      title="Кликните для выбора скобки, затем нажмите 'Разбить скобку' в панели управления"
                                    />
                                    
                                    {/* Окно погрузки - слева на фиолетовой полосе */}
                                    <div 
                                      style={{
                                        position: 'absolute',
                                        left: xPos - 2, // Немного левее начала полосы
                                        top: layerBounds.top + layerBounds.height / 2, // Центрируем по высоте цепочки
                                        transform: 'translateY(-50%)',
                                        height: 15, // Меньше высоты полосы
                                        minWidth: '40px',
                                        backgroundColor: 'rgba(5, 150, 105, 0.7)', // Полупрозрачный зеленый
                                        color: 'white',
                                        borderRadius: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '9px',
                                        fontWeight: '600',
                                        zIndex: 5,
                                        border: '1px solid rgba(4, 120, 87, 0.8)'
                                      }}
                                    >
                                      <select
                                        value={currentChainWindows.loadingWindow || ''}
                                        onChange={(e) => {
                                          const newValue = e.target.value ? Number(e.target.value) : undefined;
                                          setChainWindows(prev => ({
                                            ...prev,
                                            [chain.chainId]: {
                                              ...prev[chain.chainId],
                                              loadingWindow: newValue
                                            }
                                          }));
                                        }}
                                        style={{
                                          backgroundColor: 'transparent',
                                          border: 'none',
                                          color: 'white',
                                          fontSize: '9px',
                                          fontWeight: '600',
                                          outline: 'none',
                                          cursor: 'pointer',
                                          width: '100%',
                                          textAlign: 'center'
                                        }}
                                      >
                                        <option value="" style={{ color: '#000' }}>—</option>
                                        {Array.from({ length: 19 }, (_, i) => i + 1).map(num => (
                                          <option key={num} value={num} style={{ color: '#000' }}>{num}</option>
                                        ))}
                                      </select>
                                    </div>
                                    
                                    {/* Окно разгрузки - справа на фиолетовой полосе */}
                                    <div 
                                      style={{
                                        position: 'absolute',
                                        left: xPos + width - 38, // Немного левее конца полосы (ширина селектора ~40px)
                                        top: layerBounds.top + layerBounds.height / 2, // Центрируем по высоте цепочки
                                        transform: 'translateY(-50%)',
                                        height: 15, // Меньше высоты полосы
                                        minWidth: '40px',
                                        backgroundColor: 'rgba(220, 38, 38, 0.7)',
                                        color: 'white',
                                        borderRadius: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '9px',
                                        fontWeight: '600',
                                        zIndex: 5,
                                        border: '1px solid #B91C1C'
                                      }}
                                    >
                                      <select
                                        value={currentChainWindows.unloadingWindow || ''}
                                        onChange={(e) => {
                                          const newValue = e.target.value ? Number(e.target.value) : undefined;
                                          setChainWindows(prev => ({
                                            ...prev,
                                            [chain.chainId]: {
                                              ...prev[chain.chainId],
                                              unloadingWindow: newValue
                                            }
                                          }));
                                        }}
                                        style={{
                                          backgroundColor: 'transparent',
                                          border: 'none',
                                          color: 'white',
                                          fontSize: '9px',
                                          fontWeight: '600',
                                          outline: 'none',
                                          cursor: 'pointer',
                                          width: '100%',
                                          textAlign: 'center'
                                        }}
                                      >
                                        <option value="" style={{ color: '#000' }}>—</option>
                                        {[20, 21, 22, 23].map(num => (
                                          <option key={num} value={num} style={{ color: '#000' }}>{num}</option>
                                        ))}
                                      </select>
                                    </div>
                                    
                                    {/* Номер автолифта - выпадающий список по центру полосы */}
                                    {width > 100 && (() => {
                                      // Получаем автолифт по умолчанию для этой цепочки на основе машины
                                      const defaultAutolift = chainAutolifts[chain.chainId] || getAutoliftFromMachine(chain.machineId);
                                      
                                      // Если автолифт не был назначен ранее, автоматически назначаем
                                      if (!chainAutolifts[chain.chainId] && defaultAutolift) {
                                        autoAssignAutolift(chain.chainId, chain.machineId);
                                      }
                                      
                                      return (
                                        <select
                                          value={defaultAutolift}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setChainAutolifts(prev => ({
                                              ...prev,
                                              [chain.chainId]: value
                                            }));
                                          }}
                                          style={{
                                            position: 'absolute',
                                            left: xPos + width / 2,
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            fontSize: '9px',
                                            color: selectedChain === chain.chainId ? '#DC2626' : '#8B5CF6',
                                            fontWeight: '600',
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            border: `1px solid ${selectedChain === chain.chainId ? '#DC2626' : '#8B5CF6'}`,
                                            borderRadius: '3px',
                                            padding: '2px 4px',
                                            minWidth: '60px',
                                            maxWidth: '80px',
                                            textAlign: 'center',
                                            zIndex: 3,
                                            outline: 'none',
                                            cursor: 'pointer'
                                          }}
                                          onClick={(e) => e.stopPropagation()} // Предотвращаем выбор цепочки при клике на поле
                                        >
                                          <option value="" style={{ color: '#000' }}>—</option>
                                          {(autolifts.length > 0 ? autolifts : ['133', '135', '136', '139', '140', '141', '149', '150', '151']).map(autolift => (
                                            <option key={autolift} value={autolift} style={{ color: '#000' }}>
                                              {autolift}
                                            </option>
                                          ))}
                                        </select>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                              
                              {/* Рейсы */}
                              {driverFlights.map((flight, index) => {
                                const left = (flight.loadStart - DAY_START) * pxPerMin;
                                const width = Math.max(12, (flight.loadEnd - flight.loadStart) * pxPerMin);
                                const isPending = pendingChanges.some(c => c.flightId === flight.id);
                                const flightLayer = getFlightLayer(flight.id, driver.id);
                                const totalLayers = getLayerCountForDriver(driver.id);
                                
                                // Расчет позиции для центровки в строке
                                const flightHeight = laneH - 12; // Увеличили высоту рейса
                                let layerTop = 0;
                                
                                if (totalLayers === 1) {
                                  // Если только один слой, центрируем в строке
                                  layerTop = 0; // Будет центрироваться через CSS (top: 50%, transform: translateY(-50%))
                                } else {
                                  // Если несколько слоев, располагаем симметрично
                                  const layerSpacing = flightHeight + 4; // Расстояние между слоями
                                  const totalHeight = totalLayers * layerSpacing;
                                  const centerY = dynamicLaneH / 2;
                                  const startY = centerY - totalHeight / 2;
                                  layerTop = startY + flightLayer * layerSpacing;
                                }
                                
                                // Определяем позицию в скобке (цепочке)
                                const flightsInSameChain = driverFlights.filter(f => f.chainId === flight.chainId);
                                const indexInChain = flightsInSameChain.findIndex(f => f.id === flight.id);
                                const chainLength = flightsInSameChain.length;
                                
                                let bracketPosition: 'start' | 'middle' | 'end' | 'single' = 'single';
                                let showBracket = false;
                                
                                if (chainLength > 1 && flight.chainId && flight.chainId.trim() !== '') {
                                  showBracket = true;
                                  if (indexInChain === 0) {
                                    bracketPosition = 'start';
                                  } else if (indexInChain === chainLength - 1) {
                                    bracketPosition = 'end';
                                  } else {
                                    bracketPosition = 'middle';
                                  }
                                }
                                
                                // НЕ показываем окна под рейсами - они будут только на краях скобок
                                let loadingWindow: number | undefined;
                                let unloadingWindow: number | undefined;
                                
                                return (
                                  <DraggableFlight
                                    key={flight.id}
                                    flight={flight}
                                    left={left}
                                    width={width}
                                    laneH={laneH - 6} // Уменьшили отступ: было laneH-12, стало laneH-6 для увеличения высоты
                                    fontPx={fontPx}
                                    isAssigned={true}
                                    isPending={isPending}
                                    status={getFlightStatus(flight)}
                                    showBracket={showBracket}
                                    bracketPosition={bracketPosition}
                                    loadingWindow={loadingWindow}
                                    unloadingWindow={unloadingWindow}
                                    onStatusChange={(status: 'completed' | 'in-progress' | 'planned') => updateFlightStatus(flight.flightNo, status)}
                                    onClick={handleFlightClick}
                                    isSelected={selectedFlights.has(flight.id)}
                                    layerTop={layerTop}
                                    useLayerPositioning={totalLayers > 1} // Включаем слоевое позиционирование для перекрывающихся рейсов
                                  />
                                );
                              })}
                            </DroppableMachineSlot>
                          
                          {/* Линия "сейчас" для этой строки */}
                          <div
                            style={{
                              position: 'absolute',
                              left: nowLeft,
                              top: 0,
                              height: '100%',
                              width: '2px',
                              backgroundColor: '#ef4444',
                              zIndex: 10
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>
          </div>

      </div>
      
      {/* Панель неназначенных рейсов - часть flex layout */}
      <div 
        className="border-t-2 border-blue-300 bg-blue-50 flex-none"
        style={{ 
          height: `${basementHeight}px`,
          minHeight: '80px',
          maxHeight: '60vh',
          background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)',
          boxShadow: '0 -4px 8px rgba(0,0,0,0.1)',
          borderColor: '#cbd5e1'
        }}
      >
        {/* Хэндл для изменения размера */}
        <div
          className="w-full bg-blue-400 cursor-ns-resize hover:bg-blue-500 transition-colors flex items-center justify-center"
          style={{ height: '6px' }}
          onMouseDown={(e) => {
            setIsResizing(true);
            const startY = e.clientY;
            const startHeight = basementHeight;
            
            const handleMouseMove = (e: MouseEvent) => {
              const deltaY = startY - e.clientY;
              const newHeight = Math.max(80, Math.min(400, startHeight + deltaY));
              setBasementHeight(newHeight);
            };
            
            const handleMouseUp = () => {
              setIsResizing(false);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="w-12 h-1 bg-blue-600 rounded-full opacity-60"></div>
        </div>
        
        <div className="flex" style={{ height: basementHeight - 6 }}>
          {/* Заголовок подвала */}
          <div 
            className="flex-none p-3 flex items-center"
            style={{ 
              width: `${TOTAL_DRIVERS_WIDTH}px`, 
              borderRight: '2px solid #cbd5e1',
              boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
              background: 'linear-gradient(135deg, #e3eef7 0%, #d7e8f0 100%)'
            }}
          >
            <div className="text-sm font-semibold" style={{ color: '#475569' }}>
              Неназначенные рейсы ({arrangeUnassignedFlights.length})
            </div>
          </div>
          
          {/* Область с неназначенными рейсами с активным скроллом */}
          <div 
            ref={basementRef}
            className="flex-1 overflow-x-auto overflow-y-auto"
            style={{ 
              boxShadow: 'inset 2px 0 8px rgba(0,0,0,0.05)',
              background: '#f9fafb'
            }}
          >
            <DroppableUnassigned
              totalWidth={totalWidth}
              height={arrangeUnassignedFlights.length > 0 
                ? Math.max(basementHeight - 6, (Math.max(...arrangeUnassignedFlights.map(f => f.laneIndex)) + 1) * laneH)
                : basementHeight - 6}
            >
              {/* Вертикальные линии сетки времени для подвала */}
              {gridLines.map(minutes => {
                // Вычисляем максимальную высоту на основе неназначенных рейсов
                const maxLaneIndex = arrangeUnassignedFlights.length > 0 
                  ? Math.max(...arrangeUnassignedFlights.map(f => f.laneIndex)) 
                  : 0;
                const actualHeight = Math.max(basementHeight - 6, (maxLaneIndex + 1) * laneH);
                
                return (
                <div
                  key={`basement-grid-${minutes}`}
                  style={{
                    position: 'absolute',
                    left: (minutes - DAY_START) * pxPerMin,
                    top: 0,
                    height: actualHeight,
                    width: '1px',
                    backgroundColor: minutes % 60 === 0 ? '#9ca3af' : '#e5e7eb',
                    opacity: 0.7,
                    zIndex: 1
                  }}
                />
                );
              })}
              
              {/* Горизонтальные линии для подвала */}
              {(() => {
                // Вычисляем количество линий на основе фактического количества рядов с рейсами
                const maxLaneIndex = arrangeUnassignedFlights.length > 0 
                  ? Math.max(...arrangeUnassignedFlights.map(f => f.laneIndex)) 
                  : 0;
                const minLines = Math.floor((basementHeight - 6) / laneH) + 1;
                const actualLines = Math.max(minLines, maxLaneIndex + 2); // +2 для дополнительной линии снизу
                
                return Array.from({ length: actualLines }, (_, i) => (
                  <div
                    key={`basement-horizontal-${i}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: i * laneH,
                      height: '1px',
                      backgroundColor: '#e5e7eb',
                      opacity: 0.5,
                      zIndex: 1
                    }}
                  />
                ));
              })()}
              
              {/* Неназначенные рейсы */}
              {arrangeUnassignedFlights.map((flight) => {
                const left = (flight.loadStart - DAY_START) * pxPerMin;
                const width = Math.max(12, (flight.loadEnd - flight.loadStart) * pxPerMin);
                const top = flight.laneIndex * laneH + (laneH - (laneH - 16)) / 2; // Центрируем рейс в строке как в основной диаграмме
                const isPending = pendingChanges.some(c => c.flightId === flight.id);
                
                return (
                  <div
                    key={flight.id}
                    style={{
                      position: 'absolute',
                      left: left,
                      top: top,
                      width: width,
                      height: laneH - 12 // Увеличили высоту для соответствия основной диаграмме
                    }}
                  >
                    <DraggableFlight
                      flight={flight}
                      left={0}
                      width={width}
                      laneH={laneH - 6} // Такая же высота как у основных рейсов (увеличили с laneH-12)
                      fontPx={fontPx}
                      isAssigned={false}
                      isPending={isPending}
                      status={getFlightStatus(flight)}
                      onStatusChange={(status: 'completed' | 'in-progress' | 'planned') => updateFlightStatus(flight.flightNo, status)}
                      onClick={handleFlightClick}
                      isSelected={selectedFlights.has(flight.id)}
                    />
                  </div>
                );
              })}
              
              {/* Линия "сейчас" для подвала */}
              <div
                style={{
                  position: 'absolute',
                  left: nowLeft,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  backgroundColor: '#ef4444',
                  zIndex: 10
                }}
              />
            </DroppableUnassigned>
          </div>
        </div>
      </div>
      
      {/* Панель управления отображением */}
      <div className="flex-none bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            Высота подвала: {basementHeight}px
          </div>
          <button
            onClick={() => setBasementHeight(120)}
            className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Сбросить
          </button>
        </div>
      </div>
      
      {/* Модальное окно для сохранения расстановки */}
      {showSaveDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999]"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999
          }}
        >
          <div className="bg-blue-50 rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-80 flex flex-col border-2 border-blue-300" 
               style={{ backgroundColor: '#f0f8ff' }}>
            <div className="px-4 py-3 border-b-2 border-blue-300 bg-gradient-to-r from-blue-100 to-blue-200 rounded-t-lg">
              <h3 className="text-sm font-semibold text-blue-900">
                Сохранить расстановку
              </h3>
              <p className="text-xs text-blue-700 mt-1">
                Просмотрите изменения и подтвердите сохранение
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ backgroundColor: '#f0f8ff' }}>
              {pendingChanges.length === 0 ? (
                <p className="text-blue-600 text-center py-6 text-sm">
                  Нет изменений для сохранения
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingChanges.map((change) => (
                    <div
                      key={change.id}
                      className="flex items-center justify-between bg-white rounded-md p-2 border border-blue-200 shadow-sm"
                      style={{ backgroundColor: '#ffffff', borderColor: '#b3d9ff' }}
                    >
                      <div className="flex-1">
                        <span className="text-sm font-medium text-blue-900">
                          {change.flightNo}: {change.fromMachine} → {change.toMachine}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveChange(change.id)}
                        className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 border border-red-300 transition-colors"
                      >
                        Отменить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-4 py-3 border-t-2 border-blue-300 flex justify-end gap-2 bg-gradient-to-r from-blue-100 to-blue-200 rounded-b-lg">
              <button
                onClick={handleCancelChanges}
                className="px-3 py-1.5 text-sm font-semibold rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: '#e0f2fe',
                  color: '#0c4a6e',
                  borderColor: '#7dd3fc',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleApplyChanges}
                disabled={loading || pendingChanges.length === 0}
                className="px-3 py-1.5 text-sm font-semibold rounded shadow-sm border transition-all duration-200"
                style={{
                  backgroundColor: loading || pendingChanges.length === 0 ? '#f1f5f9' : '#e0f2fe',
                  color: loading || pendingChanges.length === 0 ? '#64748b' : '#0c4a6e',
                  borderColor: loading || pendingChanges.length === 0 ? '#cbd5e1' : '#7dd3fc',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  cursor: loading || pendingChanges.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Сохранение...' : 'Применить'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* DragOverlay для отображения перетаскиваемого элемента */}
      <DragOverlay modifiers={[restrictToVerticalAxis]}>
        {activeFlight && (
          <DraggableFlight
            flight={activeFlight}
            left={0}
            width={Math.max(12, (activeFlight.loadEnd - activeFlight.loadStart) * pxPerMin)}
            laneH={laneH}
            fontPx={fontPx}
            isAssigned={!!activeFlight.vehicleId}
            isPending={false}
            status={getFlightStatus(activeFlight)}
            onClick={handleFlightClick}
            isSelected={selectedFlights.has(activeFlight.id)}
          />
        )}
      </DragOverlay>
      </div>
    </DndContext>
  );
};

export default PlannerPage;
