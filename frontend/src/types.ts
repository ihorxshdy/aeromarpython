export type FlightType = 'SMS' | 'DMS';
export type DmsRole = 'BUSINESS' | 'ECONOMY';

export interface Flight {
  id: string;
  flightNo: string;
  route: string;
  origin?: string;
  dest?: string;
  acType: string;
  type: FlightType;
  dmsRole?: DmsRole;
  dmsPairKey?: string;
  
  flightDate?: string;  // Дата рейса в формате YYYY-MM-DD
  stdMin: number;       // Время в минутах от 00:00 базового дня
  
  // ТГ
  kitchenOut: number;
  serviceStart: number;
  serviceEnd: number;
  unloadEnd: number;
  
  // визуал бара
  loadStart: number;
  loadEnd: number;
  
  // назначение
  vehicleId: string;
  chainId: string;
  
  cancelled?: boolean;
}

export interface Machine {
  id: string;
  name: string;
  driver: string;
  shiftStart: number;
  shiftEnd: number;
  flex?: boolean;
}

export interface Driver {
  id: string;
  full_name: string;
  machineId?: string;
  shift_start: number;
  shift_end: number;
}

export interface ChainWin {
  chainId: string;
  machineId: string;
  start: number;
  end: number;
}

// Новые типы для смен
export interface Shift {
  shift_start: string;
  shift_end: string;
  shift_type?: string;
}

export interface ShiftAssignment {
  driver_id: string;
  shift_start: string;
  shift_end: string;
  bracket_ids: string[];
}

export interface DriverWithShift {
  id: string;
  full_name: string;
  shift_start?: string;
  shift_end?: string;
  brackets_count: number;
}
