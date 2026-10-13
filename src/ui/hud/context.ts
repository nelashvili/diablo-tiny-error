import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { UiApi } from '../types';
import type { HudModel } from './model';
import type { FxModel } from './fx';

export interface HudContext {
  api: UiApi;
  model: HudModel;
  fx: FxModel;
}

export const HudCtx = createContext<HudContext | null>(null);

export function useHud(): HudContext {
  const c = useContext(HudCtx);
  if (!c) throw new Error('HUD context missing');
  return c;
}
