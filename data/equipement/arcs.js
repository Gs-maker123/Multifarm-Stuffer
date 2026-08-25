// arcs.js - Base de données des arcs

import { Rarity, Class, Element } from '../types.js';

export const arcs = [
  {
    id: 26001,
    nom: "Arc du Precepteur d'Alignement",
    level: 200,
    categorie: "arcs",
    rarete: Rarity.LEGENDAIRE,
    
    stats: {
      vita: 250,
      initiative: 80,
      prospection: 50,
      sagesse: 30,
      
      resistance: {
        neutre: 4,
        terre: 4,
        feu: 4,
        eau: 4,
        air: 4
      },
      
      caracteristiques: {
        force: 0,
        intelligence: 60,
        chance: 60,
        agilite: 0
      },
      
      portee: 5,
      pm: 0,
      pa: 0,
      
      // Stats spécifiques aux armes
      degats: {
        min: 35,
        max: 45,
        element: Element.EAU
      }
    },
    
    conditions: {
      level: 200,
      classe: null,
      sexe: null,
      stats_min: {
        force: 0,
        intelligence: 200,
        chance: 200,
        agilite: 0
      }
    },
    
    panoplie: {
      nom: "Precepteur d'Alignement",
      bonus: {
        2: { intelligence: 50, chance: 50 },
        3: { intelligence: 100, chance: 100 },
        4: { intelligence: 150, chance: 150 }
      }
    },
    
    craft: {
      metier: "Archer",
      niveau: 200,
      ressources: [
        { id: 12345, nom: "Bois runique", quantite: 30 },
        { id: 12346, nom: "Corde magique", quantite: 15 }
      ]
    },
    
    version: "2.70",
    mise_a_jour: "2025-05-20"
  },
  
  {
    id: 26002,
    nom: "Arc Pourfendeur",
    level: 198,
    categorie: "arcs",
    rarete: Rarity.MYTHIQUE,
    
    stats: {
      vita: 280,
      initiative: 0,
      prospection: 0,
      sagesse: 0,
      
      resistance: {
        neutre: 3,
        terre: 3,
        feu: 3,
        eau: 3,
        air: 3
      },
      
      caracteristiques: {
        force: 0,
        intelligence: 0,
        chance: 0,
        agilite: 65
      },
      
      portee: 6,
      pm: 0,
      pa: 1,
      
      degats: {
        min: 40,
        max: 48,
        element: Element.AIR
      }
    },
    
    conditions: {
      level: 198,
      classe: [Class.CRA, Class.SRAM],
      sexe: null,
      stats_min: {
        force: 0,
        intelligence: 0,
        chance: 0,
        agilite: 300
      }
    },
    
    panoplie: {
      nom: "Pourfendeur",
      bonus: {
        2: { agilite: 30, dommages: 10 },
        3: { agilite: 60, dommages: 20 },
        4: { agilite: 100, dommages: 30 }
      }
    },
    
    craft: {
      metier: "Forgemage",
      niveau: 198,
      ressources: [
        { id: 54321, nom: "Bois pourfendu", quantite: 25 }
      ]
    },
    
    version: "2.70",
    mise_a_jour: "2025-05-20"
  }
];

// Export des utilitaires
export const getArcById = (id) => arcs.find(a => a.id === id);
export const getArcsByLevel = (minLevel, maxLevel = 200) => 
  arcs.filter(a => a.level >= minLevel && a.level <= maxLevel);
export const getArcsByElement = (element) => 
  arcs.filter(a => a.stats.degats?.element === element);