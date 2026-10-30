import type { tutorialHints } from '../tutorial';

export const frTutorialHints: typeof tutorialHints = {
  collectWood: {
    map: 'Touchez l’arbre à côté de vous pour récolter du bois.',
  },
  forgeSword: {
    default: 'Ouvrez Artisanat → Forge pour fabriquer une épée en bois.',
    forge: 'Touchez Forger pour fabriquer votre première épée en bois.',
  },
  equipSword: {
    default: 'Ouvrez Équipe et donnez l’épée à un héros.',
    team: 'Choisissez Bram, le guerrier : les épées lui vont le mieux.',
    hero: 'Touchez l’emplacement Arme et choisissez l’épée.',
  },
  sendExpedition: {
    default: 'Ouvrez Expéditions et envoyez votre équipe.',
    expeditions: 'Envoyez l’équipe à la Cave aux rats. Ce premier voyage ne dure que quelques secondes.',
  },
  awaitReport: {
    map: 'Votre équipe est partie. Récoltez des animaux et des herbes en attendant, puis récupérez son butin dans Expéditions.',
    expeditions: 'Votre équipe est en route : la barre montre sa progression. À son retour, touchez Récupérer le butin.',
  },
  readReport: {
    default: 'Vos héros sont de retour ! Ouvrez Expéditions pour lire leur rapport.',
    expeditions: 'Leur rapport est dans l’onglet Rapports : ce qui s’est passé, le butin et l’XP gagnée. Les donjons sont la source des nouveaux plans : la première victoire de chaque jour en rapporte toujours un.',
  },
  findSanctum: {
    default: 'Explorez la carte pour trouver un Sanctuaire où utiliser votre Sceau.',
    map: 'Quelle chance : la Cave aux rats a donné un Sceau de Sanctuaire ! La plupart des expéditions n’en rapportent pas. Cherchez un Sanctuaire autour de vous (dézoomez pour voir plus loin) et touchez-le.',
  },
  sanctumIntro: {
    sanctum:
      'Les Sanctuaires sont des autels élémentaires gardés par un gardien. Approchez-vous à moins de 50 m et dépensez un Sceau pour le défier avec les héros présents : un seul essai, victoire ou défaite. Une victoire donne des éclats élémentaires pour imprégner votre équipement. Les gardiens sont coriaces : vous pourrez revenir quand votre équipe sera plus forte. Touchez pour fermer.',
  },
  outro: {
    map: 'Voilà la boucle : récolter, forger, équiper, envoyer. Battez la Palissade des bandits pour gagner une pioche et extraire de la pierre. Touchez pour fermer.',
  },
  done: {},
};
