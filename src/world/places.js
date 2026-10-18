// The places that matter: destinations Cian can pick, shop signs along Main Street, and paint for the buildings
// they sit in. Positions come from OpenStreetMap (world.json `poi`), so this only says how each place looks.

// Destinations for the picker. `poi` is the OpenStreetMap name; `say` is what the car's voice says.
export const DESTINATIONS = [
  { id: 'home', poi: 'Home', label: 'Home', emoji: '🏠', colour: '#e5484d', say: 'home' },
  { id: 'kidz', poi: 'Kidz Akademy', label: 'Kidz Akademy', emoji: '🧸', colour: '#8e4ec6', say: 'Kidz Akademy' },
  { id: 'gaa', poi: 'Kilcullen GAA', label: 'GAA Club', emoji: '🏐', colour: '#222222', say: 'the G A A club' },
  { id: 'brew', poi: 'Little Brew Cafe', label: 'Little Brew', emoji: '☕', colour: '#0f8b8d', say: 'Little Brew' },
  { id: 'tearmann', poi: 'An Tearmann', label: 'An Tearmann', emoji: '🍰', colour: '#d9822b', say: 'An Tearmann' },
  { id: 'play', poi: 'Kilcullen Playground', label: 'Playground', emoji: '🛝', colour: '#30a46c', say: 'the playground' },
  { id: 'hall', poi: 'Kilcullen Town Hall', label: 'Town Hall', emoji: '🎭', colour: '#3e63dd', say: 'the Town Hall' },
  { id: 'kilashee', poi: 'Kilashee House Hotel', label: 'Kilashee', emoji: '🏰', colour: '#6e56cf', say: 'Kilashee' },
  { id: 'naas', poi: 'Kilcullen Road Roundabout', label: 'Naas', emoji: '🏁', colour: '#1f6feb', say: 'Naas' },
];

// Signs on buildings: text and colours. `wall` repaints the building the place is in.
export const SIGNS = {
  'Little Brew Cafe': { text: 'Little Brew', sub: 'coffee  ·  treats', bg: '#0f6f70', fg: '#ffffff', border: '#f2d16b', wall: '#f6f0e4', font: '"Trebuchet MS", Arial, sans-serif' },
  'An Tearmann': { text: 'An Tearmann', sub: 'café', bg: '#6b3a1f', fg: '#fbe9c9', border: '#e0a94e', wall: '#f3dfb8' },
  'Kidz Akademy': { text: 'Kidz Akademy', bg: '#8e4ec6', fg: '#fff35c', border: '#ffffff', wall: '#ffd23f', h: 4.6, roof: '#8e4ec6', font: '"Comic Sans MS", "Trebuchet MS", sans-serif', sub: 'crèche & preschool' },
  'Kilcullen Town Hall': { text: 'Kilcullen Town Hall', sub: 'Theatre', bg: '#1d2f5e', fg: '#f7f1dc', border: '#c9a54a', wall: '#f2ead2', h: 9 },
  "St Brigid's Church": { text: "St Brigid's Church", bg: '#3d3a35', fg: '#efe7d2', border: '#a99a76', wall: '#c9c1b1', h: 12, noSign: true },
  'The Hideout': { text: 'The Hideout', bg: '#16291f', fg: '#e9d9a6', border: '#b99b52', wall: '#f1ead8' },
  'The Spout': { text: 'The Spout', bg: '#7a1f1f', fg: '#ffe9b0', border: '#d6b25a' },
  "Bardon's": { text: "Bardon's", bg: '#203a2b', fg: '#f2e2ae', border: '#c3a35a' },
  'Kilcullen Garda Station': { text: 'Garda', sub: 'Síochána', bg: '#173a7a', fg: '#ffffff', border: '#ffffff', wall: '#ebe7de' },
  'Kilcullen Post Office': { text: 'An Post', bg: '#0b6b3a', fg: '#ffd200', border: '#ffd200' },
  Eurospar: { text: 'EUROSPAR', bg: '#e1251b', fg: '#ffffff', border: '#008a3e', font: 'Arial, sans-serif' },
  Applegreen: { text: 'applegreen', bg: '#5fb135', fg: '#ffffff', border: '#ffffff', font: 'Arial, sans-serif' },
  'Kilcullen Library': { text: 'Library', sub: 'Leabharlann', bg: '#2b4c7e', fg: '#ffffff', border: '#ffffff' },
  'River Cafe': { text: 'River Cafe', bg: '#2a6f97', fg: '#ffffff', border: '#ffffff' },
  "O'Connell's": { text: "O'Connell's", bg: '#14253a', fg: '#f3e2b0', border: '#c9a54a' },
  "McTernan's": { text: "McTernan's", bg: '#3c1e1e', fg: '#f3e2b0', border: '#c9a54a' },
  "Brennan's Hardware": { text: "Brennan's", sub: 'Hardware', bg: '#c0392b', fg: '#ffffff', border: '#ffffff' },
  'Woodbine Books': { text: 'Woodbine Books', bg: '#2d4a32', fg: '#f6eccd', border: '#c9b37a' },
  "Nolan's Butchers": { text: "Nolan's", sub: 'Butchers', bg: '#8b1e2b', fg: '#ffffff', border: '#ffffff' },
  'Kilcullen Credit Union': { text: 'Credit Union', bg: '#00539f', fg: '#ffffff', border: '#ffffff' },
  Centra: { text: 'CENTRA', bg: '#e30613', fg: '#ffffff', border: '#ffffff', font: 'Arial, sans-serif' },
  'Kilcullen Community Centre': { text: 'Community Centre', bg: '#3b5b2f', fg: '#ffffff', border: '#ffffff' },
  'Scoil Bhride': { text: 'Scoil Bhríde', bg: '#1f5f8b', fg: '#ffffff', border: '#ffffff' },
  'Cross and Passion College': { text: 'Cross & Passion College', bg: '#5b1f3f', fg: '#ffffff', border: '#e6c36a' },
  'Kilashee House Hotel': { text: 'Killashee Hotel', wall: '#d9cfbd', h: 12, roof: '#3f454d', noSign: true },
};
