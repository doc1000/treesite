import { useCallback, useEffect, useRef, useState } from "react";
import { INTENTS } from "./intents.js";

const ZONE_ORDER = ["topbar", "explorer", "treemap", "toolpanel"];

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isFormFieldFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (!FORM_TAGS.has(tag)) return false;
  if (tag === "INPUT" && el.type === "hidden") return false;
  return true;
}

function keyToIntent(e) {
  if (e.key === "Tab") {
    return e.shiftKey ? INTENTS.PREV_ZONE : INTENTS.NEXT_ZONE;
  }
  if (e.key === "Escape") return INTENTS.BACK;
  if (e.key === "Enter" || e.key === " ") return INTENTS.SELECT;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") return INTENTS.UP;
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") return INTENTS.DOWN;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") return INTENTS.LEFT;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") return INTENTS.RIGHT;
  return null;
}

export function useNavigation({ onActiveZoneChange } = {}) {
  const zonesRef = useRef(new Map());
  const [registeredOrder, setRegisteredOrder] = useState([]);
  const [activeZoneIndex, setActiveZoneIndex] = useState(0);

  const sortedZoneIds = ZONE_ORDER.filter((id) => registeredOrder.includes(id));
  const activeZoneId =
    sortedZoneIds.length > 0
      ? sortedZoneIds[Math.min(activeZoneIndex, sortedZoneIds.length - 1)]
      : null;

  useEffect(() => {
    onActiveZoneChange?.(activeZoneId);
  }, [activeZoneId, onActiveZoneChange]);

  const registerZone = useCallback((id, handlers) => {
    zonesRef.current.set(id, handlers);
    setRegisteredOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const unregisterZone = useCallback((id) => {
    zonesRef.current.delete(id);
    setRegisteredOrder((prev) => prev.filter((z) => z !== id));
    setActiveZoneIndex((idx) => Math.max(0, idx));
  }, []);

  const dispatchToZone = useCallback((zoneId, intent) => {
    const zone = zonesRef.current.get(zoneId);
    zone?.onIntent?.(intent);
  }, []);

  const cycleZone = useCallback(
    (direction) => {
      const ids = ZONE_ORDER.filter((id) => zonesRef.current.has(id));
      if (!ids.length) return;
      setActiveZoneIndex((idx) => {
        const currentId = ids[Math.min(idx, ids.length - 1)];
        const currentPos = ids.indexOf(currentId);
        const nextPos =
          direction === INTENTS.NEXT_ZONE
            ? (currentPos + 1) % ids.length
            : (currentPos - 1 + ids.length) % ids.length;
        const nextId = ids[nextPos];
        const zone = zonesRef.current.get(nextId);
        zone?.focus?.();
        return nextPos;
      });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      const inField = isFormFieldFocused();

      if (inField) {
        if (e.key === "Escape") {
          e.preventDefault();
          document.activeElement?.blur?.();
        }
        return;
      }

      const intent = keyToIntent(e);
      if (!intent) return;

      if (intent === INTENTS.NEXT_ZONE || intent === INTENTS.PREV_ZONE) {
        e.preventDefault();
        cycleZone(intent);
        return;
      }

      const ids = ZONE_ORDER.filter((id) => zonesRef.current.has(id));
      if (!ids.length) return;

      const zoneId = ids[Math.min(activeZoneIndex, ids.length - 1)];
      if (!zoneId) return;

      if (
        intent === INTENTS.UP ||
        intent === INTENTS.DOWN ||
        intent === INTENTS.LEFT ||
        intent === INTENTS.RIGHT ||
        intent === INTENTS.SELECT ||
        intent === INTENTS.BACK
      ) {
        e.preventDefault();
        dispatchToZone(zoneId, intent);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeZoneIndex, cycleZone, dispatchToZone]);

  const dispatchIntent = useCallback(
    (intent) => {
      const ids = ZONE_ORDER.filter((id) => zonesRef.current.has(id));
      if (!ids.length) return;
      const zoneId = ids[Math.min(activeZoneIndex, ids.length - 1)];
      if (zoneId) dispatchToZone(zoneId, intent);
    },
    [activeZoneIndex, dispatchToZone],
  );

  const focusZone = useCallback((zoneId) => {
    const ids = ZONE_ORDER.filter((id) => zonesRef.current.has(id));
    const pos = ids.indexOf(zoneId);
    if (pos < 0) return;
    setActiveZoneIndex(pos);
    zonesRef.current.get(zoneId)?.focus?.();
  }, []);

  return { registerZone, unregisterZone, activeZoneId, dispatchIntent, focusZone };
}
