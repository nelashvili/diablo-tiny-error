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
  'hud.objective.left': '{n} left',
  'story.actDone.step': 'The Error has moved on to Tatoonie. Act II is coming soon!',

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

  // Continuation pages (`.2`) shown after the first line.
  'story.a1q1.enter.2':
    "Careful out there. Tuskins don't belong on Endoor, which makes them twice as grumpy as usual. And they were already very grumpy.",
  'story.a1q1.done.2':
    "Between us, I don't think they came here on purpose. Something dragged them across the galaxy. I'd like to know what. Check the Holocron when you have a moment; I've been keeping notes.",
  'story.a1q2.enter.2':
    'If anything on that ship still works, the Jawwas will sell it by sundown. Ship logs especially. I want that black box.',
  'story.a1q2.boss.2':
    'He leads from the back, surrounded by scrap droyds. Clear the droyds and he runs out of friends fast.',
  'story.a1q2.done.2':
    "Wait. I know that registry. That's a Yedi courier. Kip Typo's courier. The Padawon who went down to the Heart. Whatever happened in that temple, Kip ran from it.",
  'story.a1q3.enter.2':
    "Yoduh is the only one who really understands that crystal. Without him, we're poking a bomb with a stick. Bring him back.",
  'story.a1q3.boss.2':
    'The Ewokz say Grizzwald used to forge parts for their village. Then one night he woke up rusty and angry, and started forging cages instead.',
  'story.a1q3.done.2':
    'Blamed young Kip, Dooky has. Wrong, he is. One mistake, everyone makes. Feed on blame, The Error does. Hmm. Much to do, we have.',
  'story.a1q4.enter.2':
    'Whisper to the stars, the Syth do, through that tower. Know our every move, they will, while it stands.',
  'story.a1q4.done.2':
    "Found a message, did you? 'Tell the Desert.' Hmm. Tatoonie, they mean. Worry about that later, we will. First, the Count.",
  'story.a1q5.temple.2':
    "Yoduh says Dooky was a Yedi once. Kip's own teacher. Don't let that make you go easy on him.",
  'story.a1q5.undercroft.2':
    "The deeper you go, the closer you get to the Heart. If the air starts spelling things wrong, you're on the right track.",
  'story.a1q5.done.2':
    "And Kip? If that kid is still out there, we're going to find them. Everybody gets one mistake. That's in the Allowance charter. Page one.",
} satisfies Record<string, string>;
