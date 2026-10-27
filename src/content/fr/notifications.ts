import type { notificationCategories, notificationGroups, notificationTexts } from '../notifications';

type Texts = { title: string; description: string };

export const frNotificationGroups: Record<keyof typeof notificationGroups, Texts> = {
  expeditions: { title: 'Expéditions et héros', description: 'Résultats des expéditions, héros reposés et rappels quand les héros attendent.' },
  steps: { title: 'Pas et objectifs du jour', description: 'Coffres de pas et remise à zéro quotidienne.' },
};

export const frNotificationCategories: Record<keyof typeof notificationCategories, Texts> = {
  expeditionFinished: { title: 'Expédition terminée', description: 'Quand une équipe revient, avec le résultat.' },
  bigResult: { title: 'Grands résultats', description: 'Met en avant les boss vaincus, les plans et les Sceaux de Sanctuaire.' },
  heroesIdle: { title: 'Héros inactifs', description: 'Un petit rappel quand personne n’est parti depuis un moment.' },
  heroesRested: { title: 'Héros reposés', description: 'Quand les héros revenus blessés de la dernière expédition ont retrouvé tous leurs PV.' },
  chestUnlocked: { title: 'Coffre de pas débloqué', description: 'Quand vos pas du jour ouvrent un coffre.' },
  chestClose: { title: 'Prochain coffre tout proche', description: 'Quand le prochain coffre n’est plus qu’à une petite marche.' },
  dailyReset: { title: 'Nouvelle journée', description: 'À minuit, quand les coffres de pas se remettent à zéro.' },
};

export const frNotificationTexts: typeof notificationTexts = {
  outcome: {
    flawless: 'victoire sans faute',
    success: 'victoire',
    retreat: 'ils ont dû battre en retraite',
    defeat: 'défaite',
  },
  finished: { title: 'Expédition terminée', body: 'Votre équipe est revenue {du:dungeon} : {outcome} !' },
  bigResult: { title: '🏆 Grand résultat !', body: 'Votre équipe est revenue {du:dungeon} : {highlights} !' },
  groupFinished: { title: 'Vos équipes sont de retour', body: '{results}' },
  groupBigResult: { title: '🏆 Vos équipes reviennent avec de grandes nouvelles', body: '{results}' },
  highlights: { boss: 'boss vaincu', blueprint: 'nouveau plan ({item})', sigil: 'un Sceau de Sanctuaire' },
  heroesIdle: { title: 'Vos héros s’impatientent', body: 'Personne n’est parti en expédition depuis un moment. Envoyer une équipe ?' },
  heroesRested: { title: 'Héros reposés', body: 'Vos héros ont retrouvé toute leur santé, prêts pour la prochaine expédition.' },
  chestUnlocked: { title: 'Coffre de pas débloqué', body: 'Votre {chest} est prêt à être ouvert.' },
  chestClose: { title: 'Presque arrivé', body: 'Plus que {steps} pas avant votre {chest}.' },
  dailyReset: { title: 'Nouvelle journée', body: 'Nouvelle journée, nouveaux coffres de pas.' },
};
