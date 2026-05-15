export const CARD_DRAG_MIME = "application/x-chitra-card";

let draggedCardId: string | null = null;

export function setDraggedCardId(cardId: string): void {
  draggedCardId = cardId;
}

export function getDraggedCardId(): string | null {
  return draggedCardId;
}

export function clearDraggedCardId(cardId?: string): void {
  if (cardId === undefined || draggedCardId === cardId) draggedCardId = null;
}