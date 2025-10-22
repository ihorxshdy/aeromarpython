import React from 'react';

interface PlannerControlsProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  selectedLoadingWindow: number | null;
  selectedUnloadingWindow: number | null;
  onLoadingWindowChange: (window: number | null) => void;
  onUnloadingWindowChange: (window: number | null) => void;
}

export const PlannerControls: React.FC<PlannerControlsProps> = ({
  scale,
  onScaleChange,
  selectedLoadingWindow,
  selectedUnloadingWindow,
  onLoadingWindowChange,
  onUnloadingWindowChange
}) => {
  const scaleOptions = [
    { value: 0.5, label: '50%' },
    { value: 1, label: '100%' },
    { value: 1.5, label: '150%' },
    { value: 2, label: '200%' }
  ];

  const loadingWindows = Array.from({ length: 19 }, (_, i) => i + 1);
  const unloadingWindows = [20, 21, 22, 23];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      padding: '10px 20px',
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #e9ecef',
      flexWrap: 'wrap'
    }}>
      {/* Масштаб по горизонтали */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
          Масштаб:
        </label>
        <select
          value={scale}
          onChange={(e) => onScaleChange(Number(e.target.value))}
          style={{
            padding: '4px 8px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white'
          }}
        >
          {scaleOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Окна погрузки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
          Окно погрузки:
        </label>
        <select
          value={selectedLoadingWindow || ''}
          onChange={(e) => onLoadingWindowChange(e.target.value ? Number(e.target.value) : null)}
          style={{
            padding: '4px 8px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white',
            minWidth: '80px'
          }}
        >
          <option value="">Не выбрано</option>
          {loadingWindows.map(window => (
            <option key={window} value={window}>
              Окно {window}
            </option>
          ))}
        </select>
      </div>

      {/* Окна разгрузки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
          Окно разгрузки:
        </label>
        <select
          value={selectedUnloadingWindow || ''}
          onChange={(e) => onUnloadingWindowChange(e.target.value ? Number(e.target.value) : null)}
          style={{
            padding: '4px 8px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white',
            minWidth: '80px'
          }}
        >
          <option value="">Не выбрано</option>
          {unloadingWindows.map(window => (
            <option key={window} value={window}>
              Окно {window}
            </option>
          ))}
        </select>
      </div>

      {/* Индикаторы статуса */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: '#f59e0b',
            borderRadius: '3px'
          }} />
          <span style={{ fontSize: '12px', color: '#6c757d' }}>Выполнено</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: '#22c55e',
            borderRadius: '3px'
          }} />
          <span style={{ fontSize: '12px', color: '#6c757d' }}>В процессе</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: '#3b82f6',
            borderRadius: '3px'
          }} />
          <span style={{ fontSize: '12px', color: '#6c757d' }}>Запланировано</span>
        </div>
      </div>
    </div>
  );
};
