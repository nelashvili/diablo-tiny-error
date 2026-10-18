import type { QuestDef } from '../schema';

/** Act I: Endoor (D2 Act I analogs in comments). Steps advance on game events (core/quests). */
export default [
  {
    // Den of Evil
    id: 'a1q1',
    act: 1,
    name: 'quest.a1q1',
    steps: [
      { id: 'enter', text: 'quest.a1q1.enter', on: { event: 'enterLevel', level: 'a1.tuskinDen' } },
      { id: 'clear', text: 'quest.a1q1.clear', on: { event: 'clearLevel', level: 'a1.tuskinDen' } },
      { id: 'report', text: 'quest.a1q1.report', on: { event: 'talkTo', npc: 'medicAkarra' } },
    ],
    reward: { skillPoints: 1 },
  },
  {
    // Sisters' Burial Ground (Blood Raven)
    id: 'a1q2',
    act: 1,
    name: 'quest.a1q2',
    steps: [
      { id: 'enter', text: 'quest.a1q2.enter', on: { event: 'enterLevel', level: 'a1.crashSite' } },
      { id: 'boss', text: 'quest.a1q2.boss', on: { event: 'killBoss', boss: 'bishyBosh' } },
      { id: 'report', text: 'quest.a1q2.report', on: { event: 'talkTo', npc: 'captainKasha' } },
    ],
    reward: { creditz: 500, statPoints: 5 },
  },
  {
    // The Search for Cain
    id: 'a1q3',
    act: 1,
    name: 'quest.a1q3',
    steps: [
      { id: 'enter', text: 'quest.a1q3.enter', on: { event: 'enterLevel', level: 'a1.ewokzRuins' } },
      { id: 'boss', text: 'quest.a1q3.boss', on: { event: 'killBoss', boss: 'grizzwaldRustySmith' } },
      { id: 'report', text: 'quest.a1q3.report', on: { event: 'talkTo', npc: 'masterYoduh' } },
    ],
    reward: { creditz: 800, statPoints: 5 },
  },
  {
    // The Forgotten Tower
    id: 'a1q4',
    act: 1,
    name: 'quest.a1q4',
    steps: [
      { id: 'enter', text: 'quest.a1q4.enter', on: { event: 'enterLevel', level: 'a1.commTower' } },
      { id: 'boss', text: 'quest.a1q4.boss', on: { event: 'killBoss', boss: 'theCountezz' } },
    ],
    reward: { creditz: 1500 },
  },
  {
    // Sisters to the Slaughter
    id: 'a1q5',
    act: 1,
    name: 'quest.a1q5',
    steps: [
      { id: 'temple', text: 'quest.a1q5.temple', on: { event: 'enterLevel', level: 'a1.yediTemple' } },
      {
        id: 'undercroft',
        text: 'quest.a1q5.undercroft',
        on: { event: 'enterLevel', level: 'a1.undercroft2' },
      },
      { id: 'boss', text: 'quest.a1q5.boss', on: { event: 'killBoss', boss: 'countDooky' } },
    ],
    reward: { skillPoints: 1, statPoints: 5 },
  },
] satisfies QuestDef[];
