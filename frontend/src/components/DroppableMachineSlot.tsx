import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Machine } from '../types';

interface DroppableMachineSlotProps {
  machine: Machine;
  laneH: number;
  totalWidth: number;
  children: React.ReactNode;
}

export const DroppableMachineSlot: React.FC<DroppableMachineSlotProps> = ({
  machine,
  laneH,
  totalWidth,
  children
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: machine.id,
    data: {
      type: 'machine',
      machine,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        height: laneH,
        width: totalWidth,
        backgroundColor: isOver ? '#f0f9ff' : 'transparent',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};
