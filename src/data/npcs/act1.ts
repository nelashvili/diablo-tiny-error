import type { NpcDef } from '../schema';

export default [
  {
    id: 'medicAkarra',
    name: 'npc.medicAkarra',
    modelId: 'npc.medicAkarra',
    roles: ['healer', 'vendor', 'quest', 'respec'],
    vendorTable: 'vendor.medicAkarra',
    dialogue: ['npc.medicAkarra.d1', 'npc.medicAkarra.d2'],
    topics: [
      { label: 'npc.topic.self', lines: ['npc.medicAkarra.self.1', 'npc.medicAkarra.self.2'] },
      { label: 'npc.topic.heart', lines: ['npc.medicAkarra.heart.1', 'npc.medicAkarra.heart.2'] },
    ],
  },
  {
    id: 'chiefCharzi',
    name: 'npc.chiefCharzi',
    modelId: 'npc.chiefCharzi',
    roles: ['smith', 'vendor', 'quest'],
    vendorTable: 'vendor.chiefCharzi',
    dialogue: ['npc.chiefCharzi.d1', 'npc.chiefCharzi.d2'],
    topics: [
      { label: 'npc.topic.self', lines: ['npc.chiefCharzi.self.1', 'npc.chiefCharzi.self.2'] },
      { label: 'npc.topic.droyds', lines: ['npc.chiefCharzi.droyds.1', 'npc.chiefCharzi.droyds.2'] },
    ],
  },
  {
    id: 'captainKasha',
    name: 'npc.captainKasha',
    modelId: 'npc.captainKasha',
    roles: ['mercs', 'quest'],
    dialogue: ['npc.captainKasha.d1', 'npc.captainKasha.d2'],
    topics: [
      { label: 'npc.topic.self', lines: ['npc.captainKasha.self.1', 'npc.captainKasha.self.2'] },
      {
        label: 'npc.topic.allowance',
        lines: ['npc.captainKasha.allowance.1', 'npc.captainKasha.allowance.2'],
      },
    ],
  },
  {
    id: 'gheedo',
    name: 'npc.gheedo',
    modelId: 'npc.gheedo',
    roles: ['vendor', 'gamble'],
    vendorTable: 'vendor.gheedo',
    dialogue: ['npc.gheedo.d1', 'npc.gheedo.d2'],
    topics: [
      { label: 'npc.topic.self', lines: ['npc.gheedo.self.1', 'npc.gheedo.self.2'] },
      { label: 'npc.topic.stock', lines: ['npc.gheedo.stock.1', 'npc.gheedo.stock.2'] },
    ],
  },
  {
    id: 'masterYoduh',
    name: 'npc.masterYoduh',
    modelId: 'npc.masterYoduh',
    roles: ['quest'],
    dialogue: ['npc.masterYoduh.d1', 'npc.masterYoduh.d2'],
    topics: [
      { label: 'npc.topic.error', lines: ['npc.masterYoduh.error.1', 'npc.masterYoduh.error.2'] },
      { label: 'npc.topic.kip', lines: ['npc.masterYoduh.kip.1', 'npc.masterYoduh.kip.2'] },
    ],
  },
] satisfies NpcDef[];
