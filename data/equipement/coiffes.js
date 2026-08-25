// coiffes.js - Avec ajout du champ image

import { categorie, Class, Element, getImagePath } from '../types.js';

export const coiffes = [
  {
    id: 16362,
    nom: "Coiffe du Comte Harebourg",
    level: 200,
    categorie: categorie.coiffes,
    
    // ✅ Ajout du chemin d'image
    image: "assets/images/equipements/coiffes/16362.png",
    
    stats: {
      vita: 300,
      initiative: 100,
      prospection: 100,
      sagesse: 40,
      
      resistance: {
        neutre: 5,
        terre: 5,
        feu: 5,
        eau: 5,
        air: 5
      },
      
      caracteristiques: {
        force: 50,
        intelligence: 50,
        chance: 50,
        agilite: 50
      },
      
      portee: 0,
      pm: 0,
      pa: 0
    },
    
    conditions: {
      level: 200,
      classe: null,
      sexe: null,
      stats_min: {
        force: 0,
        intelligence: 0,
        chance: 0,
        agilite: 0
      }
    },
    
    panoplie: {
      nom: "Comte Harebourg",
      bonus: {
        2: { intelligence: 50, sagesse: 20 },
        3: { intelligence: 100, sagesse: 40 },
        4: { intelligence: 150, sagesse: 60 }
      }
    },
    
    craft: {
      metier: "Bricoleur",
      niveau: 200,
      ressources: [
        { id: 12345, nom: "Ressource exemple", quantite: 10 }
      ]
    },
    
    version: "2.70",
    mise_a_jour: "2025-05-20"
  },
  
  {
    id: 16349,
    nom: "Coiffe de Padgref",
    level: 198,
    categorie: categorie.coiffes,
    
    image: "assets/images/equipements/coiffes/16349.png",
    
    stats: {
      vita: 310,
      initiative: 0,
      prospection: 0,
      sagesse: 0,
      
      resistance: {
        neutre: 4,
        terre: 4,
        feu: 4,
        eau: 4,
        air: 4
      },
      
      caracteristiques: {
        force: 60,
        intelligence: 0,
        chance: 0,
        agilite: 0
      },
      
      portee: 0,
      pm: 0,
      pa: 1
    },
    
    conditions: {
      level: 198,
      classe: [Class.IOP, Class.SACRIEUR, Class.OSAMODAS],
      sexe: null,
      stats_min: {
        force: 300,
        intelligence: 0,
        chance: 0,
        agilite: 0
      }
    },
    
    panoplie: {
      nom: "Padgref",
      bonus: {
        2: { force: 30, dommages: 10 },
        3: { force: 60, dommages: 20 },
        4: { force: 100, dommages: 30 }
      }
    },
    
    craft: {
      metier: "Forgemage",
      niveau: 198,
      ressources: [
        { id: 54321, nom: "Bois pourfendu", quantite: 25 },
        { id: 54322, nom: "Pierre runique", quantite: 15 }
      ]
    },
    
    version: "2.70",
    mise_a_jour: "2025-05-20"
  },
  {
    id: 16363,
    nom: "Coiffe Séculaire",
    level: 200,
    categorie: categorie.coiffes,
    image: "assets/images/equipements/coiffes/16363.png",
    
    stats: {
      vita: 250,
      initiative: 60,
      prospection: 40,
      sagesse: 30,

      resistance: {
        neutre: 4,
        terre: 4,
        feu: 4,
        eau: 4,
        air: 4
      },

      caracteristiques: {
        force: 20,
        intelligence: 20,
        chance: 20,
        agilite: 20
      },

      portee: 0,
      pm: 0,
      pa: 0
    },

    conditions: {
      level: 200,
      classe: null,
      sexe: null,
      stats_min: {
        force: 0,
        intelligence: 0,
        chance: 0,
        agilite: 0
      }
    },

    panoplie: {
      nom: "Sécularité",
      bonus: {
        2: { sagesse: 20, initiative: 20 },
        3: { sagesse: 40, initiative: 40 },
        4: { sagesse: 60, initiative: 60 }
      }
    },

    craft: {
      metier: "Bricoleur",
      niveau: 200,
      ressources: [
        { id: 88888, nom: "Ressource séculaire", quantite: 10 }
      ]
    },

    version: "2.70",
    mise_a_jour: "2025-05-25"
  }
];

export const getCoiffeById = (id) => coiffes.find(c => c.id === id);
export const getCoiffeByName = (name) => coiffes.find(c => c.nom === name);
export const getCoiffesByLevel = (minLevel, maxLevel = 200) => 
  coiffes.filter(c => c.level >= minLevel && c.level <= maxLevel);
export const getCoiffesByClass = (classe) => 
  coiffes.filter(c => !c.conditions.classe || c.conditions.classe.includes(classe));