import type { MissileDef } from '../schema';

export default [
  { id: 'blasturBolt', speed: 24, range: 18, radius: 0.25, vfx: 'vfx.blasturBolt' },
  { id: 'javelin', speed: 18, range: 14, radius: 0.3, vfx: 'vfx.javelin' },
  { id: 'disc', speed: 16, range: 12, radius: 0.3, vfx: 'vfx.disc' },
] satisfies MissileDef[];
