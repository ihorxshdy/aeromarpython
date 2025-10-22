# Альтернативные подходы для Drag & Drop из неназначенных рейсов

## Проблема
DraggableFlight компоненты в области неназначенных рейсов не реагируют на drag события, хотя такие же компоненты в основной диаграмме работают корректно.

## Потенциальные причины

### 1. CSS-связанные проблемы
- `overflow-auto` на родительском контейнере может блокировать события
- `z-index` конфликты между элементами
- `pointer-events` настройки
- Абсолютное позиционирование может нарушать event bubbling

### 2. DnD Kit-специфичные проблемы
- Контейнер может не правильно обрабатывать события в scrollable области
- Collision detection может не работать в overflow контейнерах
- Transform координаты могут быть неправильными

### 3. Структурные проблемы
- Вложенность droppable зон
- Event propagation issues

## Альтернативные решения

### Подход 1: CSS фиксы
```css
/* Убедиться, что события проходят */
.unassigned-container {
  pointer-events: auto;
  position: relative;
}

.draggable-flight {
  pointer-events: auto;
  cursor: grab;
}

.draggable-flight:active {
  cursor: grabbing;
}
```

### Подход 2: Collision Detection
```typescript
// Кастомный collision detection для scrollable областей
const customCollisionDetection = (args) => {
  const { droppableContainers, active } = args;
  // Учитываем scroll offset
  return closestCenter(args);
};
```

### Подход 3: Два DndContext
```tsx
// Основная диаграмма
<DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
  {/* Основные рейсы */}
</DndContext>

// Неназначенные рейсы 
<DndContext onDragStart={handleUnassignedDragStart} onDragEnd={handleUnassignedDragEnd}>
  {/* Неназначенные рейсы */}
</DndContext>
```

### Подход 4: Native HTML5 Drag & Drop
```tsx
const handleNativeDragStart = (e: React.DragEvent, flight: Flight) => {
  e.dataTransfer.setData('flight', JSON.stringify(flight));
  e.dataTransfer.effectAllowed = 'move';
};

const handleNativeDrop = (e: React.DragEvent, machineId: string) => {
  e.preventDefault();
  const flightData = e.dataTransfer.getData('flight');
  const flight = JSON.parse(flightData);
  // Назначить рейс на машину
};
```

### Подход 5: Виртуализация
```tsx
// Выносим неназначенные рейсы из overflow контейнера
<div className="fixed-overlay">
  <DraggableFlight ... />
</div>
```

### Подход 6: Click-to-Select + Drop
```tsx
// 1. Click для выбора рейса
const [selectedFlight, setSelectedFlight] = useState(null);

// 2. Click на машину для назначения
const handleMachineClick = (machineId) => {
  if (selectedFlight) {
    assignFlight(selectedFlight, machineId);
    setSelectedFlight(null);
  }
};
```

## Рекомендуемая последовательность тестирования

1. **CSS Debug**: Добавить яркие границы и проверить pointer-events
2. **Console Logging**: Добавить логи в handleDragStart для неназначенных
3. **Z-index Fix**: Убедиться что draggable элементы не перекрыты
4. **Collision Detection**: Попробовать кастомный collision detector
5. **Native Drag**: Fallback на HTML5 drag & drop если нужно
