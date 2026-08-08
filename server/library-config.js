// library-config.js — which scraped-images sets the product can see.
//
// Hidden sets stay on disk and in git (they may come back, and old picks that
// reference their files keep rendering), but they are invisible everywhere the
// operator or the matcher picks NEW images: /api/image-library, the theme modal,
// and cross-folder body-slide matching. Dan curated this list 2026-08-08.
export const HIDDEN_SETS = new Set([
  'art',
  'artificial-intelligence-ai',
  'black-and-white',
  'cars',
  'christmas',
  'coding-developer',
  'crypto',
  'entrepreneur-hustle',
  'faceless-selfies',
  'fashion',
  'female-aesthetics',
  'friendship-community',
  'gaming',
  'golf',
  'home-decor-interior-design',
  'luxury',
  'male-aesthetics',
  'male-selfies',
  'music-instruments',
  'parenting-family',
  'philosophy',
  'relationship-couples',
  'running',
  'surrealist-art',
  'wealth',
  'work-career',
]);
