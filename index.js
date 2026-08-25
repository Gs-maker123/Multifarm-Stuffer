// index.js - Point d'entrée unique pour toutes les catégories

import { amulettes } from './equipement/amulettes.js';
import { arcs } from './equipement/arcs.js';
import { coiffes } from './equipement/coiffes.js';

// Export de tous les équipements regroupés par catégorie
export const equipementsData = {
    coiffes: [],
    capes: [],
    bottes: [],
    amulettes,
    anneaux: [],
    arcs: [],
    baguettes: [],
    batons: [],
    ceintures: [],
    boucliers: [],
    dagues: [],
    dofus: [],
    dragodindes: [],
    epees: [],
    familiers: [],
    faux: [],
    haches: [],
    lances: [],
    marteaux: [],
    montiliers: [],
    muldos: [],
    pelles: [],
    trophees: [],
    volkornes: [],
    ressource: []
};

// Mapping des noms de catégories pour l'affichage
export const categorieNames = {
    coiffes: "Coiffe",
    capes: "Cape",
    amulettes: "Amulette",
    anneaux: "Anneau",
    arcs: "Arc",
    baguettes: "Baguette",
    batons: "Bâton",
    ceintures: "Ceinture",
    boucliers: "Bouclier",
    bottes: "Bottes",
    dagues: "Dague",
    dofus: "Dofus",
    dragodindes: "Dragodinde",
    epees: "Epée",
    familiers: "Familier",
    faux: "Faux",
    haches: "Hache",
    lances: "Lance",
    marteaux: "Marteau",
    montiliers: "Montilier",
    muldos: "Muldo",
    pelles: "Pelle",
    trophees: "Trophée",
    volkornes: "Volkorne",
    ressource: "Ressources"
};

// Configuration des slots multi-catégories
export const slotsConfig = [
    { id: "coiffes", nom: "Casque", emoji: "🎭", categorie: "coiffes" },
    { id: "capes", nom: "Cape", emoji: "🧥", categorie: "capes" },
    { id: "amulettes", nom: "Amulette", emoji: "📿", categorie: "amulettes" },
    { id: "anneaux1", nom: "Anneau 1", emoji: "💍", categorie: "anneaux" },
    { id: "anneaux2", nom: "Anneau 2", emoji: "💍", categorie: "anneaux" },
    { id: "ceintures", nom: "Ceinture", emoji: "🔗", categorie: "ceintures" },
    { id: "bottes", nom: "Bottes", emoji: "👢", categorie: "bottes" },
    { id: "armes", nom: "Arme", emoji: "⚔️", categories: ["armes", "arcs", "epees", "baguettes", "batons", "dagues", "haches", "marteaux", "lances", "pelles", "faux"] },
    { id: "boucliers", nom: "Bouclier", emoji: "🛡️", categorie: "boucliers" },
    { id: "familierMonture", nom: "Familier / Monture", emoji: "🐾", categories: ["familiers", "montiliers", "muldos", "dragodindes", "volkornes"] },
    { id: "dofus1", nom: "Dofus / Trophée 1", emoji: "🥚", categories: ["dofus", "trophees"] },
    { id: "dofus2", nom: "Dofus / Trophée 2", emoji: "🥚", categories: ["dofus", "trophees"] },
    { id: "dofus3", nom: "Dofus / Trophée 3", emoji: "🥚", categories: ["dofus", "trophees"] },
    { id: "dofus4", nom: "Dofus / Trophée 4", emoji: "🥚", categories: ["dofus", "trophees"] },
    { id: "dofus5", nom: "Dofus / Trophée 5", emoji: "🥚", categories: ["dofus", "trophees"] },
    { id: "dofus6", nom: "Dofus / Trophée 6", emoji: "🥚", categories: ["dofus", "trophees"] }
];

// Fonction pour obtenir tous les équipements
export function getAllEquipements() {
    let all = [];
    for (const cat of Object.values(equipementsData)) {
        if (Array.isArray(cat)) {
            all = all.concat(cat);
        }
    }
    return all;
}

// Fonction pour obtenir les équipements par catégorie
export function getEquipementsByCategorie(categorie) {
    if (categorie === 'all') {
        return getAllEquipements();
    }
    return equipementsData[categorie] || [];
}

// Fonction pour obtenir les catégories disponibles
export function getCategories() {
    return Object.keys(equipementsData).filter(cat => equipementsData[cat].length > 0);
}

// Fonction pour obtenir le nom d'affichage d'une catégorie
export function getCategorieDisplayName(categorie) {
    return categorieNames[categorie] || categorie;
}

// Fonction pour obtenir la catégorie d'un équipement
export function getItemCategorie(item) {
    if (item?.categorie) {
        return item.categorie;
    }

    for (const [cat, items] of Object.entries(equipementsData)) {
        if (Array.isArray(items) && items.some(entry => entry?.id === item?.id)) {
            return cat;
        }
    }

    return 'unknown';
}