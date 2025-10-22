import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Flight } from '../types';
import { toHHMM } from '../utils';

interface HybridDraggableFlightProps {
  flight: Flight;
  left: number;
  width: number;
  laneH: number;
  fontPx: number;
  isAssigned: boolean;
  isPending?: boolean;
  status?: 'completed' | 'in-progress' | 'planned';
  onStatusChange?: (status: 'completed' | 'in-progress' | 'planned') => void;
  useNativeDrag?: boolean; // Флаг для использования HTML5 drag & drop
  onNativeDragStart?: (flight: Flight) => void;
}

export const HybridDraggableFlight: React.FC<HybridDraggableFlightProps> = ({
  flight,
  left,
  width,
  laneH,
  fontPx,
  isAssigned,
  isPending = false,
  status = 'planned',
  onStatusChange,
  useNativeDrag = false,
  onNativeDragStart
}) => {
  // DnD Kit draggable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: flight.id,
    data: {
      type: 'flight',
      flight,
      isAssigned
    },
    disabled: useNativeDrag // Отключаем DnD Kit если используем нативный drag
  });

  // HTML5 drag handlers
  const handleNativeDragStart = (e: React.DragEvent) => {
    console.log('🔄 Native drag start for flight:', flight.flightNo);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'flight',
      flight,
      isAssigned
    }));
    e.dataTransfer.effectAllowed = 'move';
    if (onNativeDragStart) {
      onNativeDragStart(flight);
    }
  };

  const handleNativeDragEnd = (e: React.DragEvent) => {
    console.log('🔄 Native drag end for flight:', flight.flightNo);
  };

  // Расчет минимальной ширины
  const minWidth = Math.max(width, 80);

  // Автоматическое определение статуса по времени
  const getAutoStatus = (): 'planned' | 'in-progress' | 'completed' => {
    const now = Date.now();
    const currentMinutes = Math.floor((now % (24 * 60 * 60 * 1000)) / (60 * 1000));
    
    if (currentMinutes < flight.serviceStart) {
      return 'planned';
    } else if (currentMinutes >= flight.serviceStart && currentMinutes <= flight.serviceEnd) {
      return 'in-progress';
    } else {
      return 'completed';
    }
  };

  const autoStatus = getAutoStatus();
  
  // Стили для статуса
  const getStatusColor = (): { bg: string; border: string; text: string } => {
    switch (autoStatus) {
      case 'completed':
        return { bg: '#DBEAFE', border: '#2563EB', text: '#1D4ED8' };
      case 'in-progress':
        return { bg: '#D1FAE5', border: '#059669', text: '#047857' };
      case 'planned':
        return { bg: '#F3F4F6', border: '#6B7280', text: '#374151' };
      default:
        return { bg: '#F3F4F6', border: '#6B7280', text: '#374151' };
    }
  };

  const statusColors = getStatusColor();

  // Парсинг маршрута
  const parseRoute = (route: string) => {
    if (route.includes('-')) {
      const [from, to] = route.split('-').map(s => s.trim());
      return { from, to };
    }
    return { from: route, to: '' };
  };

  const { from, to } = parseRoute(flight.route);

  // Стили трансформации
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 1000 : 'auto',
  } : {};

  // Общие пропсы
  const commonProps = {
    ref: setNodeRef,
    style: {
      ...style,
      position: 'absolute' as const,
      left: left,
      top: 0,
      width: minWidth,
      height: laneH - 6,
      backgroundColor: statusColors.bg,
      border: `2px solid ${statusColors.border}`,
      borderRadius: '6px',
      padding: '2px 6px',
      fontSize: `${fontPx}px`,
      color: statusColors.text,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      cursor: isDragging ? 'grabbing' : 'grab',
      opacity: isDragging ? 0.5 : (isPending ? 0.7 : 1),
      boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.2)' : isPending ? '0 0 0 2px #ef4444' : '0 1px 3px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
      pointerEvents: 'auto' as const,
    }
  };

  if (useNativeDrag) {
    return (
      <div
        {...commonProps}
        draggable={true}
        onDragStart={handleNativeDragStart}
        onDragEnd={handleNativeDragEnd}
        onClick={() => console.log('🖱️ Native draggable flight clicked:', flight.flightNo)}
      >
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <div className="font-semibold truncate text-xs">
            {flight.flightNo}
          </div>
          <div className="text-xs opacity-75 truncate">
            {from} {to && `→ ${to}`}
          </div>
        </div>
        <div className="text-xs ml-2 opacity-75">
          {toHHMM(flight.serviceStart)}-{toHHMM(flight.serviceEnd)}
        </div>
      </div>
    );
  }

  return (
    <div
      {...commonProps}
      {...attributes}
      {...listeners}
      onClick={() => console.log('🖱️ DnD Kit draggable flight clicked:', flight.flightNo)}
    >
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <div className="font-semibold truncate text-xs">
          {flight.flightNo}
        </div>
        <div className="text-xs opacity-75 truncate">
          {from} {to && `→ ${to}`}
        </div>
      </div>
      <div className="text-xs ml-2 opacity-75">
        {toHHMM(flight.serviceStart)}-{toHHMM(flight.serviceEnd)}
      </div>
    </div>
  );
};
