export * from './types';
export { createInputManager, detectTouch } from './manager';
export type { InputManager, InputManagerOptions } from './manager';
export { MouseKeyboardDevice } from './mouseKeyboard';
export type { MouseKeyboardOptions } from './mouseKeyboard';
export { GamepadDevice, PAD, DEFAULT_PAD_SKILLS } from './gamepad';
export type { GamepadOptions } from './gamepad';
export { DEFAULT_KEYBINDINGS, resolveKey } from './keybindings';
export type { KeyAction, KeyBindings } from './keybindings';
export {
  findAutoTarget,
  findInteractTarget,
  resolveAutoAim,
  autoAimRadius,
  isHostile,
  isInteractable,
  getLocalPlayer,
} from './autoTarget';
export * from './math';
