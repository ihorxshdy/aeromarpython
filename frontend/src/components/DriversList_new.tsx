import React from 'react';
import { Machine } from '../types';
import { toHHMM } from '../utils';

interface DriversListProps {
  machines: Machine[];
  onMachineAssign?: (driverId: string, machineId: string) => void;
  onMachineChange?: (machineId: string, newDriverId: string) => void;
}

// Мок-данные водителей (позже можно будет подгружать с API)
const availableDrivers = [
  { id: 'driver1', name: 'Иванов И.И.', phone: '+7 (999) 123-45-67' },
  { id: 'driver2', name: 'Петров П.П.', phone: '+7 (999) 234-56-78' },
  { id: 'driver3', name: 'Сидоров С.С.', phone: '+7 (999) 345-67-89' },
  { id: 'driver4', name: 'Козлов К.К.', phone: '+7 (999) 456-78-90' },
  { id: 'driver5', name: 'Волков В.В.', phone: '+7 (999) 567-89-01' },
  { id: 'driver6', name: 'Смирнов А.А.', phone: '+7 (999) 678-90-12' },
];

const DriversList: React.FC<DriversListProps> = ({
  machines,
  onMachineAssign,
  onMachineChange
}) => {
  // Группируем машины по водителям
  const machinesByDriver = machines.reduce((acc, machine) => {
    const driverName = machine.driver || 'Не назначен';
    if (!acc[driverName]) {
      acc[driverName] = [];
    }
    acc[driverName].push(machine);
    return acc;
  }, {} as Record<string, Machine[]>);

  const getDriverByName = (name: string) => {
    return availableDrivers.find(d => d.name === name);
  };

  return (
    <div style={{
      width: '320px',
      height: '100%',
      borderRight: '2px solid #e5e7eb',
      backgroundColor: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        fontWeight: 'bold',
        fontSize: '16px'
      }}>
        Водители и автолифты
      </div>
      
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px'
      }}>
        {Object.entries(machinesByDriver).map(([driverName, driverMachines]) => {
          const driver = getDriverByName(driverName);
          
          return (
            <div
              key={driverName}
              style={{
                marginBottom: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Заголовок водителя */}
              <div style={{
                padding: '12px',
                backgroundColor: driver ? '#f0fdf4' : '#fef2f2',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: driver ? '#166534' : '#dc2626'
                }}>
                  {driverName}
                </div>
                {driver && (
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '2px'
                  }}>
                    {driver.phone}
                  </div>
                )}
              </div>
              
              {/* Список машин водителя */}
              <div style={{ padding: '8px' }}>
                {driverMachines.map((machine) => (
                  <div
                    key={machine.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      marginBottom: '4px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 'bold',
                        color: '#374151'
                      }}>
                        {machine.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280'
                      }}>
                        Смена: {toHHMM(machine.shiftStart)} - {toHHMM(machine.shiftEnd)}
                      </div>
                      {machine.flex && (
                        <div style={{
                          fontSize: '10px',
                          color: '#f59e0b',
                          fontWeight: 'bold'
                        }}>
                          FLEX
                        </div>
                      )}
                    </div>
                    
                    {/* Селект для смены водителя */}
                    <select
                      value={machine.driver || ''}
                      onChange={(e) => {
                        if (onMachineChange) {
                          onMachineChange(machine.id, e.target.value);
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        maxWidth: '100px'
                      }}
                    >
                      <option value="">Не назначен</option>
                      {availableDrivers.map(driver => (
                        <option key={driver.id} value={driver.name}>
                          {driver.name.split(' ')[0]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Список доступных водителей */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        padding: '12px'
      }}>
        <div style={{
          fontWeight: 'bold',
          fontSize: '14px',
          marginBottom: '8px'
        }}>
          Доступные водители:
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          maxHeight: '120px',
          overflowY: 'auto'
        }}>
          {availableDrivers.map(driver => (
            <div key={driver.id} style={{ marginBottom: '4px' }}>
              {driver.name} • {driver.phone}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DriversList;
export { DriversList };
