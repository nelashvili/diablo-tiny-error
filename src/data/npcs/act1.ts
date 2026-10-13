import type { NpcDef } from '../schema';

export default [
  {
    id: 'medicAkarra',
    name: 'npc.medicAkarra',
    modelId: 'npc.medicAkarra',
    roles: ['healer', 'vendor', 'quest', 'respec'],
    vendorTable: 'vendor.medicAkarra',
    dialogue: ['npc.medicAkarra.d1', 'npc.medicAkarra.d2'],
  },
  {
    id: 'chiefCharzi',
    name: 'npc.chiefCharzi',
    modelId: 'npc.chiefCharzi',
    roles: ['smith', 'vendor', 'quest'],
    vendorTable: 'vendor.chiefCharzi',
    dialogue: ['npc.chiefCharzi.d1', 'npc.chiefCharzi.d2'],
  },
  {
    id: 'captainKasha',
    name: 'npc.captainKasha',
    modelId: 'npc.captainKasha',
    roles: ['mercs', 'quest'],
    dialogue: ['npc.captainKasha.d1', 'npc.captainKasha.d2'],
  },
  {
    id: 'gheedo',
    name: 'npc.gheedo',
    modelId: 'npc.gheedo',
    roles: ['vendor', 'gamble'],
    vendorTable: 'vendor.gheedo',
    dialogue: ['npc.gheedo.d1', 'npc.gheedo.d2'],
  },
  {
    id: 'masterYoduh',
    name: 'npc.masterYoduh',
    modelId: 'npc.masterYoduh',
    roles: ['quest'],
    dialogue: ['npc.masterYoduh.d1', 'npc.masterYoduh.d2'],
  },
] satisfies NpcDef[];
