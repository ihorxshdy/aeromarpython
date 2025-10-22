import axios from 'axios';
import { Flight, Machine, Driver } from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const CACHE_DURATION = parseInt(process.env.REACT_APP_CACHE_DURATION || '300000'); // 5 минут

// Кеш для API запросов
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > CACHE_DURATION;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(pattern: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

const apiCache = new APICache();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 секунд таймаут
});

// Интерсептор для логирования
api.interceptors.request.use(
  (config) => {
    if (process.env.REACT_APP_DEBUG === 'true') {
      console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    if (process.env.REACT_APP_DEBUG === 'true') {
      console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error);
    return Promise.reject(error);
  }
);

export const flightAPI = {
  // Получить все рейсы с кешированием
  getFlights: async (): Promise<Flight[]> => {
    const cacheKey = 'flights';
    const cached = apiCache.get<Flight[]>(cacheKey);
    if (cached) {
      console.log('📋 Используется кешированный результат для рейсов');
      return cached;
    }

    const response = await api.get('/flights');
    const data = response.data;
    apiCache.set(cacheKey, data);
    return data;
  },

  // Добавить рейсы (инвалидация кеша)
  addFlights: async (flights: Flight[]): Promise<Flight[]> => {
    const response = await api.post('/flights', flights);
    apiCache.invalidate('flights'); // Очистка кеша рейсов
    return response.data;
  },

  // Импорт из CSV
  importCSV: async (file: File): Promise<Flight[]> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/flights/import-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Обновить рейс
  updateFlight: async (flightId: string, flight: Flight): Promise<Flight> => {
    const response = await api.put(`/flights/${flightId}`, flight);
    return response.data;
  },

  // Удалить рейс
  deleteFlight: async (flightId: string): Promise<void> => {
    await api.delete(`/flights/${flightId}`);
  },

  // Создать расписание скобок (новое автопланирование)
  createBracketSchedule: async (): Promise<Flight[]> => {
    const response = await api.post('/brackets/create-schedule');
    return response.data.flights || response.data;
  },

  // Планирование для выбранных рейсов
  planBracketsForFlights: async (flightIds: string[]): Promise<Flight[]> => {
    const response = await api.post('/brackets/plan-for-flights', flightIds);
    return response.data;
  },

  // Сброс назначений
  resetAssignments: async (): Promise<{ message: string }> => {
    const response = await api.post('/assign/reset');
    return response.data;
  },

  // Получить правила планирования скобок
  getBracketRules: async (): Promise<any> => {
    const response = await api.get('/brackets/rules');
    return response.data;
  },

  // Проверить валидность комбинации
  validateBracketCombination: async (combinations: any): Promise<any> => {
    const response = await api.post('/brackets/validate-combination', combinations);
    return response.data;
  },

  // Автоназначение (старое, для совместимости)
  autoAssign: async (): Promise<{ message: string; assigned_count: number }> => {
    try {
      console.log('🔍 autoAssign: Начинаем вызов API');
      // Используем новое планирование скобок вместо старого автоназначения
      const response = await api.post('/brackets/create-schedule');
      console.log('🔍 autoAssign: Получен ответ от API:', response);
      
      const responseData = response.data;
      console.log('🔍 autoAssign: response.data:', responseData);
      console.log('🔍 autoAssign: responseData.stats:', responseData.stats);
      
      // API возвращает объект с полями: assignments, brackets, message, stats, status, unassigned
      if (responseData && responseData.stats) {
        const result = { 
          message: responseData.message || 'Скобки созданы успешно', 
          assigned_count: responseData.stats.assigned_flights || 0
        };
        console.log('🔍 autoAssign: Возвращаем результат:', result);
        return result;
      } else {
        console.log('🔍 autoAssign: Нет поля stats, используем фолбэк');
        // Фолбэк для неожиданного формата
        const result = { 
          message: responseData?.message || 'Операция выполнена', 
          assigned_count: responseData?.assigned_count || 0
        };
        console.log('🔍 autoAssign: Возвращаем фолбэк результат:', result);
        return result;
      }
    } catch (error) {
      console.error('🔍 autoAssign: Ошибка в autoAssign:', error);
      throw error;
    }
  },

  // Назначить рейс на машину
  assignFlight: async (flightId: string, machineId: string): Promise<Flight> => {
    const response = await api.post(`/assign/flight/${flightId}/machine/${machineId}`);
    return response.data;
  },

  // Снять назначение рейса
  unassignFlight: async (flightId: string): Promise<Flight> => {
    const response = await api.delete(`/assign/flight/${flightId}`);
    return response.data;
  },
};

export const machineAPI = {
  // Получить все машины
  getMachines: async (): Promise<Machine[]> => {
    const response = await api.get('/machines');
    return response.data;
  },

  // Обновить водителя машины
  updateDriver: async (machineId: string, driverName: string): Promise<Machine> => {
    const response = await api.put(`/machines/${machineId}/driver`, { driver: driverName });
    return response.data;
  },
};

export const driverAPI = {
  // Получить всех водителей
  getDrivers: async (): Promise<Driver[]> => {
    const response = await api.get('/drivers');
    return response.data;
  },
};

// API для работы со сменами
export const shiftsAPI = {
  // Получить все доступные смены
  getShifts: async () => {
    const response = await api.get('/shifts');
    return response.data;
  },

  // Загрузить смены из CSV
  uploadShifts: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/shifts/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Получить назначения смен
  getShiftAssignments: async () => {
    const response = await api.get('/shift-assignments');
    return response.data;
  },

  // Автоматически назначить смены
  autoAssignShifts: async () => {
    const response = await api.post('/shift-assignments/auto-assign');
    return response.data;
  },

  // Очистить назначения смен
  clearShiftAssignments: async () => {
    const response = await api.delete('/shift-assignments');
    return response.data;
  },

  // Получить водителей с назначенными сменами
  getDriversWithShifts: async () => {
    const response = await api.get('/drivers/with-shifts');
    return response.data;
  },
};

export default api;
