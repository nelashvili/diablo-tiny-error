/**
 * Story text: the opening crawl and what quest givers say at each quest step
 * (`story.<quest>.<step>` while it is underway, `story.<quest>.done` once, after it is finished).
 */
export default {
  // Opening crawl (new heroes).
  'story.crawl.intro': 'A long time ago, in a galaxy slightly misspelled...',
  'story.crawl.episode': 'Episode I',
  'story.crawl.title': 'THE TINY ERROR',
  'story.crawl.p1':
    'It is a period of mild confusion. The Kybur Heart, the great crystal that keeps the Forse in balance, has just been re-tuned by a young Padawon.',
  'story.crawl.p2':
    'One keystroke. One tiny error. A hairline crack, and something ancient woke inside the crystal. The Syth call it THE ERROR. Everyone else calls it a very bad day.',
  'story.crawl.p3':
    'Now droyds march across the misty moon of Endoor, Tuskins raid the Mossfields, and the dark Count Dooky gathers his strength beneath the Old Yedi Temple. At a small outpost of the Rebel Allowance, a new hero arrives...',
  'story.crawl.skip': 'Tap or press any key to skip',

  // Closing crawl after Count Dooky falls (end of Act I).
  'story.act1End.intro': 'Meanwhile, in a galaxy still slightly misspelled...',
  'story.act1End.episode': 'Act I complete',
  'story.act1End.title': 'THE COUNT IS DOWN',
  'story.act1End.p1':
    'Count Dooky has fallen in the Undercroft. His red saber hisses out, and the Mossfields of Endoor are quiet again. Even the Ewokz are cautiously optimistic.',
  'story.act1End.p2':
    'But the crack in the Kybur Heart keeps growing. Master Yoduh can feel The Error moving on, toward the desert world of Tatoonie, where the second dark champion is waiting.',
  'story.act1End.p3':
    'The Rebel Allowance packs up its little outpost. Somewhere, a droyd beeps nervously. The adventure is only getting started...',

  // a1q1, Medic Akarra: the Tuskin Den.
  'story.a1q1.enter':
    "Tuskin Raiders have dug a den in the Mossfields, just past our fence. They keep stealing our power couplings. Clear them out and I'll teach you something worth knowing.",
  'story.a1q1.clear':
    'You found the den? Good. Now make sure not one Tuskin is left in it. They breed like... well, like Tuskins.',
  'story.a1q1.done':
    'The Mossfields are quiet for the first time in weeks. Here, let me show you a technique. Every hero needs a few new tricks.',

  // a1q2, Captain Kasha: the Crash Site.
  'story.a1q2.enter':
    'A ship came down hard past the Standing Stones. Allowance markings. Jawwas are stripping it bare as we speak. Find that crash site.',
  'story.a1q2.boss':
    'Their king, Bishy-Bosh, is running the salvage. Take him down before he sells our nav computer for parts.',
  'story.a1q2.done':
    "Bishy-Bosh is scrap? Ha! The ship's logs survived. They mention a Padawon, a crystal and a 'tiny error'. I don't like the sound of that. Here, you've earned this.",

  // a1q3, Medic Akarra: rescue Master Yoduh.
  'story.a1q3.enter':
    "Master Yoduh went to the old Ewokz village to study strange readings from the Kybur Heart. He hasn't called in for three days. Take the portal at the Standing Stones and bring him home.",
  'story.a1q3.boss':
    'Grizzwald the Rusty Smith has Master Yoduh caged somewhere in those ruins. Rusty, yes. Harmless, no.',
  'story.a1q3.report': "Master Yoduh made it back! He's by the fire. Go on, he's been asking for you.",
  'story.a1q3.done':
    'Free, I am. Thank you, young one. Felt it, I did: a crack in the Kybur Heart. One letter wrong, and The Error awoke. Its first servant, Count Dooky is.',

  // a1q4, Master Yoduh: the Old Comm Tower.
  'story.a1q4.enter':
    'Old, the Comm Tower in the Dagobaa Swamp is. Signals to the Syth, it sends. Silence it, you must.',
  'story.a1q4.boss':
    'On the top floor, the Countezz waits. Fond of plasma, she is. Fond of you, she will not be.',
  'story.a1q4.done': "Quiet, the tower is. Blind now, Dooky's spies are. Well done, hmm. Yes.",

  // a1q5, Captain Kasha: Count Dooky.
  'story.a1q5.temple':
    'Master Yoduh says Count Dooky has taken the Old Yedi Temple. Everything we fight out there crawls out of that place. End it.',
  'story.a1q5.undercroft':
    'Dooky is hiding below the temple, in the deepest Undercroft. Go down. All the way down.',
  'story.a1q5.boss': "He's down there. Count Dooky. Watch out for the red saber, and for his terrible puns.",
  'story.a1q5.done':
    'Dooky is finished and Endoor can breathe again. But Yoduh says The Error has already moved on, toward a desert world. Rest up, hero. That was only the first act.',
} satisfies Record<string, string>;
