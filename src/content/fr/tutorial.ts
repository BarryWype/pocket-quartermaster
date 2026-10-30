import type { tutorialHints } from '../tutorial';

export const frTutorialHints: typeof tutorialHints = {
  gatherWood: {
    map: 'Marchez jusqu’aux arbres autour de vous et touchez-les pour récolter 4 bois.',
  },
  forgeSword: {
    default: 'Ouvrez Atelier → Forge.',
    forge: 'Forgez une épée en bois : vous connaissez déjà son plan.',
  },
  equipSword: {
    default: 'Ouvrez Équipe.',
    team: 'Bram, guerrier : tient la première ligne. Lyra, rôdeuse : rapide et précise. Mira, mage de feu : brûle des groupes entiers. Donnez l’épée à Bram.',
    hero: 'Touchez l’emplacement Arme et choisissez l’épée.',
  },
  seeThreat: {
    default: 'Ouvrez Expéditions.',
    expeditions: 'Cette expédition affronte des Bêtes. En rouge : aucun héros n’y répond encore. Touchez pour continuer.',
  },
  gatherKit: {
    default: 'Retournez à la carte : récoltez la viande, la peau et l’os autour de vous.',
    map: 'Un Paquetage du chasseur répond aux Bêtes. Récoltez la viande, la peau et l’os autour de vous.',
  },
  craftKit: {
    default: 'Ouvrez Atelier → Provisions.',
    provisions: 'Fabriquez un Paquetage du chasseur.',
  },
  equipKit: {
    default: 'Ouvrez Expéditions.',
    expeditions: 'Ouvrez la Cave aux rats et donnez le Paquetage du chasseur à un héros : la menace passe au vert.',
  },
  sendExpedition: {
    default: 'Ouvrez Expéditions.',
    expeditions: 'Envoyez l’équipe. La plupart des expéditions durent 15 à 45 minutes ; celle-ci prend quelques secondes.',
  },
  awaitReport: {
    default: 'Votre équipe est en route. Ouvrez Expéditions.',
    expeditions: 'Votre équipe est en route. Touchez Récupérer le butin à son retour.',
  },
  readReport: {
    default: 'Ouvrez Expéditions pour lire le rapport.',
    expeditions: 'Les expéditions sont la source des nouveaux plans : la première victoire de chaque jour en rapporte toujours un. Touchez pour fermer.',
  },
  done: {},
};
