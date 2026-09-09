// keybinds.ts — user-rebindable controls (#71). Each action has TWO slots; a slot
// holds a normalized token: a lowercased keyboard key ('z', ' ', 'shift', 'arrowup'),
// a mouse button ('mouse0' left / 'mouse1' middle / 'mouse2' right), or '' for empty.
// The keydown/pointerdown handlers in main.ts write held state into `keys` (input.ts)
// using these same tokens, so the sim just asks held(action). Persisted to localStorage.
import { keys } from './input.js';

export type KeyAction = 'up' | 'down' | 'left' | 'right' | 'focus' | 'shoot' | 'ability';
export const KEY_ACTIONS: KeyAction[] = ['up','down','left','right','focus','shoot','ability'];
export const ACTION_LABELS: Record<KeyAction,string> = {
  up:'Move Up', down:'Move Down', left:'Move Left', right:'Move Right',
  focus:'Focus (slow)', shoot:'Shoot', ability:'Ability',
};
// Defaults keep the historical movement/focus keys as the two slots; shoot + ability
// each get a two-key default (shoot = Z or Left-click, ability = Space or X, #71).
const DEFAULTS: Record<KeyAction,[string,string]> = {
  up:      ['w','arrowup'],
  down:    ['s','arrowdown'],
  left:    ['a','arrowleft'],
  right:   ['d','arrowright'],
  focus:   ['shift',''],
  shoot:   ['z','mouse0'],
  ability: [' ','x'],
};
const KEY = 'voidwake.keybinds';

function clone(src: Record<KeyAction,[string,string]>): Record<KeyAction,[string,string]> {
  return KEY_ACTIONS.reduce((o,a)=>{ o[a]=[src[a][0],src[a][1]]; return o; },
    {} as Record<KeyAction,[string,string]>);
}
function load(): Record<KeyAction,[string,string]> {
  const out = clone(DEFAULTS);
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) for (const a of KEY_ACTIONS){
      const v = s[a];
      if (Array.isArray(v) && v.length===2 && typeof v[0]==='string' && typeof v[1]==='string') out[a]=[v[0],v[1]];
    }
  } catch {}
  return out;
}

export const keybinds = load();
export function saveKeybinds(){ try { localStorage.setItem(KEY, JSON.stringify(keybinds)); } catch {} }

// assign a token to one slot (0|1) of an action, then persist (#71)
export function setBind(a: KeyAction, slot: number, token: string){
  if(slot!==0 && slot!==1) return;
  keybinds[a][slot] = token;
  saveKeybinds();
}
// #72 reset-to-default: is this action's binding unchanged from the shipped default?
export function bindIsDefault(a: KeyAction): boolean {
  return keybinds[a][0]===DEFAULTS[a][0] && keybinds[a][1]===DEFAULTS[a][1];
}
// #72 reset-to-default: restore an action's two slots to the shipped default, then persist.
export function resetBind(a: KeyAction){ keybinds[a]=[DEFAULTS[a][0],DEFAULTS[a][1]]; saveKeybinds(); }
// is either slot's key/button currently held?
export function held(a: KeyAction): boolean {
  const [k1,k2] = keybinds[a];
  return (!!k1 && !!keys[k1]) || (!!k2 && !!keys[k2]);
}
// does this token trigger the action (for edge-triggered inputs like the ability)?
export function matches(a: KeyAction, token: string): boolean {
  return token!=='' && keybinds[a].includes(token);
}
// pretty display for a bind slot in the settings UI
export function keyLabel(t: string): string {
  if(!t) return '—';
  const map: Record<string,string> = {
    ' ':'Space', arrowup:'↑', arrowdown:'↓', arrowleft:'←', arrowright:'→',
    shift:'Shift', control:'Ctrl', alt:'Alt', escape:'Esc', enter:'Enter',
    mouse0:'L-Click', mouse1:'M-Click', mouse2:'R-Click',
  };
  if(map[t]) return map[t];
  return t.length===1 ? t.toUpperCase() : t.charAt(0).toUpperCase()+t.slice(1);
}
