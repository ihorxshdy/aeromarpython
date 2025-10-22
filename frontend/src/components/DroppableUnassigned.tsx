import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableUnassignedProps {
  children: React.ReactNode;
  totalWidth: number;
  height: number;
}

export const DroppableUnassigned: React.FC<DroppableUnassignedProps> = ({
  children,
  totalWidth,
  height
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: {
      type: 'unassigned',
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        width: totalWidth,
        minWidth: totalWidth, // Добавляем minWidth для гарантии
        height: height,
        backgroundColor: isOver ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
        border: isOver ? '2px dashed #ef4444' : 'none',
        transition: 'all 0.2s ease'
      }}
    >
      {children}
    </div>
  );
};
