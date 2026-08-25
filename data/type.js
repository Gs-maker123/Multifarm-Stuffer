// types.js - Ajout du champ image

export const Rarity = {
  COMMUN: 'commun',
  INCONNU: 'inconnu',
  CATEGORIE: 'categorie',
  MYTHIQUE: 'mythique',
  LEGENDAIRE: 'legendaire'
};

export const Class = {
  FECA: 'Feca',
  OSAMODAS: 'Osamodas',
  ENUTROF: 'Enutrof',
  SRAM: 'Sram',
  XELOR: 'Xelor',
  ECAFLIP: 'Ecaflip',
  ENIRIPSA: 'Eniripsa',
  IOP: 'Iop',
  CRA: 'Cra',
  SADIDA: 'Sadida',
  SACRIEUR: 'Sacrieur',
  PANDAWA: 'Pandawa',
  ROUBLARD: 'Roublard',
  ZOBAL: 'Zobal',
  STEAMER: 'Steamer',
  ELIOTROPE: 'Eliotrope',
  HUPPERMAGE: 'Huppermage',
  OUGINAK: 'Ouginak'
};

export const Element = {
  NEUTRE: 'Neutre',
  TERRE: 'Terre',
  FEU: 'Feu',
  EAU: 'Eau',
  AIR: 'Air'
};

// Nouvelle fonction utilitaire pour générer le chemin d'image
export const getImagePath = (categorie, id, nom) => {
  // Nettoie le nom pour le nom de fichier (supprime accents, espaces, etc.)
  const cleanName = nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^a-z0-9]/g, '_') // Remplace les caractères spéciaux par _
    .replace(/_+/g, '_') // Supprime les underscores multiples
    .replace(/^_|_$/g, ''); // Supprime les underscores au début/fin
  
  // Essayer plusieurs formats possibles
  const formats = [
    `assets/images/equipements/${categorie}/${id}.png`,
    `assets/images/equipements/${categorie}/${id}.webp`,
    `assets/images/equipements/${categorie}/${id}.jpg`,
    `assets/images/equipements/${categorie}/${cleanName}.png`,
    `assets/images/equipements/${categorie}/${cleanName}.webp`,
    `assets/images/equipements/default.png` // Image par défaut
  ];
  
  return formats[0]; // Retourne le premier format par défaut
};