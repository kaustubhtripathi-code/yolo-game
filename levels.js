// levels.js — THE WHOLE GAME'S CONTENT. This is the file you edit.
//
// A level is an ASCII map: one character = one 24px tile. Because levels are
// text, they can be validated (tools/validate.cjs proves every pickup is
// reachable with the real jump physics), diffed, and written by hand in a
// minute. Nothing else in the codebase knows what a "level" is.
//
//   .  empty            #  solid ground        -  jump-through platform
//   P  spawn            E  the one you reunite with
//   h  heart (+1 life)  *  souvenir (collectible memory)
//   c  coffee (speed boost, 6s)                u  steam vent (hurts)
//   g  critter (walks its ledge, hurts)        ~  SECRET pit: this gap does not kill
//
// Rows must all be the same length. Bottom row is the ground line.
(function (root) {
  'use strict';

  // --- who you are ----------------------------------------------------------
  // Swap these for the two of you. `pal` drives the procedural sprite art:
  // change a hex and the character changes, in every pose, everywhere.
  const CAST = {
    a: {
      name: 'Alex', short: 'A',
      pal: { hair: '#3a2418', skin: '#f0c199', top: '#1f7a7a', bottom: '#2f3550', shoe: '#e8e4dc', accent: '#e0483f' },
      hairStyle: 'curly',
    },
    b: {
      name: 'Mei', short: 'M',
      pal: { hair: '#1d1620', skin: '#f6cfa8', top: '#e0577a', bottom: '#3a3355', shoe: '#f2efe8', accent: '#ffd166' },
      hairStyle: 'long',
    },
  };

  // Outfit skins unlocked by "love level" — palette swaps only, same character.
  const OUTFITS = {
    default: { name: 'Everyday', lv: 1, patch: {} },
    winter:  { name: 'Snow day', lv: 2, patch: { top: '#b23b4e', bottom: '#2b2f4a', shoe: '#6b4a34', accent: '#f5f0e6' } },
    wedding: { name: 'Photoshoot', lv: 4, patch: { top: '#f2ecdd', bottom: '#d9c9a8', shoe: '#6b4a34', accent: '#b08968' } },
    festive: { name: 'Lantern night', lv: 6, patch: { top: '#c92a2a', bottom: '#2a1f1a', shoe: '#f5c542', accent: '#f5c542' } },
  };

  const D = '................................................................'; // 64

  const LEVELS = [
    {
      id: 'met',
      title: 'The night we met',
      place: 'Neon city, 2 a.m.',
      theme: 'neon',
      photo: 'photos/met.jpg',
      caption: 'The first photo. Neither of us knew yet.',
      souvenirs: [
        { name: 'The first coffee', icon: 'coffee' },
        { name: 'Karaoke mic', icon: 'mic' },
        { name: 'Metro ticket', icon: 'ticket' },
        { name: 'Neon tower', icon: 'tower' },
        { name: 'Instant photo', icon: 'camera' },
      ],
      map: [
        D, D, D, D, D,
        '............................*...................................',
        '...........................----.................................',
        '...........*...........h.............................*..........',
        '..........---.........----..........................----........',
        '..P.....g...........*.....h.........c.............g....*.....E..',
        '##############..##############...##########~...#################',
      ],
    },
    {
      id: 'harbour',
      title: 'Sunset on the harbour',
      place: 'Ferry pier, golden hour',
      theme: 'sunset',
      photo: 'photos/harbour.jpg',
      caption: 'You fell asleep on the ferry. I kept the ticket.',
      souvenirs: [
        { name: 'Egg tart', icon: 'tart' },
        { name: 'Ferry ticket', icon: 'ticket' },
        { name: 'Sea shell', icon: 'shell' },
        { name: 'Harbour tower', icon: 'tower' },
        { name: 'Iced coffee', icon: 'coffee' },
        { name: 'Polaroid', icon: 'camera' },
      ],
      map: [
        D, D, D, D, D,
        '.............................*..h...............................',
        '............................######..............................',
        '......*............h..........................*.................',
        '.....----.........---...----................-----...............',
        '..P...*.........h....g........c...*...........u.....*....g...E..',
        '##########...############..############~...#####################',
      ],
    },
    {
      id: 'snow',
      title: 'Snow, and nobody outside',
      place: 'The old town, winter',
      theme: 'snow',
      photo: 'photos/snow.jpg',
      caption: 'You said it never snows here. It snowed all week.',
      souvenirs: [
        { name: 'Hot chocolate', icon: 'coffee' },
        { name: 'Museum ticket', icon: 'ticket' },
        { name: 'Iron tower', icon: 'tower' },
        { name: 'Dried flower', icon: 'flower' },
        { name: 'Snow globe', icon: 'shell' },
        { name: 'Bakery box', icon: 'tart' },
        { name: 'Film camera', icon: 'camera' },
      ],
      map: [
        D, D, D, D, D,
        '....................h..........*................................',
        '...................####.......---...............................',
        '......*.......h.........*..................h........*...........',
        '.....---.....----......------............-----......----........',
        '..P.....h.........*..........g...c..........*...u........g.*.E..',
        '############...########...##########~...############...#########',
      ],
    },
    {
      id: 'mountain',
      title: 'Too high, too cold, worth it',
      place: 'The pass, 4,000 m',
      theme: 'mountain',
      photo: 'photos/mountain.jpg',
      caption: 'Altitude sickness and the best day of that year.',
      souvenirs: [
        { name: 'Prayer flag', icon: 'flower' },
        { name: 'Yak butter tea', icon: 'coffee' },
        { name: 'Summit stone', icon: 'shell' },
        { name: 'Bus ticket', icon: 'ticket' },
        { name: 'Little panda', icon: 'panda' },
        { name: 'Dumplings', icon: 'dumpling' },
        { name: 'Cloud photo', icon: 'camera' },
        { name: 'Silver ring', icon: 'ring' },
      ],
      map: [
        D, D, D,
        '............................*...................................',
        '...........................----.................................',
        '....................######.............---......................',
        '......................h.................*.......................',
        '.....*........h...........*..........h............*......h......',
        '....----.....---........-----.......---..........----....---....',
        '..P...*........u..........h..g........c...*.......u....g..*..E..',
        '#########...#######~...#########...##########...################',
      ],
    },
    {
      id: 'lanterns',
      title: 'A river full of lanterns',
      place: 'Old quarter, after the rain',
      theme: 'lantern',
      photo: 'photos/lanterns.jpg',
      caption: 'You wrote something on yours and would not tell me.',
      souvenirs: [
        { name: 'Paper lantern', icon: 'lantern' },
        { name: 'Silk ribbon', icon: 'flower' },
        { name: 'Street dumpling', icon: 'dumpling' },
        { name: 'River stone', icon: 'shell' },
        { name: 'Night market tea', icon: 'coffee' },
        { name: 'Wish note', icon: 'ticket' },
        { name: 'Blurry photo', icon: 'camera' },
      ],
      map: [
        D, D, D, D, D,
        '..................*...................h.........................',
        '.................----...............######......................',
        '.....*.......h.........*.......h.............*..........h.......',
        '....---.....----......---....-----..........----.......---......',
        '..P....h.........u.........*...g........c..u........*...g.*..E..',
        '###########...#######...##########~...#########...##############',
      ],
    },
    {
      id: 'dawn',
      title: 'We watched the sun come up',
      place: 'The coast road, 5:40 a.m.',
      theme: 'dawn',
      photo: 'photos/dawn.jpg',
      caption: 'Three years. Same person waiting at the end of every level.',
      souvenirs: [
        { name: 'Sunrise photo', icon: 'camera' },
        { name: 'Sea shell', icon: 'shell' },
        { name: 'Coast ticket', icon: 'ticket' },
        { name: 'Coffee to go', icon: 'coffee' },
        { name: 'Wild flower', icon: 'flower' },
        { name: 'Lantern keepsake', icon: 'lantern' },
        { name: 'Egg tart', icon: 'tart' },
        { name: 'Little panda', icon: 'panda' },
        { name: 'The ring', icon: 'ring' },
      ],
      map: [
        D, D, D,
        '...............................*................................',
        '..............................----..............................',
        '..........*...............h....................*................',
        '........-----...........######................----..............',
        '....*.......h.......*.........h...........*.........h...........',
        '...---.....----....---.......----........---.......-----........',
        '..P..*.......u.........h.g.........c.u.......*..g.......u.*..E..',
        '########...#######...#######~...########...########...##########',
      ],
    },
  ];

  // XP -> "love level". Souvenir 10, heart 3, secret 40, level clear 50.
  const XP_PER = { souvenir: 10, heart: 3, secret: 40, clear: 50 };
  const LOVE_CURVE = [0, 60, 150, 280, 450, 660, 920, 1250];

  root.Content = { CAST: CAST, OUTFITS: OUTFITS, LEVELS: LEVELS, XP_PER: XP_PER, LOVE_CURVE: LOVE_CURVE };
})(typeof module !== 'undefined' ? module.exports : window);
