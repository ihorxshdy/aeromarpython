import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Machine } from '../types';

interface HybridDroppableMachineSlotProps {
  machine: Machine;
  laneH: number;
  totalWidth: number;
  children: React.ReactNode;
  onNativeDrop?: (flight: any, machineId: string) => void;
  supportNativeDrop?: boolean;
}

export const HybridDroppableMachineSlot: React.FC<HybridDroppableMachineSlotProps> = ({
  machine,
  laneH,
  totalWidth,
  children,
  onNativeDrop,
  supportNativeDrop = false
}) => {
  // DnD Kit droppable
  const { isOver, setNodeRef } = useDroppable({
    id: machine.id,
    data: {
      type: 'machine',
      machine,
    },
  });

  // HTML5 drag & drop handlers
  const handleNativeDragOver = (e: React.DragEvent) => {
    if (supportNativeDrop) {
      e.preventDefault(); // Позволяем drop
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleNativeDrop = (e: React.DragEvent) => {
    if (supportNativeDrop) {
      e.preventDefault();
      console.log('🎯 Native drop on machine:', machine.name);
      
      try {
        const data = e.dataTransfer.getData('application/json');
        const draggedItem = JSON.parse(data);
        
        if (draggedItem.type === 'flight' && onNativeDrop) {
          console.log('✅ Processing native drop:', draggedItem.flight.flightNo, '→', machine.name);
          onNativeDrop(draggedItem.flight, machine.id);
        }
      } catch (error) {
        console.error('❌ Error processing native drop:', error);
      }
    }
  };

  const handleNativeDragEnter = (e: React.DragEvent) => {
    if (supportNativeDrop) {
      e.preventDefault();
      console.log('🔄 Native drag enter machine:', machine.name);
    }
  };

  const handleNativeDragLeave = (e: React.DragEvent) => {
    if (supportNativeDrop) {
      console.log('🔄 Native drag leave machine:', machine.name);
    }
  };

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
      // HTML5 drag & drop events
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
      onDragEnter={handleNativeDragEnter}
      onDragLeave={handleNativeDragLeave}
    >
      {children}
    </div>
  );
};
