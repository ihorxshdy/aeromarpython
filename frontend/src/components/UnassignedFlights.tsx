import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Flight } from '../types';
import { toHHMM } from '../utils';

interface UnassignedFlightsProps {
  flights: Flight[];
  onFlightClick?: (flight: Flight) => void;
}

export const UnassignedFlights: React.FC<UnassignedFlightsProps> = ({
  flights,
  onFlightClick
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: {
      type: 'unassigned',
    },
  });

  const unassignedFlights = flights.filter(f => !f.vehicleId);

  return (
    <div style={{
      width: '300px',
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
        Неназначенные рейсы ({unassignedFlights.length})
      </div>
      
      <div 
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          backgroundColor: isOver ? '#f0f9ff' : '#f9fafb',
          border: isOver ? '2px dashed #0ea5e9' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        {unassignedFlights.map((flight, index) => (
          <div
            key={flight.id}
            style={{
              marginBottom: '8px',
              position: 'relative'
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
              onClick={() => onFlightClick?.(flight)}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px'
              }}>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  {flight.flightNo}
                </span>
                <span style={{
                  fontSize: '12px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: flight.type === 'SMS' ? '#dbeafe' : '#dcfce7',
                  color: flight.type === 'SMS' ? '#1e40af' : '#166534'
                }}>
                  {flight.type}
                </span>
              </div>
              
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginBottom: '4px'
              }}>
                {flight.route} • {flight.acType}
              </div>
              
              <div style={{
                fontSize: '12px',
                color: '#374151'
              }}>
                STD: {toHHMM(flight.stdMin)}
              </div>
              
              <div style={{
                fontSize: '12px',
                color: '#374151'
              }}>
                Загрузка: {toHHMM(flight.loadStart)} - {toHHMM(flight.loadEnd)}
              </div>
              
              {flight.dmsRole && (
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginTop: '4px'
                }}>
                  DMS: {flight.dmsRole}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {unassignedFlights.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Все рейсы назначены
          </div>
        )}
      </div>
    </div>
  );
};
