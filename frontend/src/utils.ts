// Константы - расширенный временной диапазон для покрытия операций через полночь
export const DAY_START = -6 * 60;       // начинаем ось с 18:00 предыдущего дня (-6 часов)
export const DAY_END = 30 * 60;         // до 06:00 следующего дня (+30 часов от полуночи)
export const GRID_STEP = 30;            // шаг сетки 30 мин (было 60) для более детального отображения
export const FLEX_HOURS = 9;           // длительность flex-смены (ч)

export const RULE = {
  // derivation из STD
  LOAD_SMS: 180,                // начало загрузки автолифта до STD (SMS)
  LOAD_DMS: 240,                // для DMS
  WINDOW_TO_SERVICE: 15,        // от окна до начала обслуживания
  SERVICE_SMS: 19,              // длительность обслуживания SMS
  SERVICE_DMS: 45,              // длительность обслуживания DMS
  LEAVE_BEFORE_STD: 60,         // отъезд от ВС до STD
  RETURN_UNLOAD: 20,            // возврат в окно после обслуживания (20 мин)
  TRAVEL: 20,                   // переезд между бортами

  // визуал «скобки»
  BRACKET_PAD_LEFT: 120,        // −2:00 от первого бара в цепочке
  BRACKET_PAD_RIGHT: 0,         // без дополнительного хвоста — скобка заканчивается по разгрузке

  // подсказка-буфер при dnd
  RED_ZONE: 15,                 // 15 минут
} as const;

// Утилиты
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const clampDay = (m: number) => clamp(m, DAY_START, DAY_END);

// Функция для определения дня относительно базового дня (0 = текущий день)
export const getDayOffset = (m: number): number => {
  if (m < 0) return -1; // Предыдущий день
  if (m >= 24 * 60) return 1; // Следующий день
  return 0; // Текущий день
};

export function toHHMM(m: number): string {
  // Нормализуем время с учетом расширенного диапазона
  const totalMinutes = Math.round(m);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = ((totalMinutes % 60) + 60) % 60;
  
  // Определяем дату относительно текущего дня
  if (hours < 0) {
    // Предыдущий день
    const actualHours = ((hours % 24) + 24) % 24;
    return `${actualHours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}`;
  } else if (hours >= 24) {
    // Следующий день
    const actualHours = hours % 24;
    return `${actualHours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}`;
  } else {
    // Текущий день
    return `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}`;
  }
}

// Функция для компактного отображения времени с учетом дат
export function toCompactTime(start: number, end: number, width: number): string {
  const startDay = getDayOffset(start);
  const endDay = getDayOffset(end);
  
  if (width >= 90) {
    // Полное время с пробелами для широких баров
    return `${toHHMM(start)} - ${toHHMM(end)}`;
  } else if (width >= 65) {
    // Без пробелов для средних баров
    return `${toHHMM(start)}-${toHHMM(end)}`;
  } else if (width >= 50) {
    // Сокращенное время без ведущих нулей
    let shortStart = toHHMM(start).replace(/^0/, '');
    let shortEnd = toHHMM(end).replace(/^0/, '');
    return `${shortStart}-${shortEnd}`;
  } else {
    // Только время начала для очень узких баров
    return toHHMM(start).replace(/^0/, '');
  }
}

export function toMin(hhmm: string): number {
  const match = hhmm.match(/(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  return +match[1]*60 + +match[2];
}

export const DMS_TYPES = new Set(['77W','77R','773','744','333','359']);
export const SMS_TYPES = new Set(['320','321','32A','32B','32N','32Q','73H','739','SU9']);
export const isDMS = (t: string) => DMS_TYPES.has(t.toUpperCase());
export const isSMS = (t: string) => SMS_TYPES.has(t.toUpperCase());
export const normType = (t: string) => t.toUpperCase().trim();
