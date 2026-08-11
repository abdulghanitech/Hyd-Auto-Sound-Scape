/* Keyboard bindings.

   The arrow keys used to change tracks on the old site. They have to steer now,
   so the music transport moves to letters. There is no clever way around this —
   returning players have ← = previous-track muscle memory and will swerve into
   a wall the first time. The first-drive hint card calls it out.

   Uses e.code (physical key) throughout, so WASD still sits under the same
   fingers on AZERTY and Dvorak. */

const DRIVE_KEYS = new Set([
  "KeyW", "ArrowUp", "KeyS", "ArrowDown",
  "KeyA", "ArrowLeft", "KeyD", "ArrowRight",
  "KeyZ", "KeyQ", // AZERTY aliases
  "Space",
]);

export const KEY_HELP = [
  ["W / ↑", "Throttle"],
  ["S / ↓", "Brake · reverse"],
  ["A · D / ← →", "Steer"],
  ["Space", "Handbrake"],
  ["C", "Camera"],
  ["H", "Horn"],
  ["P", "Play · pause"],
  ["[ · ]", "Previous · next track"],
  ["F", "Photo mode"],
  ["Esc", "Menu"],
];

export function bindKeyboard({ onDrive, onAction }) {
  const held = new Set();

  const emit = () => {
    const up = held.has("KeyW") || held.has("ArrowUp") || held.has("KeyZ");
    const down = held.has("KeyS") || held.has("ArrowDown");
    const left = held.has("KeyA") || held.has("ArrowLeft") || held.has("KeyQ");
    const right = held.has("KeyD") || held.has("ArrowRight");

    onDrive({
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: held.has("Space"),
    });
  };

  const onKeyDown = (e) => {
    // Only yield to real form controls. Buttons and links are deliberately NOT
    // in this list: clicking START (or any HUD chip) leaves focus on that
    // button, and treating it as "the player is typing" killed the keyboard
    // entirely until they clicked the background. Buttons are blurred on click
    // instead, and preventDefault below stops Space re-triggering them.
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (DRIVE_KEYS.has(e.code)) {
      e.preventDefault(); // arrows and space scroll the page otherwise
      if (!held.has(e.code)) {
        held.add(e.code);
        emit();
      }
      return;
    }

    if (e.repeat) return;

    switch (e.code) {
      case "KeyC": onAction("camera"); break;
      case "KeyH": onAction("horn"); break;
      case "KeyP": onAction("playPause"); break;
      case "BracketLeft": onAction("prevTrack"); break;
      case "BracketRight": onAction("nextTrack"); break;
      case "KeyM": onAction("mute"); break;
      case "KeyF": onAction("photo"); break;
      case "Escape": onAction("menu"); break;
      default: break;
    }
  };

  const onKeyUp = (e) => {
    if (held.delete(e.code)) emit();
  };

  // A tab switch mid-throttle would otherwise leave the key stuck down.
  const onBlur = () => {
    if (held.size) {
      held.clear();
      emit();
    }
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
  };
}
