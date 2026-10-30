import type { notificationCategories, notificationGroups, notificationTexts } from '../notifications';

type Texts = { title: string; description: string };

export const frNotificationGroups: Record<keyof typeof notificationGroups, Texts> = {
  expeditions: { title: 'Expéditions et héros', description: 'Résultats des expéditions, héros reposés et rappels quand les héros attendent.' },
  steps: { title: 'Pas et objectifs du jour', description: 'Coffres de pas, remise à zéro quotidienne et cibles de quête.' },
  patrols: { title: 'Patrouilles', description: 'Patrouilles et voyageurs repérés à proximité, et votre escorte.' },
  places: { title: 'Lieux à proximité', description: 'Combats, ruines, trésors et lieux secrets proches de votre marche.' },
};

export const frNotificationCategories: Record<keyof typeof notificationCategories, Texts> = {
  expeditionFinished: { title: 'Expédition terminée', description: 'Quand une équipe revient, avec le résultat.' },
  bigResult: { title: 'Grands résultats', description: 'Met en avant les boss vaincus, les plans et les Sceaux de Sanctuaire.' },
  heistFinished: {
    title: 'Cambriolage terminé',
    description: 'Quand un héros revient d’un cambriolage de la guilde des voleurs, avec du butin ou les mains vides.',
  },
  heroesIdle: { title: 'Héros inactifs', description: 'Un petit rappel quand personne n’est parti depuis un moment.' },
  heroesRested: { title: 'Héros reposés', description: 'Quand les héros revenus blessés de la dernière expédition ont retrouvé tous leurs PV.' },
  chestUnlocked: { title: 'Coffre de pas débloqué', description: 'Quand vos pas du jour ouvrent un coffre.' },
  chestClose: { title: 'Prochain coffre tout proche', description: 'Quand le prochain coffre n’est plus qu’à une petite marche.' },
  dailyReset: { title: 'Nouvelle journée', description: 'À minuit, quand les coffres de pas se remettent à zéro.' },
  walkSummary: { title: 'Résumé de marche', description: 'Quand la récolte auto s’arrête d’elle-même après un moment sans bouger.' },
  questReady: { title: 'Quête prête', description: 'Quand une quête de marche ou de patrouilles est terminée pendant que l’app est fermée, prête à réclamer.' },
  questTarget: { title: 'Cible de quête proche', description: 'Quand vous atteignez une cible de quête qui vous attend (prier, fouiller, combattre…) pendant que l’app est fermée.' },
  nearbyPlaces: { title: 'Lieux à proximité', description: 'Quand un combat, une ruine ou un trésor est près de votre marche (à choisir ci-dessous).' },
  secretPlace: { title: 'Lieu secret', description: 'Quand vous passez près d’un lieu secret indiqué et que vous avez une clé.' },
  patrolSpotted: { title: 'Patrouille repérée', description: 'Quand une patrouille ou un voyageur entre dans votre champ de vision pendant que l’app est fermée.' },
  escort: { title: 'Escorte', description: 'Quand votre escorte fait une pause pour se reposer ou est mise KO.' },
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
  heistFinished: { title: 'Cambriolage terminé', body: '{name} est de retour d’un cambriolage, {outcome}.' },
  heistOutcome: { loot: 'avec du butin', empty: 'les mains vides' },
  heroesIdle: { title: 'Vos héros s’impatientent', body: 'Personne n’est parti en expédition depuis un moment. Envoyer une équipe ?' },
  heroesRested: { title: 'Héros reposés', body: 'Vos héros ont retrouvé toute leur santé, prêts pour la prochaine expédition.' },
  chestUnlocked: { title: 'Coffre de pas débloqué', body: 'Votre {chest} est prêt à être ouvert.' },
  chestClose: { title: 'Presque arrivé', body: 'Plus que {steps} pas avant votre {chest}.' },
  dailyReset: { title: 'Nouvelle journée', body: 'Nouvelle journée, nouveaux coffres de pas.' },
  walkSummary: { title: 'Récolte auto arrêtée', body: 'Vous avez marché {distance}. Ouvrez le jeu pour voir votre récolte.' },
  patrolSpotted: { title: '{patrol} en vue', body: '{patrol} à {distance} (palier {tier})' },
  travellerSpotted: { title: '{traveller} à proximité', body: '{line}' },
  escortPaused: { title: 'Escorte en pause', body: '{hero} est à {percent} % de PV.' },
  escortKnockedOut: { title: 'Escorte KO', body: '{hero} a besoin de repos.' },
  questTarget: { title: 'Quête : {place} atteint', body: 'Ouvrez le jeu pour terminer votre quête ici.' },
  questMark: { title: 'L’étrange marque', body: 'Vous l’avez trouvée. Ouvrez le jeu pour voir ce qu’elle cache.' },
  questTargets: { title: '{count} cibles de quête atteintes', body: 'Ouvrez le jeu pour y terminer vos quêtes.' },
  questReady: { title: 'Quête terminée', body: 'Votre quête de {objective} est terminée. Ouvrez le jeu pour la réclamer.' },
  questsReady: { title: '{count} quêtes terminées', body: 'Ouvrez le jeu pour réclamer vos récompenses.' },
  questObjective: { walk: 'marche', patrols: 'patrouilles' },
  chestsUnlocked: { title: 'Coffres de pas débloqués', body: '{chests} sont prêts à être ouverts.' },
  nearbyPlace: { title: '{place} à proximité', body: 'À {distance} de votre chemin.' },
  nearbyPlaces: { title: 'Lieux à proximité', body: '{places}' },
  treasureSpot: 'Trésor',
  secretPlace: { title: 'Un lieu secret tout proche', body: '{place}, à {distance}. Vous avez une clé.' },
};
