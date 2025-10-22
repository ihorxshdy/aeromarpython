import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Flight } from '../types';
import { toHHMM } from '../utils';

interface DraggableFlightProps {
  flight: Flight;
  left: number;
  width: number;
  laneH: number;
  fontPx: number;
  isAssigned: boolean;
  isPending?: boolean;
  status?: 'completed' | 'in-progress' | 'planned';
  showBracket?: boolean;
  bracketPosition?: 'start' | 'middle' | 'end' | 'single';
  loadingWindow?: number;
  unloadingWindow?: number;
  parkingPosition?: string;
  onStatusChange?: (status: 'completed' | 'in-progress' | 'planned') => void;
  onClick?: (event: React.MouseEvent, flightId: string) => void;
  isSelected?: boolean;
}

export const DraggableFlight: React.FC<DraggableFlightProps> = ({
  flight,
  left,
  width,
  laneH,
  fontPx,
  isAssigned,
  isPending = false,
  status = 'planned',
  showBracket = false,
  bracketPosition = 'single',
  loadingWindow,
  unloadingWindow,
  parkingPosition,
  onStatusChange,
  onClick,
  isSelected = false
}) => {
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);

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
    disabled: isShiftPressed // Отключаем drag когда зажат Shift
  });

  // Отслеживаем нажатие/отпускание Shift
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Расчет минимальной ширины с учетом времени
  // Используем ширину по времени, но с разумным минимумом для читаемости
  const minWidth = Math.max(width, 80); // Уменьшили минимум со 140 до 80

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
        return { bg: '#DBEAFE', border: '#2563EB', text: '#1D4ED8' }; // синий для завершенных
      case 'in-progress':
        return { bg: '#D1FAE5', border: '#059669', text: '#047857' }; // зеленый для выполняемых
      case 'planned':
        return { bg: '#F3F4F6', border: '#6B7280', text: '#374151' }; // серый для запланированных
      default:
        return { bg: '#F3F4F6', border: '#6B7280', text: '#374151' }; // серый
    }
  };

  const statusColors = getStatusColor();

  // Парсинг маршрута для отображения FROM → TO
  const parseRoute = (route: string) => {
    if (route.includes('-')) {
      const [from, to] = route.split('-').map(s => s.trim());
      return { from, to };
    }
    return { from: route, to: '' };
  };

  const { from, to } = parseRoute(flight.route);

  // Используем transform для точного центрирования
  const elementHeight = laneH - 16; // 35-16 = 19px

  // Объединяем трансформации: центрирование + drag
  const getTransform = () => {
    const centerTransform = 'translateY(-50%)';
    const dragTransform = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : '';
    
    if (transform) {
      return `${centerTransform} ${dragTransform}`;
    }
    return centerTransform;
  };

  const style = {
    position: 'absolute' as const,
    left: `${left}px`,
    width: `${minWidth - 2}px`, // Уменьшили на 2px для отступа
    height: `${elementHeight}px`, // Используем переменную для ясности
    top: '50%', // Позиционируем в центр родительского контейнера
    transform: getTransform(), // Объединенные трансформации
    backgroundColor: statusColors.bg, // Вернули нормальный цвет статуса
    border: `2px solid ${statusColors.border}`, // Вернули нормальную границу статуса
    borderRadius: '4px', // Уменьшили с 6px до 4px
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '2px 6px', // Уменьшили padding: было 4px 8px, стало 2px 6px
    color: statusColors.text,
    fontSize: `${fontPx}px`,
    fontWeight: '600',
    cursor: isShiftPressed ? 'crosshair' : 'pointer', // Изменяем курсор при Shift
    userSelect: 'none' as const,
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)', // Уменьшили тень
    zIndex: isDragging ? 1000 : 10,
    opacity: isDragging ? 0.3 : 1, // Делаем оригинал более прозрачным при драге
    overflow: 'visible',
    marginRight: '2px', // Добавили отступ справа
    // Отключаем все hover эффекты когда зажат Shift
    pointerEvents: 'auto' as const,
    transition: isShiftPressed ? 'none' : 'all 0.2s ease' // Отключаем переходы при Shift
  };

  if (isPending) {
    style.backgroundColor = '#FEF3C7';
    style.border = '2px solid #F59E0B';
    style.boxShadow = '0 0 0 2px #FCD34D';
  }

  // Стили для выбранного рейса
  if (isSelected) {
    style.backgroundColor = '#E0E7FF';
    style.border = '3px solid #3B82F6';
    style.boxShadow = '0 0 0 2px #93C5FD';
  }

  const handleClick = (event: React.MouseEvent) => {
    if (onClick) {
      onClick(event, flight.id);
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    // Если зажат Shift, полностью блокируем drag
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        // Полностью отключаем hover эффекты при Shift
        ...(isShiftPressed && {
          // Фиксируем все hover стили
          '&:hover': {
            backgroundColor: style.backgroundColor + ' !important',
            border: style.border + ' !important',
            boxShadow: style.boxShadow + ' !important',
            filter: 'none !important',
            transform: style.transform + ' !important'
          }
        })
      }}
      {...attributes}
      {...(!isShiftPressed ? listeners : {})} // Условно применяем listeners только когда Shift не зажат
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      // Полностью блокируем mouse events при Shift кроме click
      onMouseOver={isShiftPressed ? (e) => { e.stopPropagation(); e.preventDefault(); } : undefined}
      onMouseEnter={isShiftPressed ? (e) => { e.stopPropagation(); e.preventDefault(); } : undefined}
      onMouseLeave={isShiftPressed ? (e) => { e.stopPropagation(); e.preventDefault(); } : undefined}
    >
      {/* Основная информация о рейсе */}
      <div style={{ 
        fontSize: `${fontPx}px`, 
        fontWeight: '700',
        lineHeight: 1.1,
        marginBottom: minWidth >= 80 ? '2px' : '0px', // Снизили порог
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%'
      }}>
        <span>{flight.flightNo}</span>
        {/* Показываем тип самолета и тип рейса для лучшего понимания */}
        {minWidth >= 40 && (
          <span style={{
            fontSize: `${Math.max(fontPx - 3, 8)}px`,
            color: statusColors.text,
            opacity: 0.7,
            marginLeft: '2px'
          }}>
            {flight.acType} ({flight.type})
          </span>
        )}
      </div>
      
      {/* Маршрут - показываем если достаточно места */}
      {minWidth >= 60 && ( // Уменьшили минимальную ширину для отображения маршрута
        <div style={{ 
          fontSize: `${Math.max(fontPx - 1, 9)}px`,
          lineHeight: 1.1,
          marginBottom: '1px',
          color: statusColors.text,
          opacity: 0.9,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {to ? `${from} → ${to}` : from}
        </div>
      )}
      
      {/* Время обслуживания - всегда показываем если есть место */}
      {minWidth >= 50 && ( // Уменьшили минимальную ширину для времени
        <div style={{ 
          fontSize: `${Math.max(fontPx - 2, 8)}px`,
          lineHeight: 1.1,
          color: statusColors.text,
          opacity: 0.8,
          display: 'flex',
          justifyContent: minWidth >= 100 ? 'space-between' : 'flex-start', // Снизили порог
          width: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          <span>
            {minWidth >= 100  // Снизили порог для показа полного времени
              ? `${toHHMM(flight.serviceStart)} - ${toHHMM(flight.serviceEnd)}`
              : `${toHHMM(flight.serviceStart)}`
            }
          </span>
          {parkingPosition && minWidth >= 120 && ( // Снизили порог для парковки
            <span style={{ fontWeight: '600' }}>🅿️{parkingPosition}</span>
          )}
        </div>
      )}
      
      {/* Индикаторы окон */}
      {(loadingWindow || unloadingWindow) && (
        <div style={{
          position: 'absolute',
          bottom: '-25px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: `${Math.max(fontPx - 2, 9)}px`,
          color: '#374151',
          display: 'flex',
          gap: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid #D1D5DB',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          zIndex: 10
        }}>
          {loadingWindow && (
            <span style={{ 
              color: '#059669', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              📦 {loadingWindow}
            </span>
          )}
          {unloadingWindow && (
            <span style={{ 
              color: '#DC2626', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              📤 {unloadingWindow}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
