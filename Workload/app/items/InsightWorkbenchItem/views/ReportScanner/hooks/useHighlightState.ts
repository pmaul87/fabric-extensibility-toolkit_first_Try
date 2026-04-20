import { useState, useCallback } from "react";

export interface HighlightState {
  selectedField: string | null;
  selectedVisual: string | null;
  showPreview: boolean;
}

export function useHighlightState() {
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedVisual, setSelectedVisual] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const handleFieldClick = useCallback((fieldKey: string) => {
    setSelectedField((prev) => {
      const newSelection = prev === fieldKey ? null : fieldKey;
      console.log("[useHighlightState] Field clicked:", {
        fieldKey,
        previousSelection: prev,
        newSelection,
        timestamp: new Date().toISOString(),
      });
      return newSelection;
    });
    setSelectedVisual(null);
    setShowPreview(true);
    
    // Force a small delay to ensure state is updated before re-render
    setTimeout(() => {
      console.log("[useHighlightState] Field state after update:", {
        fieldKey,
        shouldBeSelected: fieldKey,
      });
    }, 50);
  }, []);

  const handleVisualClick = useCallback((visualName: string) => {
    setSelectedVisual((prev) => {
      const newSelection = prev === visualName ? null : visualName;
      console.log("[useHighlightState] Visual clicked:", {
        visualName,
        previousSelection: prev,
        newSelection,
        timestamp: new Date().toISOString(),
      });
      return newSelection;
    });
    setSelectedField(null);
    setShowPreview(true);
    
    // Force a small delay to ensure state is updated before re-render
    setTimeout(() => {
      console.log("[useHighlightState] Visual state after update:", {
        visualName,
        shouldBeSelected: visualName,
      });
    }, 50);
  }, []);

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  const clearHighlights = useCallback(() => {
    setSelectedField(null);
    setSelectedVisual(null);
  }, []);

  return {
    selectedField,
    selectedVisual,
    showPreview,
    handleFieldClick,
    handleVisualClick,
    togglePreview,
    clearHighlights,
    setShowPreview,
  };
}
