import type { patrolTexts } from '../patrols';

/** French for the patrols and travellers (see content/patrols.ts). */
export const frPatrolTexts: typeof patrolTexts = {
  kinds: { goblins: 'Patrouille de gobelins', herd: 'Troupeau sauvage', bandits: 'Bandits' },
  travellers: {
    wounded: { name: 'Voyageur blessé', line: 'Blessé et loin de la route — une potion de soin l’aiderait.' },
    pilgrim: { name: 'Pèlerin', line: 'Une longue route, le sac vide. Un repas serait une gentillesse.' },
    trader: { name: 'Marchand', line: 'Un marchand au sac bien rempli, ouvert à un échange.' },
  },
  keyFragment: {
    name: 'Fragment de clé',
    description: 'Un morceau de quelque chose. D’autres s’emboîteront peut-être.',
  },
};
