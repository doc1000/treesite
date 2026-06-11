import { useEffect, useRef } from "react";
import { INTENTS } from "./intents.js";

const DEADZONE = 0.5;

function readGamepadIntents(gamepad, prev) {
  const next = {
    up: false,
    down: false,
    left: false,
    right: false,
    select: false,
    back: false,
  };

  if (!gamepad) return { intents: [], next };

  const axX = gamepad.axes[0] ?? 0;
  const axY = gamepad.axes[1] ?? 0;

  if (gamepad.buttons[12]?.pressed) next.up = true;
  if (gamepad.buttons[13]?.pressed) next.down = true;
  if (gamepad.buttons[14]?.pressed) next.left = true;
  if (gamepad.buttons[15]?.pressed) next.right = true;

  if (axY < -DEADZONE) next.up = true;
  if (axY > DEADZONE) next.down = true;
  if (axX < -DEADZONE) next.left = true;
  if (axX > DEADZONE) next.right = true;

  if (gamepad.buttons[0]?.pressed) next.select = true;
  if (gamepad.buttons[1]?.pressed) next.back = true;

  const intents = [];
  if (next.up && !prev.up) intents.push(INTENTS.UP);
  if (next.down && !prev.down) intents.push(INTENTS.DOWN);
  if (next.left && !prev.left) intents.push(INTENTS.LEFT);
  if (next.right && !prev.right) intents.push(INTENTS.RIGHT);
  if (next.select && !prev.select) intents.push(INTENTS.SELECT);
  if (next.back && !prev.back) intents.push(INTENTS.BACK);

  return { intents, next };
}

export function useGamepad({ onIntent, enabled }) {
  const prevRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    select: false,
    back: false,
  });
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;

  useEffect(() => {
    if (!enabled) return undefined;

    let frame = 0;
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((p) => p?.connected) ?? null;
      const { intents, next } = readGamepadIntents(pad, prevRef.current);
      prevRef.current = next;
      for (const intent of intents) {
        onIntentRef.current?.(intent);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}
