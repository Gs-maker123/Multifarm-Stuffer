// test.js - Application principale
const cacheBuster = Date.now();
const dataModule = await import(`./data/index.js?cache=${cacheBuster}`);
const syncModule = await import(`./data/dofusdbSync.js?cache=${cacheBuster}`);

const {
    categorieNames,
    equipementsData,
    slotsConfig,
    getAllEquipements,
    getEquipementsByCategorie,
    getCategories,
    getCategorieDisplayName,
    getItemCategorie
} = dataModule;
const { hydrateAllEquipementsFromDofusDB, getPanoplieBonusDetails, getPanoplieItems, getPanoplieCatalog, getItemRecipeDetails } = syncModule;

let fallbackBreedCatalogRequest = null;
const fallbackBreedSpellsCache = new Map();

async function getDofusDbBreedsFallback() {
    if (fallbackBreedCatalogRequest) return fallbackBreedCatalogRequest;

    fallbackBreedCatalogRequest = (async () => {
        const params = new URLSearchParams({ lang: 'fr', '$limit': '50', '$sort[sortIndex]': '1' });
        const response = await fetch(`https://api.dofusdb.fr/breeds?${params}`);
        if (!response.ok) throw new Error(`DofusDB breeds fetch failed: ${response.status}`);
        const payload = await response.json();
        return (payload.data || [])
            .filter(breed => breed && Array.isArray(breed.breedSpellsId) && breed.shortName?.fr)
            .sort((first, second) => Number(first.sortIndex || 0) - Number(second.sortIndex || 0));
    })();

    try {
        return await fallbackBreedCatalogRequest;
    } catch (error) {
        fallbackBreedCatalogRequest = null;
        throw error;
    }
}

async function getDofusDbBreedSpellsFallback(breedId) {
    const id = Number(breedId);
    if (fallbackBreedSpellsCache.has(id)) return fallbackBreedSpellsCache.get(id);

    const breeds = await getDofusDbBreeds();
    const breed = breeds.find(entry => Number(entry.id) === id);
    if (!breed) throw new Error('Classe DofusDB introuvable.');

    const levels = [];
    let skip = 0;
    let total = Infinity;
    while (skip < total) {
        const params = new URLSearchParams({ lang: 'fr', spellBreed: String(id), '$limit': '50', '$skip': String(skip) });
        const response = await fetch(`https://api.dofusdb.fr/spell-levels?${params}`);
        if (!response.ok) throw new Error(`DofusDB spell levels fetch failed: ${response.status}`);
        const payload = await response.json();
        const page = payload.data || [];
        levels.push(...page);
        total = Number(payload.total) || levels.length;
        if (!page.length) break;
        skip += page.length;
    }

    const levelsBySpellId = new Map();
    for (const level of levels) {
        const spellId = Number(level.spellId);
        if (!levelsBySpellId.has(spellId)) levelsBySpellId.set(spellId, []);
        levelsBySpellId.get(spellId).push(level);
    }

    const spellIds = [...new Set(breed.breedSpellsId.map(Number))];
    const spells = [];
    for (let index = 0; index < spellIds.length; index += 6) {
        const batch = spellIds.slice(index, index + 6);
        const results = await Promise.all(batch.map(async spellId => {
            try {
                const response = await fetch(`https://api.dofusdb.fr/spells/${spellId}?lang=fr`);
                if (!response.ok) return null;
                const spell = await response.json();
                return {
                    ...spell,
                    levels: (levelsBySpellId.get(Number(spell.id)) || []).sort((first, second) => Number(first.grade) - Number(second.grade))
                };
            } catch {
                return null;
            }
        }));
        spells.push(...results.filter(Boolean));
    }

    fallbackBreedSpellsCache.set(id, spells);
    return spells;
}

const getDofusDbBreeds = typeof syncModule.getDofusDbBreeds === 'function'
    ? syncModule.getDofusDbBreeds
    : getDofusDbBreedsFallback;
const getDofusDbBreedSpells = typeof syncModule.getDofusDbBreedSpells === 'function'
    ? syncModule.getDofusDbBreedSpells
    : getDofusDbBreedSpellsFallback;

// ==================== ÉTAT ====================
let userInventory = [];
let profilFiltersBound = false;
let bddFiltersBound = false;
let currentSet = {};
const legendaryStatusStorageKey = 'dofusLegendaryStatuses';
const legendaryStatuses = JSON.parse(localStorage.getItem(legendaryStatusStorageKey) || '{}');
let currentCategorie = 'all';
let currentSearchTerm = '';
let currentLevelFilterBdd = '';
let currentCategory = "all";
let searchTerm = "";
let levelFilter = "";
let forgePA = 0, forgePM = 0, forgePO = 0;
const savedDisplayMode = localStorage.getItem('dofusBddDisplayMode');
let currentDisplayMode = savedDisplayMode === 'image' ? 'image' : 'card';

// Templates
let templates = [];

// Filtres recherche avancée
let currentStatFilter = '';
let currentStatMin = '';
let currentStatMax = '';
let currentPanoplieFilter = '';

// Parchottages
let parchotageStats = {
    vita: 0,
    force: 0,
    intelligence: 0,
    chance: 0,
    agilite: 0,
    sagesse: 0
};

const CHARACTER_POINT_KEYS = ['force', 'agilite', 'chance', 'intelligence', 'sagesse', 'vita'];
const TIERED_CHARACTER_POINT_KEYS = new Set(['force', 'agilite', 'chance', 'intelligence']);
const CHARACTER_POINTS_STORAGE_KEY = 'dofusCharacteristicPoints';
let characteristicPoints = loadCharacteristicPoints();
const EQUIPMENT_FORGEMAGE_STORAGE_KEY = 'dofusEquipmentForgemage';
const FORGEMAGE_STATS = [
    { path: 'vita', label: 'Vitalité' },
    { path: 'sagesse', label: 'Sagesse' },
    { path: 'caracteristiques.force', label: 'Force' },
    { path: 'caracteristiques.agilite', label: 'Agilité' },
    { path: 'caracteristiques.chance', label: 'Chance' },
    { path: 'caracteristiques.intelligence', label: 'Intelligence' },
    { path: 'caracteristiques.puissance', label: 'Puissance' },
    { path: 'pa', label: 'PA' },
    { path: 'pm', label: 'PM' },
    { path: 'portee', label: 'Portée' },
    { path: 'prospection', label: 'Prospection' },
    { path: 'initiative', label: 'Initiative' },
    { path: 'critique', label: 'Coups critiques' },
    { path: 'doCri', label: 'Dommages critiques' },
    { path: 'soin', label: 'Soin' },
    { path: 'tacle', label: 'Tacle' },
    { path: 'fuite', label: 'Fuite' },
    { path: 'esqPA', label: 'Esquive PA' },
    { path: 'esqPM', label: 'Esquive PM' },
    { path: 'retPA', label: 'Retrait PA' },
    { path: 'retPM', label: 'Retrait PM' },
    { path: 'doNeutre', label: 'Dommages neutre' },
    { path: 'doTerre', label: 'Dommages terre' },
    { path: 'doFeu', label: 'Dommages feu' },
    { path: 'doEau', label: 'Dommages eau' },
    { path: 'doAir', label: 'Dommages air' },
    { path: 'dommage', label: 'Dommages' },
    { path: 'doPou', label: 'Dommages poussée' },
    { path: 'doPerArme', label: '% Dommages armes' },
    { path: 'doSort', label: '% Dommages sorts' },
    { path: 'doMelee', label: '% Dommages mêlée' },
    { path: 'doDist', label: '% Dommages distance' },
    { path: 'resistance.neutre', label: 'Résistance neutre' },
    { path: 'resistance.terre', label: 'Résistance terre' },
    { path: 'resistance.feu', label: 'Résistance feu' },
    { path: 'resistance.eau', label: 'Résistance eau' },
    { path: 'resistance.air', label: 'Résistance air' },
    { path: 'resistance.cri', label: 'Résistance critique' },
    { path: 'resistance.melee', label: 'Résistance mêlée' },
    { path: 'resistance.armes', label: 'Résistance armes' },
    { path: 'resistance.pou', label: 'Résistance poussée' },
    { path: 'resistance.dist', label: 'Résistance distance' }
];
let equipmentForgemage = loadEquipmentForgemage();

// Limites
const MAX_PA = 12;
const MAX_PM = 6;
const MAX_PO = 6;

// Stats de base
let baseStatsData = {
    vita: 1050, prospection: 100, sagesse: 0, pa: 7, pm: 3, portee: 0,
    force: 0, intelligence: 0, chance: 0, agilite: 0, puissance: 0,
    initiative: 0, critique: 0, soin: 0, pi: 0, fuite: 0, esqPA: 0, esqPM: 0,
    pods: 0, tacle: 0, retPA: 0, retPM: 0,
    doNeutre: 0, doTerre: 0, doFeu: 0, doEau: 0, doAir: 0,
    dommage: 0, doCri: 0, doPou: 0, doPerArme: 0, doSort: 0, doMelee: 0, doDist: 0,
    resistance: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0, cri: 0, melee: 0, armes: 0, pou: 0, dist: 0 }
};

// Initialisation des slots
slotsConfig.forEach(slot => { currentSet[slot.id] = null; });

// ==================== FONCTIONS UTILITAIRES ====================
function formatKamas(value) {
    if (!value && value !== 0) return '0';
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function loadCharacteristicPoints() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHARACTER_POINTS_STORAGE_KEY) || '{}');
        return normalizeCharacteristicPoints(saved);
    } catch {
        return normalizeCharacteristicPoints();
    }
}

function normalizeCharacteristicPoints(points = {}) {
    return Object.fromEntries(CHARACTER_POINT_KEYS.map(key => [key, Math.max(0, Math.floor(Number(points[key]) || 0))]));
}

function loadEquipmentForgemage() {
    try {
        const saved = JSON.parse(localStorage.getItem(EQUIPMENT_FORGEMAGE_STORAGE_KEY) || '{}');
        return saved && typeof saved === 'object' ? saved : {};
    } catch {
        return {};
    }
}

function getEquipmentForgemageModifiers(slotId, itemId) {
    const entry = equipmentForgemage[slotId];
    return entry && String(entry.itemId) === String(itemId) && Array.isArray(entry.modifiers)
        ? entry.modifiers
        : [];
}

function saveEquipmentForgemageModifiers(slotId, itemId, modifiers) {
    if (modifiers.length) {
        equipmentForgemage[slotId] = { itemId, modifiers };
    } else {
        delete equipmentForgemage[slotId];
    }
    localStorage.setItem(EQUIPMENT_FORGEMAGE_STORAGE_KEY, JSON.stringify(equipmentForgemage));
}

function captureTemplateConfiguration() {
    const set = {};
    const equipmentForgemage = {};
    for (const slot of slotsConfig) {
        const item = currentSet[slot.id];
        if (!item) continue;

        set[slot.id] = item;
        const modifiers = getEquipmentForgemageModifiers(slot.id, item.id);
        if (modifiers.length) {
            equipmentForgemage[slot.id] = {
                itemId: item.id,
                modifiers: modifiers.map(modifier => ({ ...modifier }))
            };
        }
    }

    return {
        set,
        forgePA,
        forgePM,
        forgePO,
        parchotageStats: { ...parchotageStats },
        characteristicPoints: { ...characteristicPoints },
        equipmentForgemage
    };
}

function addEquipmentForgemageToTotal(total, slotId, item) {
    for (const modifier of getEquipmentForgemageModifiers(slotId, item.id)) {
        const value = Number(modifier.value) || 0;
        const [group, key] = modifier.stat.split('.');
        if (group === 'caracteristiques' && total[key] !== undefined) {
            total[key] += value;
        } else if (group === 'resistance' && total.resistance[key] !== undefined) {
            total.resistance[key] += value;
        } else if (!key && total[group] !== undefined) {
            total[group] += value;
        }
    }
}

function getCharacterPointBudget() {
    let characterData = {};
    try {
        characterData = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
    } catch {
        characterData = {};
    }
    const displayedLevel = Number(document.getElementById('stuffCharacterLevel')?.textContent);
    const level = Math.max(1, Math.floor(Number(characterData.level) || displayedLevel || 200));
    return Math.max(0, (level - 1) * 5);
}

function getCharacteristicPointCost(stat, amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (stat === 'sagesse') return value * 3;
    if (!TIERED_CHARACTER_POINT_KEYS.has(stat)) return value;
    if (value <= 100) return value;
    if (value <= 200) return 100 + (value - 100) * 2;
    if (value <= 300) return 300 + (value - 200) * 3;
    return 600 + (value - 300) * 4;
}

function getMaxCharacteristicForBudget(stat, budget) {
    const points = Math.max(0, Math.floor(budget));
    if (stat === 'sagesse') return Math.floor(points / 3);
    if (!TIERED_CHARACTER_POINT_KEYS.has(stat) || points <= 100) return points;
    if (points <= 300) return 100 + Math.floor((points - 100) / 2);
    if (points <= 600) return 200 + Math.floor((points - 300) / 3);
    return 300 + Math.floor((points - 600) / 4);
}

function updateCharacterPointAllocationDisplay() {
    const panel = document.getElementById('characterPointAllocation');
    if (!panel) return;

    const budget = getCharacterPointBudget();
    const spent = CHARACTER_POINT_KEYS.reduce((total, key) => total + getCharacteristicPointCost(key, characteristicPoints[key]), 0);
    const remaining = budget - spent;
    const remainingElement = document.getElementById('characterPointsRemaining');
    const budgetElement = document.getElementById('characterPointsBudget');
    if (remainingElement) remainingElement.textContent = remaining;
    if (budgetElement) budgetElement.textContent = budget;
    panel.classList.toggle('over-budget', remaining < 0);

    panel.querySelectorAll('[data-character-point]').forEach(input => {
        const key = input.dataset.characterPoint;
        const value = characteristicPoints[key] || 0;
        const otherSpent = spent - getCharacteristicPointCost(key, value);
        input.value = value;
        input.max = Math.max(value, getMaxCharacteristicForBudget(key, budget - otherSpent));
    });
}

function initCharacterPointAllocation() {
    const panel = document.getElementById('characterPointAllocation');
    if (!panel) return;
    updateCharacterPointAllocationDisplay();
    if (panel.dataset.eventsBound) return;

    panel.addEventListener('change', event => {
        const input = event.target.closest('[data-character-point]');
        if (!input) return;

        const key = input.dataset.characterPoint;
        const previousValue = characteristicPoints[key] || 0;
        const nextValue = Math.max(0, Math.floor(Number(input.value) || 0));
        const otherSpent = CHARACTER_POINT_KEYS
            .filter(stat => stat !== key)
            .reduce((total, stat) => total + getCharacteristicPointCost(stat, characteristicPoints[stat]), 0);
        if (getCharacteristicPointCost(key, nextValue) > getCharacteristicPointCost(key, previousValue)
            && otherSpent + getCharacteristicPointCost(key, nextValue) > getCharacterPointBudget()) {
            input.value = previousValue;
            showToast('⚠️ Cette attribution dépasse les points disponibles.');
            return;
        }

        characteristicPoints[key] = nextValue;
        localStorage.setItem(CHARACTER_POINTS_STORAGE_KEY, JSON.stringify(characteristicPoints));
        updateCharacterPointAllocationDisplay();
        updateCharacterSheet();
    });
    panel.dataset.eventsBound = 'true';
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function getImagePath(item) {
    if (item?.image) {
        return item.image;
    }

    if (item?.imageName) {
        const categorie = item.categorie || getItemCategorie(item);
        return 'assets/images/equipements/' + categorie + '/' + item.imageName;
    }

    return 'assets/images/equipements/default.png';
}

// ==================== MODAL ====================
function displayPanoplieInfo(item) {
    if (!item.panoplie || !item.panoplie.nom) return '';
    
    return `
        <div class="detail-section">
            <h4>✨ Panoplie</h4>
            <div class="detail-row">
                <span class="detail-label">Nom</span>
                <span class="detail-value">${escapeHtml(item.panoplie.nom)}</span>
            </div>
            ${item.panoplie.niveau ? `<div class="detail-row">
                <span class="detail-label">Niveau</span>
                <span class="detail-value">${item.panoplie.niveau}</span>
            </div>` : ''}
        </div>
    `;
}

function renderEquipmentForgemage(slotId, item) {
    if (!slotId || !item) return '';

    const modifiers = getEquipmentForgemageModifiers(slotId, item.id);
    const renderOptions = selectedStat => FORGEMAGE_STATS.map(stat =>
        `<option value="${stat.path}" ${stat.path === selectedStat ? 'selected' : ''}>${escapeHtml(stat.label)}</option>`
    ).join('');
    const modifierRows = modifiers.map((modifier, index) => `
        <div class="forgemage-row">
            <select data-forgemage-field="stat" data-index="${index}">${renderOptions(modifier.stat)}</select>
            <input type="number" step="1" data-forgemage-field="value" data-index="${index}" value="${escapeHtml(String(modifier.value))}" aria-label="Valeur du bonus">
            <button type="button" data-forgemage-action="remove" data-index="${index}" aria-label="Supprimer ce bonus">×</button>
        </div>
    `).join('');

    return `<div class="detail-section forgemage-editor" data-forgemage-slot="${escapeHtml(slotId)}" data-forgemage-item-id="${escapeHtml(String(item.id))}">
        <h4>✨ Forgemagie</h4>
        <div class="forgemage-modifiers">${modifierRows || '<p class="forgemage-empty">Aucun bonus personnalisé.</p>'}</div>
        <div class="forgemage-add-row">
            <select data-forgemage-new-stat aria-label="Caractéristique à ajouter">${renderOptions('vita')}</select>
            <input type="number" step="1" value="1" data-forgemage-new-value aria-label="Valeur du nouveau bonus">
            <button type="button" data-forgemage-action="add">Ajouter</button>
        </div>
    </div>`;
}

function showDetailsModal(item, slotId = null) {
    const modal = document.getElementById('modalDetails');
    const title = document.getElementById('detailTitle');
    const content = document.getElementById('detailContent');
    if (!modal || !title || !content) return;
    
    title.textContent = item.nom;
    const imagePath = getImagePath(item);
    const defaultImage = 'assets/images/equipements/default.png';
    const equippedSlotId = slotId || slotsConfig.find(slot => currentSet[slot.id]?.id === item.id)?.id || null;
    const stats = item.stats;
    const caracs = stats.caracteristiques;

    const hasNonZeroValue = (value) => value !== undefined && value !== null && Number(value) !== 0;
    const detailLine = (label, value, formatter = (v) => String(v)) => {
        if (!hasNonZeroValue(value)) {
            return '';
        }
        return `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${formatter(value)}</span></div>`;
    };

    const characteristicsRows = [
        detailLine('❤️ PV', stats.vita),
        detailLine('⚡ Initiative', stats.initiative),
        detailLine('🔍 Prospection', stats.prospection),
        detailLine('📖 Sagesse', stats.sagesse),
        detailLine('💪 Force', caracs?.force),
        detailLine('🔥 Intelligence', caracs?.intelligence),
        detailLine('💧 Chance', caracs?.chance),
        detailLine('🍃 Agilité', caracs?.agilite),
        detailLine('⚡ Puissance', caracs?.puissance),
        detailLine('⭐ PA', stats.pa, (value) => `+${value}`),
        detailLine('🟩 PM', stats.pm, (value) => `+${value}`),
        detailLine('👁️ Portée', stats.portee),
        detailLine('❗ Critique', stats.critique),
        detailLine('❗ Dommages critiques', stats.doCri),
        detailLine('Dommages poussée', stats.doPou),
        detailLine('Dommages', stats.dommage),
        detailLine('Dommages neutre', stats.doNeutre),
        detailLine('Dommages terre', stats.doTerre),
        detailLine('Dommages feu', stats.doFeu),
        detailLine('Dommages eau', stats.doEau),
        detailLine('Dommages air', stats.doAir),
        detailLine('% Dommages armes', stats.doPerArme),
        detailLine('% Dommages sorts', stats.doSort),
        detailLine('% Dommages mêlée', stats.doMelee),
        detailLine('% Dommages distance', stats.doDist),
        detailLine('💕 Soin', stats.soin),
        detailLine('👼 Invocations', stats.invocations),
        detailLine('♾️ Tacle', stats.tacle),
        detailLine('🦶 Fuite', stats.fuite),
        detailLine('🦶⭐ Esquive PA', stats.esqPA),
        detailLine('🦶🟩 Esquive PM', stats.esqPM),
        detailLine('➖⭐ Retrait PA', stats.retPA),
        detailLine('➖🟩 Retrait PM', stats.retPM),
        detailLine('🔒 Pods', stats.pods)
    ].join('');

    const resistanceRows = [];
    if (stats.resistance) {
        resistanceRows.push(detailLine('Neutre', stats.resistance.neutre, (value) => `${value}%`));
        resistanceRows.push(detailLine('Terre', stats.resistance.terre, (value) => `${value}%`));
        resistanceRows.push(detailLine('Feu', stats.resistance.feu, (value) => `${value}%`));
        resistanceRows.push(detailLine('Eau', stats.resistance.eau, (value) => `${value}%`));
        resistanceRows.push(detailLine('Air', stats.resistance.air, (value) => `${value}%`));
        resistanceRows.push(detailLine('Critiques', stats.resistance.cri, (value) => `${value}%`));
        resistanceRows.push(detailLine('Mêlée', stats.resistance.melee, (value) => `${value}%`));
        resistanceRows.push(detailLine('Armes', stats.resistance.armes, (value) => `${value}%`));
        resistanceRows.push(detailLine('Poussée', stats.resistance.pou, (value) => `${value}%`));
        resistanceRows.push(detailLine('Distance', stats.resistance.dist, (value) => `${value}%`));
    }

    const resistanceHtml = resistanceRows.some(Boolean)
        ? `<div class="detail-section"><h4>🛡️ Résistances</h4>${resistanceRows.join('')}</div>`
        : '';

    const characteristicsHtml = characteristicsRows
        ? `<div class="detail-section"><h4>📊 Caractéristiques</h4>${characteristicsRows}</div>`
        : '';
    const recipeDetailsHtml = renderRecipeDetails(item);
    const forgemageHtml = renderEquipmentForgemage(equippedSlotId, item);
    const panoplieId = item.panoplie?.id || item.itemSetId;
    const panoplieBonusHtml = renderPanoplieBonuses(item);
    const panoplieItemsHtml = panoplieId
        ? `<div class="detail-section" id="detailPanoplyItems" data-panoplie-id="${escapeHtml(String(panoplieId))}"><h4>✨ Objets de la panoplie</h4><div class="detail-panoply-items">Chargement...</div></div>`
        : '';

    content.innerHTML = `<div class="detail-image"><img src="${imagePath}" alt="${item.nom}" onerror="this.src='${defaultImage}'"></div>
        <div class="detail-row"><span class="detail-label">📦 Catégorie</span><span class="detail-value">${getCategorieDisplayName(item.categorie)}</span></div>
        <div class="detail-row"><span class="detail-label">⭐ Niveau</span><span class="detail-value">${item.level}</span></div>
        <div class="detail-row"><span class="detail-label">💰 Valeur</span><span class="detail-value">${formatKamas(item.valeurK || 0)} Kamas</span></div>
        ${characteristicsHtml}
        ${resistanceHtml}
        ${forgemageHtml}
        ${displayPanoplieInfo(item)}
        ${panoplieBonusHtml}
        ${panoplieItemsHtml}
        ${recipeDetailsHtml}`;
    if (!content.dataset.detailsBound) {
        content.addEventListener('toggle', event => {
            const details = event.target;
            if (!details.open) return;
            if (details.matches('details[data-recipe-item-id]')) loadRecipeDetails(details);
            if (details.matches('details[data-panoplie-id]')) loadPanoplieBonuses(details);
        }, true);
        const saveEditorChanges = (editor, modifiers) => {
            const slotId = editor.dataset.forgemageSlot;
            const item = currentSet[slotId];
            if (!item || String(item.id) !== String(editor.dataset.forgemageItemId)) return;
            saveEquipmentForgemageModifiers(slotId, item.id, modifiers);
            editor.outerHTML = renderEquipmentForgemage(slotId, item);
            displayEquippedCharacter();
            updateCharacterSheet();
        };

        content.addEventListener('click', event => {
            const button = event.target.closest('[data-forgemage-action]');
            if (!button) return;
            const editor = button.closest('.forgemage-editor');
            if (!editor) return;

            const slotId = editor.dataset.forgemageSlot;
            const item = currentSet[slotId];
            if (!item || String(item.id) !== String(editor.dataset.forgemageItemId)) return;
            const modifiers = [...getEquipmentForgemageModifiers(slotId, item.id)];

            if (button.dataset.forgemageAction === 'remove') {
                modifiers.splice(Number(button.dataset.index), 1);
            } else if (button.dataset.forgemageAction === 'add') {
                const stat = editor.querySelector('[data-forgemage-new-stat]')?.value;
                const value = Number(editor.querySelector('[data-forgemage-new-value]')?.value);
                if (!FORGEMAGE_STATS.some(option => option.path === stat) || !Number.isFinite(value) || value === 0) return;
                modifiers.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, stat, value });
            }

            saveEditorChanges(editor, modifiers);
        });

        content.addEventListener('change', event => {
            const field = event.target.closest('[data-forgemage-field]');
            const editor = field?.closest('.forgemage-editor');
            if (!field || !editor) return;

            const slotId = editor.dataset.forgemageSlot;
            const item = currentSet[slotId];
            if (!item || String(item.id) !== String(editor.dataset.forgemageItemId)) return;
            const index = Number(field.dataset.index);
            const modifiers = [...getEquipmentForgemageModifiers(slotId, item.id)];
            if (!modifiers[index]) return;

            if (field.dataset.forgemageField === 'stat') {
                if (!FORGEMAGE_STATS.some(option => option.path === field.value)) return;
                modifiers[index].stat = field.value;
            } else {
                const value = Number(field.value);
                if (!Number.isFinite(value) || value === 0) return;
                modifiers[index].value = value;
            }

            saveEditorChanges(editor, modifiers);
        });
        content.dataset.detailsBound = 'true';
    }
    const panoplieItems = content.querySelector('#detailPanoplyItems');
    if (panoplieItems) loadPanoplieItems(panoplieItems, panoplieId);
    modal.classList.add('active');
}

window.closeDetailsModal = function() {
    const modal = document.getElementById('modalDetails');
    if (modal) modal.classList.remove('active');
};

// ==================== INVENTAIRE ====================
function mergeSavedItemWithRegistry(savedItem, registryItem) {
    if (!registryItem) {
        return savedItem;
    }

    const mergeStatValues = (registryValues = {}, savedValues = {}) => {
        const merged = { ...registryValues, ...savedValues };
        for (const [key, value] of Object.entries(registryValues)) {
            if (Number(value) !== 0 && Number(savedValues[key] || 0) === 0) {
                merged[key] = value;
            }
        }
        return merged;
    };

    const registryStats = registryItem.stats || {};
    const savedStats = savedItem?.stats || {};
    const stats = mergeStatValues(registryStats, savedStats);
    stats.caracteristiques = mergeStatValues(registryStats.caracteristiques, savedStats.caracteristiques);
    stats.resistance = mergeStatValues(registryStats.resistance, savedStats.resistance);

    return {
        ...registryItem,
        valeurK: savedItem?.valeurK ?? registryItem?.valeurK ?? 0,
        stats
    };
}

function loadUserInventory() {
    const saved = localStorage.getItem('dofusUserInventory');
    if (saved) {
        const parsed = JSON.parse(saved);
        userInventory = parsed.map(savedItem => {
            const registryItem = getAllEquipements().find(item => item.id === savedItem.id);
            return mergeSavedItemWithRegistry(savedItem, registryItem);
        });
    } else {
        userInventory = [];
    }
    saveUserInventory();
}

function saveUserInventory() {
    localStorage.setItem('dofusUserInventory', JSON.stringify(userInventory));
}

function addToInventory(item) {
    if (userInventory.some(i => i.id === item.id)) {
        showToast(`⚠️ ${item.nom} est déjà dans votre inventaire !`);
        return false;
    }
    userInventory.push(item);
    saveUserInventory();
    showToast(`✅ ${item.nom} ajouté à votre inventaire !`);
    displayInventory();
    return true;
}

function removeFromInventory(itemId) {
    const index = userInventory.findIndex(i => i.id === itemId);
    if (index !== -1) {
        const item = userInventory[index];
        userInventory.splice(index, 1);
        saveUserInventory();
        showToast(`🗑️ ${item.nom} retiré de l'inventaire`);
        displayInventory();
        return true;
    }
    return false;
}

window.removeFromInventory = removeFromInventory;

// ==================== PROFIL ====================
function saveSet() {
    const toSave = {};
    for (const slot of slotsConfig) {
        if (currentSet[slot.id]) toSave[slot.id] = currentSet[slot.id];
    }
    localStorage.setItem('dofusEquipmentSet', JSON.stringify(toSave));
}

function loadSet() {
    const saved = localStorage.getItem('dofusEquipmentSet');
    if (saved) {
        const parsed = JSON.parse(saved);
        for (const slot of slotsConfig) {
            if (parsed[slot.id]) {
                const originalItem = getAllEquipements().find(i => i.id === parsed[slot.id].id);
                if (originalItem) currentSet[slot.id] = originalItem;
            }
        }
    }
}

function equipItem(itemId) {
    let itemToEquip = userInventory.find(i => i.id === itemId);
    if (!itemToEquip) {
        showToast(`⚠️ Équipement non trouvé dans l'inventaire !`);
        return;
    }
    
    let sameItemEquippedCount = 0;
    for (const slot of slotsConfig) {
        const equipped = currentSet[slot.id];
        if (equipped && equipped.id === itemToEquip.id) {
            sameItemEquippedCount++;
        }
    }
    
    const maxSameItem = (itemToEquip.categorie === 'anneaux') ? 2 : 1;
    
    if (sameItemEquippedCount >= maxSameItem) {
        showToast(`⚠️ Vous avez déjà ${maxSameItem} × ${itemToEquip.nom} équipé${maxSameItem > 1 ? 's' : ''} !`);
        return;
    }
    
    let currentPa = 7;
    let currentPm = 3;
    let currentPo = 0;
    
    for (const slot of slotsConfig) {
        const equipped = currentSet[slot.id];
        if (equipped) {
            currentPa += equipped.stats.pa || 0;
            currentPm += equipped.stats.pm || 0;
            currentPo += equipped.stats.portee || 0;
        }
    }
    
    currentPa += forgePA;
    currentPm += forgePM;
    currentPo += forgePO;
    
    const newPa = currentPa + (itemToEquip.stats.pa || 0);
    const newPm = currentPm + (itemToEquip.stats.pm || 0);
    const newPo = currentPo + (itemToEquip.stats.portee || 0);
    
    if (newPa > MAX_PA) {
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PA} PA (serait ${newPa}) !`);
        return;
    }
    if (newPm > MAX_PM) {
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PM} PM (serait ${newPm}) !`);
        return;
    }
    if (newPo > MAX_PO) {
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PO} PO (serait ${newPo}) !`);
        return;
    }
    
    let availableSlot = null;
    
    if (itemToEquip.categorie === 'anneaux') {
        const anneau1Slot = slotsConfig.find(slot => slot.id === 'anneaux1');
        const anneau2Slot = slotsConfig.find(slot => slot.id === 'anneaux2');
        
        if (anneau1Slot && !currentSet[anneau1Slot.id]) {
            availableSlot = anneau1Slot;
        } else if (anneau2Slot && !currentSet[anneau2Slot.id]) {
            availableSlot = anneau2Slot;
        } else if (sameItemEquippedCount === 1 && maxSameItem === 2) {
            if (anneau1Slot && currentSet[anneau1Slot.id]?.id === itemToEquip.id && anneau2Slot) {
                availableSlot = anneau2Slot;
            } else if (anneau2Slot && currentSet[anneau2Slot.id]?.id === itemToEquip.id && anneau1Slot) {
                availableSlot = anneau1Slot;
            }
        }
    } else {
        for (let slot of slotsConfig) {
            let isAccepted = false;
            if (slot.categories) {
                if (slot.categories.includes(itemToEquip.categorie)) isAccepted = true;
            } else if (slot.categorie === itemToEquip.categorie) isAccepted = true;
            
            if (isAccepted && !currentSet[slot.id]) {
                availableSlot = slot;
                break;
            }
        }
    }
    
    if (!availableSlot) {
        showToast(`⚠️ Pas d'emplacement libre pour ce type d'équipement !`);
        return;
    }
    
    currentSet[availableSlot.id] = itemToEquip;
    saveSet();
    displayEquippedSlots();
    updateCharacterSheet();
    displayInventory();
    showToast(`✅ ${itemToEquip.nom} équipé sur ${availableSlot.nom} !`);
}

window.equipItem = equipItem;

function unequipItem(slotId) {
    const item = currentSet[slotId];
    if (item) {
        currentSet[slotId] = null;
        saveSet();
        displayEquippedSlots();
        updateCharacterSheet();
        displayInventory();
        showToast(`🗑️ ${item.nom} déséquipé`);
    }
}

window.unequipItem = unequipItem;

// ==================== FORGEMAGIE ====================
function saveForgeState() {
    localStorage.setItem('dofusForgePA', forgePA);
    localStorage.setItem('dofusForgePM', forgePM);
    localStorage.setItem('dofusForgePO', forgePO);
}

function loadForgeState() {
    const savedPA = localStorage.getItem('dofusForgePA');
    const savedPM = localStorage.getItem('dofusForgePM');
    const savedPO = localStorage.getItem('dofusForgePO');
    
    forgePA = savedPA ? parseInt(savedPA) : 0;
    forgePM = savedPM ? parseInt(savedPM) : 0;
    forgePO = savedPO ? parseInt(savedPO) : 0;
    
    const checkPA = document.getElementById('forgePACheck');
    const checkPM = document.getElementById('forgePMCheck');
    const checkPO = document.getElementById('forgePOCheck');
    
    if (checkPA) checkPA.checked = forgePA === 1;
    if (checkPM) checkPM.checked = forgePM === 1;
    if (checkPO) checkPO.checked = forgePO === 1;
    
    const paVal = document.getElementById('forgePAValue');
    const pmVal = document.getElementById('forgePMValue');
    const poVal = document.getElementById('forgePOValue');
    
    if (paVal) paVal.textContent = forgePA === 1 ? '+1' : '+0';
    if (pmVal) pmVal.textContent = forgePM === 1 ? '+1' : '+0';
    if (poVal) poVal.textContent = forgePO === 1 ? '+1' : '+0';
}

function toggleForgePA() {
    const check = document.getElementById('forgePACheck');
    let newValue = check.checked ? 1 : 0;
    let oldValue = forgePA;
    
    let currentPa = baseStatsData.pa;
    if (currentPa + newValue > MAX_PA) {
        forgePA = oldValue;
        check.checked = oldValue === 1;
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PA} PA !`);
        return;
    }
    
    forgePA = newValue;
    document.getElementById('forgePAValue').textContent = forgePA === 1 ? '+1' : '+0';
    saveForgeState();
    updateCharacterSheet();
}

function toggleForgePM() {
    const check = document.getElementById('forgePMCheck');
    let newValue = check.checked ? 1 : 0;
    let oldValue = forgePM;
    
    let currentPm = baseStatsData.pm;
    if (currentPm + newValue > MAX_PM) {
        forgePM = oldValue;
        check.checked = oldValue === 1;
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PM} PM !`);
        return;
    }
    
    forgePM = newValue;
    document.getElementById('forgePMValue').textContent = forgePM === 1 ? '+1' : '+0';
    saveForgeState();
    updateCharacterSheet();
}

function toggleForgePO() {
    const check = document.getElementById('forgePOCheck');
    let newValue = check.checked ? 1 : 0;
    let oldValue = forgePO;
    
    let currentPo = baseStatsData.portee;
    if (currentPo + newValue > MAX_PO) {
        forgePO = oldValue;
        check.checked = oldValue === 1;
        showToast(`⚠️ Impossible : dépasserait la limite de ${MAX_PO} PO !`);
        return;
    }
    
    forgePO = newValue;
    document.getElementById('forgePOValue').textContent = forgePO === 1 ? '+1' : '+0';
    saveForgeState();
    updateCharacterSheet();
}

window.toggleForgePA = toggleForgePA;
window.toggleForgePM = toggleForgePM;
window.toggleForgePO = toggleForgePO;

// ==================== PARCHOTTAGES ====================
function saveParchotageState() {
    localStorage.setItem('dofusParchotage', JSON.stringify(parchotageStats));
}

function loadParchotageState() {
    const saved = localStorage.getItem('dofusParchotage');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            parchotageStats = { ...parchotageStats, ...parsed };
        } catch (e) {
            console.warn('Erreur chargement parchottages:', e);
        }
    }
    
    const inputs = {
        vita: document.getElementById('parchotageVita'),
        force: document.getElementById('parchotageForce'),
        intelligence: document.getElementById('parchotageIntel'),
        chance: document.getElementById('parchotageChance'),
        agilite: document.getElementById('parchotageAgilite'),
        sagesse: document.getElementById('parchotageSagesse')
    };
    
    for (const [stat, input] of Object.entries(inputs)) {
        if (input) {
            input.value = parchotageStats[stat];
            input.addEventListener('change', (e) => updateParchotage(stat, parseInt(e.target.value) || 0));
        }
    }
    
    updateParchotageDisplay();
}

function updateParchotage(stat, value) {
    value = Math.min(100, Math.max(0, value));
    parchotageStats[stat] = value;
    
    const inputMap = {
        vita: 'parchotageVita',
        force: 'parchotageForce',
        intelligence: 'parchotageIntel',
        chance: 'parchotageChance',
        agilite: 'parchotageAgilite',
        sagesse: 'parchotageSagesse'
    };
    
    const input = document.getElementById(inputMap[stat]);
    if (input) input.value = value;
    
    const valueSpan = document.getElementById(`parchotage${stat.charAt(0).toUpperCase() + stat.slice(1)}Value`);
    if (valueSpan) valueSpan.textContent = `+${value}`;
    
    saveParchotageState();
    updateCharacterSheet();
    
    const statNames = {
        vita: 'Vitalité',
        force: 'Force',
        intelligence: 'Intelligence',
        chance: 'Chance',
        agilite: 'Agilité',
        sagesse: 'Sagesse'
    };
    showToast(`📜 ${statNames[stat]} : ${value} parchotté${value > 0 ? 'e' : ''}`);
}

function updateParchotageDisplay() {
    const displays = {
        vita: document.getElementById('parchotageVitaValue'),
        force: document.getElementById('parchotageForceValue'),
        intelligence: document.getElementById('parchotageIntelValue'),
        chance: document.getElementById('parchotageChanceValue'),
        agilite: document.getElementById('parchotageAgiliteValue'),
        sagesse: document.getElementById('parchotageSagesseValue')
    };
    
    for (const [stat, display] of Object.entries(displays)) {
        if (display) display.textContent = `+${parchotageStats[stat]}`;
    }
}

window.updateParchotage = updateParchotage;

// ==================== FOOTER STATS ====================

function updateFooterStats() {
    const footerInventoryCount = document.getElementById('footerInventoryCount');
    if (footerInventoryCount) {
        footerInventoryCount.textContent = userInventory.length;
    }
    
    const footerTemplateCount = document.getElementById('footerTemplateCount');
    if (footerTemplateCount && templates) {
        footerTemplateCount.textContent = templates.length;
    }
    
    const lastUpdateSpan = document.getElementById('lastUpdate');
    if (lastUpdateSpan) {
        lastUpdateSpan.textContent = new Date().toLocaleString();
    }
}

// ==================== STATISTIQUES ====================
async function updateCharacterSheet() {
    let total = {
        vita: 0, prospection: 0, sagesse: 0, pa: 0, pm: 0, portee: 0,
        force: 0, intelligence: 0, chance: 0, agilite: 0, puissance: 0,
        initiative: 0, critique: 0, soin: 0, pi: 0, fuite: 0, esqPA: 0, esqPM: 0,
        pods: 0, tacle: 0, retPA: 0, retPM: 0,
        doNeutre: 0, doTerre: 0, doFeu: 0, doEau: 0, doAir: 0,
        dommage: 0, doCri: 0, doPou: 0, doPerArme: 0, doSort: 0, doMelee: 0, doDist: 0,
        resistance: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0, cri: 0, melee: 0, armes: 0, pou: 0, dist: 0 }
    };
    
    for (const slot of slotsConfig) {
        const item = currentSet[slot.id];
        if (item && item.stats) {
            total.vita += item.stats.vita || 0;
            total.prospection += item.stats.prospection || 0;
            total.sagesse += item.stats.sagesse || 0;
            total.pa += item.stats.pa || 0;
            total.pm += item.stats.pm || 0;
            total.portee += item.stats.portee || 0;
            total.force += item.stats.caracteristiques?.force || 0;
            total.intelligence += item.stats.caracteristiques?.intelligence || 0;
            total.chance += item.stats.caracteristiques?.chance || 0;
            total.agilite += item.stats.caracteristiques?.agilite || 0;
            total.puissance += item.stats.caracteristiques?.puissance || 0;
            total.initiative += item.stats.initiative || 0;
            total.critique += item.stats.critique || 0;
            total.soin += item.stats.soin || 0;
            total.pi += item.stats.pi || 0;
            total.tacle += item.stats.tacle || 0;
            total.fuite += item.stats.fuite || 0;
            total.esqPA += item.stats.esqPA || 0;
            total.esqPM += item.stats.esqPM || 0;
            total.retPA += item.stats.retPA || 0;
            total.retPM += item.stats.retPM || 0;
            total.doNeutre += item.stats.doNeutre || 0;
            total.doTerre += item.stats.doTerre || 0;
            total.doFeu += item.stats.doFeu || 0;
            total.doEau += item.stats.doEau || 0;
            total.doAir += item.stats.doAir || 0;
            total.dommage += item.stats.dommage || 0;
            total.doCri += item.stats.doCri || 0;
            total.doPou += item.stats.doPou || 0;
            total.doPerArme += item.stats.doPerArme || 0;
            total.doSort += item.stats.doSort || 0;
            total.doMelee += item.stats.doMelee || 0;
            total.doDist += item.stats.doDist || 0;
            if (item.stats.resistance) {
                total.resistance.neutre += item.stats.resistance.neutre || 0;
                total.resistance.terre += item.stats.resistance.terre || 0;
                total.resistance.feu += item.stats.resistance.feu || 0;
                total.resistance.eau += item.stats.resistance.eau || 0;
                total.resistance.air += item.stats.resistance.air || 0;
                total.resistance.cri += item.stats.resistance.cri || 0;
                total.resistance.melee += item.stats.resistance.melee || 0;
                total.resistance.armes += item.stats.resistance.armes || 0;
                total.resistance.pou += item.stats.resistance.pou || 0;
                total.resistance.dist += item.stats.resistance.dist || 0;
            }
            addEquipmentForgemageToTotal(total, slot.id, item);
        }
    }
    
    // Ajouter les parchottages
    total.vita += parchotageStats.vita;
    total.force += parchotageStats.force;
    total.intelligence += parchotageStats.intelligence;
    total.chance += parchotageStats.chance;
    total.agilite += parchotageStats.agilite;
    total.sagesse += parchotageStats.sagesse;
    
    // Bonus de panoplies
    try {
        const { calculatePanoplieBonuses } = await import('./data/dofusdbSync.js');
        const panoplieBonuses = await calculatePanoplieBonuses(currentSet, slotsConfig);
        
        for (const [stat, value] of Object.entries(panoplieBonuses.stats)) {
            total[stat] = (total[stat] || 0) + value;
        }
        for (const [carac, value] of Object.entries(panoplieBonuses.caracteristiques)) {
            total[carac] = (total[carac] || 0) + value;
        }
        for (const [res, value] of Object.entries(panoplieBonuses.resistance)) {
            total.resistance[res] = (total.resistance[res] || 0) + value;
        }
    } catch (e) {
        console.warn('Erreur calcul bonus panoplies:', e);
    }

    total.force += characteristicPoints.force;
    total.agilite += characteristicPoints.agilite;
    total.chance += characteristicPoints.chance;
    total.intelligence += characteristicPoints.intelligence;
    total.sagesse += characteristicPoints.sagesse;
    total.vita += characteristicPoints.vita;

    total.initiative += total.force + total.chance + total.intelligence + total.agilite;
    total.tacle += Math.floor(total.agilite / 10);
    total.fuite += Math.floor(total.agilite / 10);
    total.pods += Math.floor(total.force / 10);
    total.soin += Math.floor(total.intelligence / 10);
    total.prospection += Math.floor(total.chance / 10);
    total.retPA += Math.floor(total.sagesse / 10);
    total.retPM += Math.floor(total.sagesse / 10);
    total.esqPA += Math.floor(total.sagesse / 10);
    total.esqPM += Math.floor(total.sagesse / 10);
    
    baseStatsData = {
        vita: 1050 + total.vita,
        prospection: 100 + total.prospection,
        sagesse: total.sagesse,
        pa: 7 + total.pa,
        pm: 3 + total.pm,
        portee: total.portee,
        force: total.force,
        intelligence: total.intelligence,
        chance: total.chance,
        agilite: total.agilite,
        puissance: total.puissance,
        initiative: total.initiative,
        critique: total.critique,
        soin: total.soin,
        pi: total.pi,
        fuite: total.fuite,
        esqPA: total.esqPA,
        esqPM: total.esqPM,
        pods: total.pods,
        tacle: total.tacle,
        retPA: total.retPA,
        retPM: total.retPM,
        doNeutre: total.doNeutre,
        doTerre: total.doTerre,
        doFeu: total.doFeu,
        doEau: total.doEau,
        doAir: total.doAir,
        dommage: total.dommage,
        doCri: total.doCri,
        doPou: total.doPou,
        doPerArme: total.doPerArme,
        doSort: total.doSort,
        doMelee: total.doMelee,
        doDist: total.doDist,
        resistance: total.resistance
    };
    updateTotalStatsDisplay();
    updateCharacterPointAllocationDisplay();
}

function updateTotalStatsDisplay() {
    let totalPa = baseStatsData.pa + forgePA;
    let totalPm = baseStatsData.pm + forgePM;
    let totalPortee = baseStatsData.portee + forgePO;
    
    const elements = {
        sumVita: baseStatsData.vita, sumPP: baseStatsData.prospection,
        sumPA: totalPa, sumPM: totalPm, sumPO: totalPortee,
        charVita: baseStatsData.vita, charSagesse: baseStatsData.sagesse,
        charForce: baseStatsData.force, charIntel: baseStatsData.intelligence,
        charChance: baseStatsData.chance, charAgilite: baseStatsData.agilite,
        charPuissance: baseStatsData.puissance,
        charProspection: baseStatsData.prospection,
        charInitiative: baseStatsData.initiative,
        charCritique: baseStatsData.critique,
        charSoin: baseStatsData.soin,
        charPI: baseStatsData.pi,
        charFuite: baseStatsData.fuite,
        charEsqPA: baseStatsData.esqPA,
        charEsqPM: baseStatsData.esqPM,
        charPods: baseStatsData.pods,
        charTacle: baseStatsData.tacle,
        charRetPA: baseStatsData.retPA,
        charRetPM: baseStatsData.retPM,
        charDoNeutre: baseStatsData.doNeutre,
        charDoTerre: baseStatsData.doTerre,
        charDoFeu: baseStatsData.doFeu,
        charDoEau: baseStatsData.doEau,
        charDoAir: baseStatsData.doAir,
        charDommage: baseStatsData.dommage,
        charDoCri: baseStatsData.doCri,
        charDoPou: baseStatsData.doPou,
        charDoPerArme: baseStatsData.doPerArme,
        charDoSort: baseStatsData.doSort,
        charDoMelee: baseStatsData.doMelee,
        charDoDist: baseStatsData.doDist,
        resNeutre: (baseStatsData.resistance.neutre || 0) + '%',
        resTerre: (baseStatsData.resistance.terre || 0) + '%',
        resFeu: (baseStatsData.resistance.feu || 0) + '%',
        resEau: (baseStatsData.resistance.eau || 0) + '%',
        resAir: (baseStatsData.resistance.air || 0) + '%',
        resCri: (baseStatsData.resistance.cri || 0) + '%',
        resMelee: (baseStatsData.resistance.melee || 0) + '%',
        resArmes: (baseStatsData.resistance.armes || 0) + '%',
        resPou: (baseStatsData.resistance.pou || 0) + '%',
        resDist: (baseStatsData.resistance.dist || 0) + '%'
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
    
    let totalKamas = 0;
    for (const slot of slotsConfig) {
        const item = currentSet[slot.id];
        if (item) totalKamas += item.valeurK || 0;
    }
    const totalEl = document.getElementById('totalValue');
    if (totalEl) totalEl.textContent = formatKamas(totalKamas);

    const characterData = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
    const characterLevel = document.getElementById('stuffCharacterLevel');
    const equippedCount = document.getElementById('stuffEquippedCount');
    if (characterLevel) characterLevel.textContent = characterData.level || '200';
    if (equippedCount) {
        equippedCount.textContent = `${Object.values(currentSet).filter(Boolean).length}/${slotsConfig.length}`;
    }
}

// ==================== AFFICHAGE ====================
function displayEquippedSlots() {
    displayEquippedCharacter();
}

function displayEquippedCharacter() {
    const leftContainer = document.getElementById('stuffSlotsLeft');
    const rightContainer = document.getElementById('stuffSlotsRight');
    const bottomContainer = document.getElementById('stuffSlotsBottom');
    const display = document.getElementById('stuffDisplayWrapper');
    if (!leftContainer || !rightContainer || !bottomContainer || !display) return;

    const slotsBySide = {
        left: ['coiffes', 'capes', 'amulettes', 'armes', 'familierMonture'],
        right: ['anneaux1', 'anneaux2', 'ceintures', 'bottes', 'boucliers'],
        bottom: ['dofus1', 'dofus2', 'dofus3', 'dofus4', 'dofus5', 'dofus6']
    };
    const containersBySide = { left: leftContainer, right: rightContainer, bottom: bottomContainer };

    for (const [side, slotIds] of Object.entries(slotsBySide)) {
        containersBySide[side].innerHTML = slotIds.map(slotId => {
            const slot = slotsConfig.find(config => config.id === slotId);
            const item = currentSet[slotId];
            const label = slotId.startsWith('dofus') ? 'Dofus / ' : slot.nom.substring(0, 8);
            const itemCategory = item ? (item.categorie || getItemCategorie(item)) : '';
            const hasLegendaryStatus = slotId === 'familierMonture' && ['familiers', 'montiliers'].includes(itemCategory);
            const statusKey = `${slotId}:${item?.id || ''}`;
            const statusControl = hasLegendaryStatus
                ? `<label class="legendary-status-control">Statut<select class="legendary-status-select" data-status-key="${escapeHtml(statusKey)}"><option value="normal">Normal</option><option value="legendary" ${legendaryStatuses[statusKey] === 'legendary' ? 'selected' : ''}>Légendaire</option></select></label>`
                : '';
            const content = item
                ? `<img src="${escapeHtml(getImagePath(item))}" alt="${escapeHtml(item.nom)}" onerror="this.src='assets/images/equipements/default.png'"><div class="equipment-slot-actions"><button type="button" data-equipment-action="details" title="Détails de ${escapeHtml(item.nom)}" aria-label="Détails de ${escapeHtml(item.nom)}">🔍</button><button type="button" data-equipment-action="remove" title="Déséquiper ${escapeHtml(item.nom)}" aria-label="Déséquiper ${escapeHtml(item.nom)}">−</button></div>`
                : `<div class="equipment-item-empty-content"><span style="font-size: 24px;">${slot.emoji}</span><span style="font-size: 8px; margin-top: 3px;">${escapeHtml(label)}</span></div>`;
            const hasForgemage = item && getEquipmentForgemageModifiers(slotId, item.id)
                .some(modifier => Number(modifier.value) !== 0);

            return `<div class="equipment-item${hasForgemage ? ' equipment-item-forgemaged' : ''}" data-slot-id="${slot.id}" title="${escapeHtml(item?.nom || slot.nom)}">${content}<div class="item-tooltip">${escapeHtml(item?.nom || slot.nom)}</div></div>${statusControl}`;
        }).join('');
    }

    const characterData = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
    const characterImage = document.getElementById('stuffCharacterImg');
    const characterName = document.getElementById('stuffCharacterName');
    const characterNameEditor = document.getElementById('stuffCharacterRename');
    const characterNameInput = document.getElementById('stuffCharacterNameInput');
    if (characterImage) characterImage.alt = characterData.name || 'Personnage';
    if (characterName) characterName.textContent = characterData.name || 'Mon Personnage';

    const cancelCharacterRename = () => {
        if (characterNameEditor) characterNameEditor.hidden = true;
        if (characterName) characterName.hidden = false;
    };
    const saveCharacterRename = () => {
        const name = characterNameInput?.value.trim();
        if (!name) {
            characterNameInput?.focus();
            return;
        }

        const data = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
        data.name = name;
        localStorage.setItem('dofusCharacterData', JSON.stringify(data));
        if (characterImage) characterImage.alt = name;
        if (characterName) characterName.textContent = name;
        cancelCharacterRename();
        showToast(`✅ Personnage renommé en "${name}"`);
    };

    if (!display.dataset.eventsBound) {
        display.addEventListener('click', event => {
            const equipmentAction = event.target.closest('[data-equipment-action]');
            if (equipmentAction) {
                const slotId = equipmentAction.closest('.equipment-item')?.dataset.slotId;
                const item = currentSet[slotId];
                if (equipmentAction.dataset.equipmentAction === 'details' && item) {
                    showDetailsModalFromId(item.id, slotId);
                } else if (equipmentAction.dataset.equipmentAction === 'remove' && item) {
                    unequipItem(slotId);
                }
                return;
            }

            const equipmentItem = event.target.closest('.equipment-item');
            if (equipmentItem) {
                const slotId = equipmentItem.dataset.slotId;
                const item = currentSet[slotId];
                if (item) showDetailsModalFromId(item.id, slotId);
                else showToast(`💡 Emplacement ${slotsConfig.find(slot => slot.id === slotId)?.nom || ''} vide.`);
                return;
            }

            if (event.target.closest('#stuffEditCharacterBtn')) {
                const data = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
                if (characterName) characterName.hidden = true;
                if (characterNameEditor) characterNameEditor.hidden = false;
                if (characterNameInput) {
                    characterNameInput.value = data.name || 'Mon Personnage';
                    characterNameInput.focus();
                    characterNameInput.select();
                }
                return;
            }

            if (event.target.closest('#stuffSaveCharacterNameBtn')) {
                saveCharacterRename();
                return;
            }

            if (event.target.closest('#stuffCancelCharacterNameBtn')) {
                cancelCharacterRename();
                return;
            }

            if (event.target.closest('#stuffResetCharacterBtn') && confirm('Êtes-vous sûr ? Cela réinitialisera tous les équipements.')) {
                slotsConfig.forEach(slot => { currentSet[slot.id] = null; });
                saveSet();
                displayEquippedSlots();
                updateCharacterSheet();
                displayInventory();
                showToast('Personnage réinitialisé !');
            }
        });
        display.addEventListener('change', event => {
            const select = event.target.closest('.legendary-status-select');
            if (!select) return;
            const statusKey = select.dataset.statusKey;
            if (select.value === 'legendary') legendaryStatuses[statusKey] = 'legendary';
            else delete legendaryStatuses[statusKey];
            localStorage.setItem(legendaryStatusStorageKey, JSON.stringify(legendaryStatuses));
        });
        display.addEventListener('keydown', event => {
            if (event.target.id !== 'stuffCharacterNameInput') return;
            if (event.key === 'Enter') {
                event.preventDefault();
                saveCharacterRename();
            } else if (event.key === 'Escape') {
                cancelCharacterRename();
            }
        });
        display.dataset.eventsBound = 'true';
    }
}

function getSpellLevelForCharacter(spell) {
    const characterLevel = Number(document.getElementById('stuffCharacterLevel')?.textContent) || 200;
    const levels = [...(spell.levels || [])].sort((first, second) => Number(first.grade) - Number(second.grade));
    return levels.filter(level => Number(level.minPlayerLevel) <= characterLevel).at(-1) || levels[0] || null;
}

function renderClassSpells(spells) {
    const list = document.getElementById('classSpellsList');
    if (!list) return;

    if (!spells.length) {
        list.innerHTML = '<p class="class-spells-empty">Aucun sort disponible pour cette classe.</p>';
        return;
    }

    list.innerHTML = spells.map(spell => {
        const name = spell.name?.fr || spell.name?.en || 'Sort sans nom';
        const description = spell.description?.fr || '';
        const level = getSpellLevelForCharacter(spell);
        const levelMeta = level
            ? `Niv. ${Number(level.minPlayerLevel) || 1} · ${Number(level.apCost) || 0} PA · Portée ${Number(level.minRange) || 0}-${Number(level.range) || 0}`
            : 'Niveau et portée indisponibles';
        const image = spell.img || `https://api.dofusdb.fr/img/spells/sort_${spell.iconId || spell.id}.png`;

        return `<details class="class-spell-entry" data-search="${escapeHtml(`${name} ${description}`.toLowerCase())}">
            <summary><img src="${escapeHtml(image)}" alt="" loading="lazy" onerror="this.hidden=true"><span class="class-spell-title"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(levelMeta)}</small></span><span class="class-spell-chevron" aria-hidden="true">⌄</span></summary>
            ${description ? `<p class="class-spell-description">${escapeHtml(description)}</p>` : ''}
        </details>`;
    }).join('');
}

async function openClassSpellsModal(breed) {
    const modal = document.getElementById('modalClassSpells');
    const title = document.getElementById('classSpellsTitle');
    const list = document.getElementById('classSpellsList');
    const search = document.getElementById('classSpellsSearch');
    if (!modal || !title || !list) return;

    title.textContent = `${breed.shortName.fr} · Sorts`;
    list.innerHTML = '<p class="class-spells-empty">Chargement des sorts...</p>';
    if (search) search.value = '';
    modal.classList.add('active');

    try {
        const spells = await getDofusDbBreedSpells(breed.id);
        renderClassSpells(spells);
        title.textContent = `${breed.shortName.fr} · Sorts (${spells.length})`;
    } catch (error) {
        console.warn('Impossible de charger les sorts DofusDB', error);
        list.innerHTML = '<p class="class-spells-empty">Impossible de charger les sorts. Vérifie la connexion puis réessaie.</p>';
    }
}

function initCharacterClasses() {
    const select = document.getElementById('stuffCharacterClass');
    const spellsButton = document.getElementById('stuffViewSpellsBtn');
    const pickerButton = document.getElementById('characterClassPickerButton');
    const pickerIcon = document.getElementById('characterClassPickerIcon');
    const pickerLabel = document.getElementById('characterClassPickerLabel');
    const pickerOptions = document.getElementById('characterClassPickerOptions');
    const modal = document.getElementById('modalClassSpells');
    const search = document.getElementById('classSpellsSearch');
    const characterImage = document.getElementById('stuffCharacterImg');
    const defaultCharacterImage = 'assets/images/characters/dofus/0-0.png';
    if (!select || !spellsButton || !pickerButton || !pickerIcon || !pickerLabel || !pickerOptions || !modal) return;

    let breeds = [];
    select.disabled = true;
    pickerButton.disabled = true;
    spellsButton.disabled = true;

    const updatePickerSelection = breed => {
        pickerLabel.textContent = breed?.shortName.fr || 'Choisir une classe...';
        pickerButton.setAttribute('aria-label', breed ? `Classe : ${breed.shortName.fr}` : 'Choisir une classe');
        pickerIcon.hidden = !breed?.img;
        if (breed?.img) pickerIcon.src = breed.img;
        pickerOptions.querySelectorAll('[data-class-id]').forEach(option => {
            option.setAttribute('aria-selected', String(option.dataset.classId === String(breed?.id || '')));
        });
    };

    const closePicker = returnFocus => {
        if (pickerOptions.matches(':popover-open')) pickerOptions.hidePopover();
        pickerButton.setAttribute('aria-expanded', 'false');
        if (returnFocus) pickerButton.focus();
    };

    const openPicker = () => {
        if (pickerOptions.matches(':popover-open')) return;
        pickerOptions.showPopover();
        const buttonRect = pickerButton.getBoundingClientRect();
        const width = Math.min(buttonRect.width, window.innerWidth - 16);
        const left = Math.max(8, Math.min(buttonRect.left, window.innerWidth - width - 8));
        const menuHeight = pickerOptions.getBoundingClientRect().height;
        const top = buttonRect.bottom + menuHeight + 8 > window.innerHeight
            ? Math.max(8, buttonRect.top - menuHeight - 4)
            : buttonRect.bottom + 4;
        pickerOptions.style.left = `${left}px`;
        pickerOptions.style.top = `${top}px`;
        pickerOptions.style.width = `${width}px`;
        pickerButton.setAttribute('aria-expanded', 'true');
        (pickerOptions.querySelector('[aria-selected="true"]') || pickerOptions.querySelector('[role="option"]'))?.focus();
    };

    getDofusDbBreeds().then(catalog => {
        breeds = catalog;
        select.innerHTML = '<option value="">Choisir une classe...</option>' + breeds.map(breed =>
            `<option value="${Number(breed.id)}">${escapeHtml(breed.shortName.fr)}</option>`
        ).join('');
        pickerOptions.innerHTML = breeds.map(breed => `
            <button type="button" class="character-class-picker-option" role="option" data-class-id="${Number(breed.id)}" aria-selected="false">
                <img src="${escapeHtml(breed.img || '')}" alt="" loading="lazy" onerror="this.hidden=true">
                <span>${escapeHtml(breed.shortName.fr)}</span>
            </button>
        `).join('');
        const characterData = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
        select.value = characterData.classId ? String(characterData.classId) : '';
        select.disabled = false;
        pickerButton.disabled = false;
        select.dispatchEvent(new Event('change'));
    }).catch(error => {
        console.warn('Impossible de charger les classes DofusDB', error);
        select.innerHTML = '<option value="">Classes indisponibles</option>';
        select.title = 'Impossible de joindre DofusDB';
        pickerLabel.textContent = 'Classes indisponibles';
    });

    select.addEventListener('change', () => {
        const breed = breeds.find(entry => String(entry.id) === select.value);
        const characterData = JSON.parse(localStorage.getItem('dofusCharacterData') || '{}');
        updatePickerSelection(breed);
        if (breed) {
            characterData.classId = Number(breed.id);
            characterData.className = breed.shortName.fr;
            spellsButton.disabled = false;
            spellsButton.textContent = `Sorts (${breed.breedSpellsId.length})`;
            if (characterImage) {
                characterImage.alt = `${breed.shortName.fr} · ${characterData.name || 'Personnage'}`;
                characterImage.onerror = null;
                characterImage.src = defaultCharacterImage;
            }
        } else {
            delete characterData.classId;
            delete characterData.className;
            spellsButton.disabled = true;
            spellsButton.textContent = 'Sorts';
            if (characterImage) {
                characterImage.onerror = null;
                characterImage.src = defaultCharacterImage;
                characterImage.alt = characterData.name || 'Personnage';
            }
        }
        localStorage.setItem('dofusCharacterData', JSON.stringify(characterData));
    });

    pickerButton.addEventListener('click', openPicker);
    pickerOptions.addEventListener('click', event => {
        const option = event.target.closest('[data-class-id]');
        if (!option) return;
        select.value = option.dataset.classId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closePicker(true);
    });
    pickerOptions.addEventListener('keydown', event => {
        const options = [...pickerOptions.querySelectorAll('[role="option"]')];
        const index = options.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            options[(index + direction + options.length) % options.length]?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closePicker(true);
        }
    });
    document.addEventListener('pointerdown', event => {
        if (pickerOptions.matches(':popover-open') && !pickerOptions.contains(event.target) && !pickerButton.contains(event.target)) {
            closePicker(false);
        }
    });
    window.addEventListener('scroll', () => closePicker(false), true);

    spellsButton.addEventListener('click', () => {
        const breed = breeds.find(entry => String(entry.id) === select.value);
        if (breed) openClassSpellsModal(breed);
    });

    modal.querySelector('[data-class-spells-close]')?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', event => {
        if (event.target === modal) modal.classList.remove('active');
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closePicker(false);
            modal.classList.remove('active');
        }
    });
    search?.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase('fr');
        modal.querySelectorAll('.class-spell-entry').forEach(entry => {
            entry.hidden = query && !entry.dataset.search.includes(query);
        });
    });
}

window.closeClassSpellsModal = function() {
    document.getElementById('modalClassSpells')?.classList.remove('active');
};

function getFilteredEquipementsProfil() {
    let items = [...userInventory];
    if (currentCategory !== "all") items = items.filter(item => item.categorie === currentCategory);
    if (searchTerm) items = items.filter(item => item.nom.toLowerCase().includes(searchTerm.toLowerCase()));
    if (levelFilter) {
        items = items.filter(item => {
            if (levelFilter === "1") return item.level >= 1 && item.level <= 99;
            if (levelFilter === "2") return item.level >= 100 && item.level <= 149;
            if (levelFilter === "3") return item.level >= 150 && item.level <= 199;
            if (levelFilter === "4") return item.level === 200;
            return true;
        });
    }
    return items;
}

function displayInventory() {
    const container = document.getElementById('inventoryList');
    if (!container) return;
    const items = getFilteredEquipementsProfil();
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) visibleCount.textContent = items.length;
    if (items.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px;">🔍 Aucun équipement dans l\'inventaire<br><small>Va dans la Base de données et clique sur + pour ajouter</small></div>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        let equippedCount = 0;
        for (const slot of slotsConfig) {
            const equipped = currentSet[slot.id];
            if (equipped && equipped.id === item.id) {
                equippedCount++;
            }
        }
        
        const maxEquipCount = (item.categorie === 'anneaux') ? 2 : 1;
        const isFullyEquipped = equippedCount >= maxEquipCount;
        const imagePath = getImagePath(item);
        const defaultImage = 'assets/images/equipements/default.png';
        
        return `<div class="inventory-item ${equippedCount > 0 ? 'selected' : ''}"><div class="item-icon-small"><img src="${imagePath}" alt="${item.nom}" onerror="this.src='${defaultImage}'"></div><div class="item-info"><div class="item-name">${item.nom}</div><div class="item-details">Niv.${item.level} • ${formatKamas(item.valeurK || 0)} Kamas</div><div class="item-equip-count">${equippedCount}/${maxEquipCount} équipé${maxEquipCount > 1 ? 's' : ''}</div></div><div class="item-actions"><button class="details-btn-small" onclick="showDetailsModalFromId(${item.id})">🔍</button><button class="add-to-set-btn-small" onclick="equipItem(${item.id})" ${isFullyEquipped ? 'disabled' : ''}>+</button><button class="remove-btn-small" onclick="removeFromInventory(${item.id})">🗑️</button></div></div>`;
    }).join('');
    
    // Mettre à jour les stats du footer
    updateFooterStats();
}

function showDetailsModalFromId(itemId, slotId = null) {
    const slottedItem = slotId ? currentSet[slotId] : null;
    let item = slottedItem && String(slottedItem.id) === String(itemId) ? slottedItem : null;
    if (!item) item = userInventory.find(i => String(i.id) === String(itemId));
    if (!item) item = getAllEquipements().find(i => String(i.id) === String(itemId));
    const equippedSlotId = slotId || slotsConfig.find(slot => String(currentSet[slot.id]?.id) === String(itemId))?.id || null;
    if (item) showDetailsModal(item, equippedSlotId);
}

window.showDetailsModalFromId = showDetailsModalFromId;

// ==================== BDD ====================
function filterEquipementsBdd(items) {
    return items.filter(item => {
        if (currentSearchTerm && !item.nom.toLowerCase().includes(currentSearchTerm.toLowerCase())) return false;
        
        if (currentLevelFilterBdd) {
            const level = item.level;
            if (currentLevelFilterBdd === "1" && (level < 1 || level > 99)) return false;
            if (currentLevelFilterBdd === "2" && (level < 100 || level > 149)) return false;
            if (currentLevelFilterBdd === "3" && (level < 150 || level > 199)) return false;
            if (currentLevelFilterBdd === "4" && level !== 200) return false;
        }
        
        if (currentStatFilter && currentStatFilter !== '') {
            let statValue = 0;
            const stats = item.stats;
            const caracs = stats.caracteristiques || {};
            
            switch(currentStatFilter) {
                case 'vita': statValue = stats.vita || 0; break;
                case 'force': statValue = caracs.force || 0; break;
                case 'intelligence': statValue = caracs.intelligence || 0; break;
                case 'chance': statValue = caracs.chance || 0; break;
                case 'agilite': statValue = caracs.agilite || 0; break;
                case 'pa': statValue = stats.pa || 0; break;
                case 'pm': statValue = stats.pm || 0; break;
                case 'portee': statValue = stats.portee || 0; break;
                case 'sagesse': statValue = stats.sagesse || 0; break;
                case 'prospection': statValue = stats.prospection || 0; break;
                default: statValue = 0;
            }
            
            if (currentStatMin && statValue < parseInt(currentStatMin)) return false;
            if (currentStatMax && statValue > parseInt(currentStatMax)) return false;
        }
        
        if (currentPanoplieFilter && currentPanoplieFilter !== '') {
            const itemPanoplieId = item.panoplie?.id || item.itemSetId;
            if (itemPanoplieId) {
                if (String(itemPanoplieId) !== String(currentPanoplieFilter)) return false;
            } else if (!item.panoplie?.nom?.toLowerCase().includes(currentPanoplieFilter.toLowerCase())) {
                return false;
            }
        }
        
        return true;
    });
}

window.updateStatValue = function(itemId, statPath, newValue, updateValeurK) {
    updateValeurK = updateValeurK || false;
    const value = parseInt(newValue) || 0;
    let targetItem = null;
    for (const cat in equipementsData) {
        const found = equipementsData[cat].find(i => i.id === itemId);
        if (found) { targetItem = found; break; }
    }
    if (targetItem) {
        const pathParts = statPath.split('.');
        if (pathParts.length === 1) {
            if (updateValeurK) targetItem.valeurK = value;
            else targetItem.stats[pathParts[0]] = value;
        } else if (pathParts.length === 2) targetItem.stats[pathParts[0]][pathParts[1]] = value;
        else if (pathParts.length === 3) targetItem.stats[pathParts[0]][pathParts[1]][pathParts[2]] = value;
        displayEquipementsBdd();
        displayInventory();
        displayEquippedSlots();
        updateCharacterSheet();
    }
};

window.updateValeurK = function(itemId, value) { window.updateStatValue(itemId, 'valeurK', value, true); };

function displayEquipementsBdd() {
    const grid = document.getElementById('equipementGrid');
    if (!grid) return;

    grid.className = `equipement-grid mode-${currentDisplayMode}`;

    let items = getEquipementsByCategorie(currentCategorie);
    items = filterEquipementsBdd(items);
    if (items.length === 0) {
        grid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 50px;">🔍 Aucun équipement trouvé</div>';
        return;
    }

    const hasNonZeroValue = (value) => value !== undefined && value !== null && Number(value) !== 0;
    const renderStatInput = (label, value, path, itemId, width = 60, extra = '') => {
        if (!hasNonZeroValue(value)) {
            return '';
        }
        return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value"><input type="number" class="stat-input" value="${value}" onchange="updateStatValue(${itemId}, '${path}', this.value)" style="width: ${width}px;"${extra}></span></div>`;
    };

    let html = '';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const categorie = getItemCategorie(item);
        const imagePath = getImagePath(item);
        const defaultImage = 'assets/images/equipements/default.png';
        const stats = item.stats;
        const caracs = stats.caracteristiques;
        const categorieDisplay = getCategorieDisplayName(categorie);
        const isInInventory = userInventory.some(invItem => invItem.id === item.id);

        if (currentDisplayMode === 'image') {
            html += `<div class="equipement-image-card">
                <button type="button" class="minimal-details-button" title="Afficher les caractéristiques et la recette" aria-label="Afficher les caractéristiques et la recette" onclick="event.stopPropagation(); showDetailsModalFromId(${item.id})">🔍</button>
                <img src="${imagePath}" alt="${escapeHtml(item.nom)}" loading="lazy" onerror="this.src='${defaultImage}'" onclick="addToInventoryAndRefresh(${JSON.stringify(item).replace(/"/g, '&quot;')})" title="Ajouter au stuff">
                <h3>${escapeHtml(item.nom)}</h3>
                <div class="equipement-image-meta">
                    <span>📶 Niveau ${item.level}</span>
                    <span>📦 ${categorieDisplay}</span>
                    ${isInInventory ? '<span>✓ Déjà dans l\'inventaire</span>' : ''}
                </div>
            </div>`;
            continue;
        }

        const resistanceRows = stats.resistance
            ? [
                hasNonZeroValue(stats.resistance.neutre) ? `<div class="stat"><span>Neutre</span><input type="number" class="stat-input" value="${stats.resistance.neutre}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.neutre', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.terre) ? `<div class="stat"><span>Terre</span><input type="number" class="stat-input" value="${stats.resistance.terre}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.terre', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.feu) ? `<div class="stat"><span>Feu</span><input type="number" class="stat-input" value="${stats.resistance.feu}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.feu', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.eau) ? `<div class="stat"><span>Eau</span><input type="number" class="stat-input" value="${stats.resistance.eau}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.eau', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.air) ? `<div class="stat"><span>Air</span><input type="number" class="stat-input" value="${stats.resistance.air}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.air', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.cri) ? `<div class="stat"><span>Critiques</span><input type="number" class="stat-input" value="${stats.resistance.cri}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.cri', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.melee) ? `<div class="stat"><span>Mêlée</span><input type="number" class="stat-input" value="${stats.resistance.melee}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.melee', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.dist) ? `<div class="stat"><span>Distance</span><input type="number" class="stat-input" value="${stats.resistance.dist}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.dist', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.pou) ? `<div class="stat"><span>Poussée</span><input type="number" class="stat-input" value="${stats.resistance.pou}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.pou', this.value)"></div>` : '',
                hasNonZeroValue(stats.resistance.armes) ? `<div class="stat"><span>Armes</span><input type="number" class="stat-input" value="${stats.resistance.armes}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.armes', this.value)"></div>` : ''
            ].join('')
            : '';

        const resistanceHtml = resistanceRows
            ? `<div class="resistances"><h4>🛡️ Résistances</h4><div class="res-grid">${resistanceRows}</div></div>`
            : '';

        const statsHtml = [
            renderStatInput('❤️ PV', stats.vita, 'vita', item.id),
            renderStatInput('🔝 Initiative', stats.initiative, 'initiative', item.id),
            renderStatInput('🔍 Prospection', stats.prospection, 'prospection', item.id),
            renderStatInput('📖 Sagesse', stats.sagesse, 'sagesse', item.id),
            renderStatInput('💪 Force', caracs?.force, 'caracteristiques.force', item.id),
            renderStatInput('🔥 Intelligence', caracs?.intelligence, 'caracteristiques.intelligence', item.id),
            renderStatInput('💧 Chance', caracs?.chance, 'caracteristiques.chance', item.id),
            renderStatInput('🍃 Agilité', caracs?.agilite, 'caracteristiques.agilite', item.id),
            renderStatInput('⚡ Puissance', caracs?.puissance, 'caracteristiques.puissance', item.id),
            renderStatInput('Dommages neutre', stats.doNeutre, 'doNeutre', item.id),
            renderStatInput('Dommages terre', stats.doTerre, 'doTerre', item.id),
            renderStatInput('Dommages feu', stats.doFeu, 'doFeu', item.id),
            renderStatInput('Dommages eau', stats.doEau, 'doEau', item.id),
            renderStatInput('Dommages air', stats.doAir, 'doAir', item.id),
            renderStatInput('❗ Dommages critiques', stats.doCri, 'doCri', item.id),
            renderStatInput('Dommages poussée', stats.doPou, 'doPou', item.id),
            renderStatInput('% Dommages sorts', stats.doSort, 'doSort', item.id),
            renderStatInput('% Dommages armes', stats.doPerArme, 'doPerArme', item.id),
            renderStatInput('% Dommages mêlée', stats.doMelee, 'doMelee', item.id),
            renderStatInput('% Dommages distance', stats.doDist, 'doDist', item.id),
            renderStatInput('♾️ Tacle', stats.tacle, 'tacle', item.id),
            renderStatInput('➖⭐ Retrait PA', stats.retPA, 'retPA', item.id),
            renderStatInput('➖🟩 Retrait PM', stats.retPM, 'retPM', item.id),
            renderStatInput('🦶 Fuite', stats.fuite, 'fuite', item.id),
            renderStatInput('🦶⭐ Esquive PA', stats.esqPA, 'esqPA', item.id),
            renderStatInput('🦶🟩 Esquive PM', stats.esqPM, 'esqPM', item.id),
            renderStatInput('💕 Soin', stats.soin, 'soin', item.id),
            renderStatInput('⭐ PA', stats.pa, 'pa', item.id, 60),
            renderStatInput('🟩 PM', stats.pm, 'pm', item.id, 60)
        ].join('');

        html += `<div class="equipement-card">
            <div class="card-image"><img src="${imagePath}" alt="${escapeHtml(item.nom)}" loading="lazy" onerror="this.src='${defaultImage}'"></div>
            <div class="card-header"><h3>${escapeHtml(item.nom)}</h3><div><span class="badge badge-level">Niveau ${item.level}</span><span class="badge badge-categorie">📦 ${categorieDisplay}</span></div></div>
            <div class="card-body"><div class="stats-grid">${statsHtml}</div><div class="stat valeur-k"><span class="stat-label">💰 Valeur</span><span class="stat-value"><input type="number" class="stat-input" value="${item.valeurK || 0}" onchange="updateValeurK(${item.id}, this.value)" style="width: 100px;"><span style="margin-left: 5px;">Kamas</span></span></div>${resistanceHtml}</div>
            <div class="card-footer"><div class="conditions">🔒 Niveau ${item.conditions.level}${item.conditions.classe ? ' • ' + (Array.isArray(item.conditions.classe) ? item.conditions.classe.join(', ') : item.conditions.classe) : ''}</div></div>
            <div class="add-button-container"><button class="add-btn" onclick="addToInventoryAndRefresh(${JSON.stringify(item).replace(/"/g, '&quot;')})" ${isInInventory ? 'disabled' : ''}>${isInInventory ? '✓' : '+'}</button></div>
        </div>`;
    }
    grid.innerHTML = html;
}

function renderRecipeDetails(item) {
    const resources = item.craft?.ressources;
    if (Array.isArray(resources) && resources.length) {
        const ingredients = resources.map(renderRecipeIngredient).join('');
        return `<details class="recipe-details"><summary>🔨 ${escapeHtml(item.craft.metier || 'Métier inconnu')} · niveau ${escapeHtml(String(item.craft.niveau || '?'))}</summary><div class="recipe-content"><ul>${ingredients}</ul></div></details>`;
    }

    if (!item.hasRecipe || !Number(item.dofusdbId)) return '';
    return `<details class="recipe-details" data-recipe-item-id="${escapeHtml(String(item.dofusdbId))}"><summary>🔨 Recette</summary><div class="recipe-content">Ouvrir pour charger les ingrédients.</div></details>`;
}

function renderRecipeIngredient(ingredient) {
    const name = ingredient.name || ingredient.nom || 'Ressource';
    const quantity = ingredient.quantity || ingredient.quantite || 1;
    const image = ingredient.image || ingredient.img || (ingredient.iconId || ingredient.id
        ? `https://api.dofusdb.fr/img/items/${ingredient.iconId || ingredient.id}.png`
        : '');
    const icon = image
        ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>📦</span>`
        : '<span>📦</span>';
    return `<li class="recipe-ingredient"><span class="recipe-ingredient-icon">${icon}</span><span class="recipe-ingredient-name">${escapeHtml(name)}</span><span class="recipe-ingredient-quantity">× ${escapeHtml(String(quantity))}</span></li>`;
}

async function loadRecipeDetails(details) {
    if (details.dataset.loaded || details.dataset.loading) return;
    details.dataset.loading = 'true';
    const content = details.querySelector('.recipe-content');

    try {
        const recipe = await getItemRecipeDetails(details.dataset.recipeItemId);
        if (!recipe) {
            content.textContent = 'Recette indisponible pour cet objet.';
            return;
        }

        const level = recipe.level ? ` · niveau ${recipe.level}` : '';
        details.querySelector('summary').textContent = `🔨 ${recipe.job}${level}`;
        const ingredients = recipe.ingredients.map(renderRecipeIngredient).join('');
        content.innerHTML = `<div class="recipe-result">${escapeHtml(recipe.itemName || '')}</div><ul>${ingredients || '<li>Ingrédients non renseignés</li>'}</ul>`;
        details.dataset.loaded = 'true';
    } catch (error) {
        content.textContent = 'Impossible de charger cette recette pour le moment.';
        console.warn('Erreur chargement recette:', error);
    } finally {
        delete details.dataset.loading;
    }
}

function renderPanoplieBonuses(item) {
    const panoplie = item.panoplie || (Number(item.itemSetId) > 0
        ? { id: Number(item.itemSetId), nom: `Panoplie #${item.itemSetId}` }
        : null);
    if (!panoplie) return '';

    const name = panoplie.nom || (panoplie.id ? `Panoplie #${panoplie.id}` : 'Panoplie');
    const localBonuses = panoplie.bonus;
    if (localBonuses && typeof localBonuses === 'object') {
        const statLabels = {
            vita: 'Vitalité', vitalite: 'Vitalité', sagesse: 'Sagesse', force: 'Force',
            intelligence: 'Intelligence', chance: 'Chance', agilite: 'Agilité',
            agilité: 'Agilité', puissance: 'Puissance', pa: 'PA', pm: 'PM',
            portee: 'Portée', prospection: 'Prospection', dommages: 'Dommages',
            dommage: 'Dommages', critique: 'Coups critiques'
        };
        const tiers = Object.entries(localBonuses).map(([pieces, effects]) => {
            const rows = Object.entries(effects || {}).map(([stat, value]) =>
                `<li>${escapeHtml(statLabels[stat.toLowerCase()] || stat)} : ${escapeHtml(String(value))}</li>`
            ).join('');
            return rows ? `<div class="panoply-bonus-tier"><strong>${escapeHtml(pieces)} pièces</strong><ul>${rows}</ul></div>` : '';
        }).join('');
        return `<details class="panoply-bonus-details"><summary>✨ ${escapeHtml(name)} · Bonus</summary><div class="panoply-bonus-content">${tiers || 'Aucun bonus renseigné.'}</div></details>`;
    }

    if (!panoplie.id) {
        return `<div class="panoplie"><h4>✨ ${escapeHtml(name)}</h4></div>`;
    }

    return `<details class="panoply-bonus-details" data-panoplie-id="${escapeHtml(String(panoplie.id))}"><summary>✨ ${escapeHtml(name)} · Bonus</summary><div class="panoply-bonus-content">Ouvrir pour charger les bonus.</div></details>`;
}

async function loadPanoplieBonuses(details) {
    if (details.dataset.loaded || details.dataset.loading) return;
    details.dataset.loading = 'true';
    const content = details.querySelector('.panoply-bonus-content');

    try {
        const data = await getPanoplieBonusDetails(details.dataset.panoplieId);
        if (!data?.bonuses?.length) {
            content.textContent = 'Aucun bonus disponible pour cette panoplie.';
            return;
        }

        const summary = details.querySelector('summary');
        if (summary) summary.textContent = `✨ ${data.name} · Bonus`;
        const bonusesHtml = data.bonuses.map(tier =>
            `<div class="panoply-bonus-tier"><strong>${tier.pieces} pièces</strong><ul>${tier.effects.map(effect => `<li>${escapeHtml(effect)}</li>`).join('')}</ul></div>`
        ).join('');
        content.innerHTML = bonusesHtml || '<div class="panoply-bonus-empty">Aucun bonus renseigné.</div>';
        details.dataset.loaded = 'true';
    } catch (error) {
        content.textContent = 'Impossible de charger les bonus pour le moment.';
        console.warn('Erreur chargement bonus de panoplie:', error);
    } finally {
        delete details.dataset.loading;
    }
}

async function loadPanoplieItems(section, panoplieId) {
    const content = section.querySelector('.detail-panoply-items');
    try {
        const data = await getPanoplieItems(panoplieId);
        if (!data?.items?.length) {
            content.textContent = 'Aucun objet associé trouvé.';
            return;
        }
        content.innerHTML = `<ul>${data.items.map(item => `<li class="panoply-item-row"><span class="panoply-item-icon">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ''}<span ${item.image ? 'hidden' : ''}>📦</span></span><span class="panoply-item-name">${escapeHtml(item.name)}${item.level ? ` <span>(niv. ${item.level})</span>` : ''}</span></li>`).join('')}</ul>`;
    } catch (error) {
        content.textContent = 'Impossible de charger les objets de cette panoplie.';
        console.warn('Erreur chargement des objets de panoplie:', error);
    }
}

window.addToInventoryAndRefresh = function(item) {
    addToInventory(item);
    displayEquipementsBdd();
};

async function addPanoplieToInventory(panoplieId) {
    if (!panoplieId) return;

    try {
        const panoplie = await getPanoplieItems(panoplieId);
        const catalogue = getAllEquipements();
        const matchingItems = (panoplie?.items || []).map(setItem =>
            catalogue.find(item => Number(item.dofusdbId) === Number(setItem.id))
        ).filter(Boolean);
        const newItems = matchingItems.filter(item =>
            !userInventory.some(existing => existing.id === item.id)
        );

        if (newItems.length) {
            userInventory.push(...newItems);
            saveUserInventory();
            displayInventory();
            updateFooterStats();
        }

        showToast(newItems.length
            ? `✅ ${newItems.length} équipement${newItems.length > 1 ? 's' : ''} ajouté${newItems.length > 1 ? 's' : ''} à l'inventaire${matchingItems.length > newItems.length ? ` · ${matchingItems.length - newItems.length} déjà présent${matchingItems.length - newItems.length > 1 ? 's' : ''}` : ''}`
            : 'Tous les équipements de cette panoplie sont déjà dans l’inventaire.');
    } catch (error) {
        console.warn('Erreur ajout de panoplie à l’inventaire:', error);
        showToast('Impossible de charger cette panoplie pour le moment.');
    }
}

window.addPanoplieToInventory = addPanoplieToInventory;

// ==================== INITIALISATION ====================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            if (tabId === 'tab-profil') {
                displayInventory();
                displayEquippedSlots();
                updateCharacterSheet();
            }
        });
    });
}

function initProfil() {
    const container = document.getElementById('categoriesFilter');
    if (container) {
        const categorySelect = document.getElementById('categoryFilterSelect');
        const applyCategoryFilter = (cat) => {
            document.querySelectorAll('#categoriesFilter .cat-filter').forEach(b => b.classList.remove('active'));
            const selectedButton = document.querySelector(`#categoriesFilter .cat-filter[data-cat="${cat}"]`);
            if (selectedButton) selectedButton.classList.add('active');
            if (categorySelect) categorySelect.value = cat;
            currentCategory = cat;
            displayInventory();
        };

        container.innerHTML = '<button class="cat-filter active" data-cat="all">Toutes catégories</button>';
        const allButton = container.querySelector('[data-cat="all"]');
        if (allButton) {
            allButton.onclick = () => applyCategoryFilter('all');
        }

        const categories = [...new Set(getAllEquipements().map(i => i.categorie))];
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="all">Toutes catégories</option>';
        }
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-filter';
            btn.dataset.cat = cat;
            btn.textContent = `📦 ${getCategorieDisplayName(cat)}`;
            btn.onclick = () => applyCategoryFilter(cat);
            if (currentCategory === cat) {
                btn.classList.add('active');
            }
            container.appendChild(btn);

            if (categorySelect) {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = getCategorieDisplayName(cat);
                categorySelect.appendChild(option);
            }
        });
        if (categorySelect) categorySelect.value = currentCategory;

        if (categorySelect && !categorySelect.dataset.eventBound) {
            categorySelect.addEventListener('change', event => applyCategoryFilter(event.target.value));
            categorySelect.dataset.eventBound = 'true';
        }
    }

    if (!profilFiltersBound) {
        const searchInput = document.getElementById('searchInventory');
        if (searchInput) searchInput.addEventListener('input', (e) => { searchTerm = e.target.value; displayInventory(); });
        const levelSelect = document.getElementById('levelFilter');
        if (levelSelect) levelSelect.addEventListener('change', (e) => { levelFilter = e.target.value; displayInventory(); });
        profilFiltersBound = true;
    }
}

function initAdvancedSearch() {
    const statSelect = document.getElementById('searchStatBdd');
    const statMin = document.getElementById('searchStatMin');
    const statMax = document.getElementById('searchStatMax');
    const panoplieSelect = document.getElementById('searchPanoplieBdd');
    const panoplieSearchInput = document.getElementById('searchPanoplieInput');
    const panoplieSuggestions = document.getElementById('panoplieSuggestions');
    const addPanoplieButton = document.getElementById('addPanoplieToInventoryBtn');
    
    if (statSelect) statSelect.addEventListener('change', (e) => { currentStatFilter = e.target.value; displayEquipementsBdd(); });
    if (statMin) statMin.addEventListener('input', (e) => { currentStatMin = e.target.value; displayEquipementsBdd(); });
    if (statMax) statMax.addEventListener('input', (e) => { currentStatMax = e.target.value; displayEquipementsBdd(); });
    
    if (panoplieSelect && panoplieSearchInput && panoplieSuggestions) {
        let panoplies = [];
        const normalizeName = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const panoplieSearchKey = name => normalizeName(name).replace(/^panoplie\s+(?:(?:du|des|de)\s+|d['’])?/, '');
        const closeSuggestions = () => {
            panoplieSuggestions.hidden = true;
            panoplieSearchInput.setAttribute('aria-expanded', 'false');
        };
        const choosePanoplie = panoplie => {
            panoplieSearchInput.value = panoplie.name;
            panoplieSelect.value = String(panoplie.id);
            currentPanoplieFilter = String(panoplie.id);
            if (addPanoplieButton) addPanoplieButton.disabled = false;
            closeSuggestions();
            displayEquipementsBdd();
        };
        const renderSuggestions = () => {
            const prefix = normalizeName(panoplieSearchInput.value);
            panoplieSuggestions.replaceChildren();
            if (prefix.length < 3) {
                closeSuggestions();
                return;
            }

            const matches = panoplies.filter(panoplie =>
                normalizeName(panoplie.name).startsWith(prefix) || panoplieSearchKey(panoplie.name).startsWith(prefix)
            ).slice(0, 60);
            matches.forEach(panoplie => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'panoply-suggestion';
                option.setAttribute('role', 'option');
                option.textContent = panoplie.name;
                option.dataset.panoplieId = String(panoplie.id);
                panoplieSuggestions.appendChild(option);
            });
            panoplieSuggestions.hidden = matches.length === 0;
            panoplieSearchInput.setAttribute('aria-expanded', String(matches.length > 0));
        };

        const populatePanoplieOptions = async () => {
            try {
                panoplies = await getPanoplieCatalog();
                panoplieSelect.replaceChildren(new Option('Toutes panoplies', ''));
                panoplies.forEach(panoplie => {
                    panoplieSelect.add(new Option(panoplie.name, String(panoplie.id)));
                });
                panoplieSelect.value = currentPanoplieFilter;
                if (currentPanoplieFilter) {
                    panoplieSearchInput.value = panoplies.find(set => String(set.id) === currentPanoplieFilter)?.name || '';
                }
            } catch (error) {
                console.warn('Impossible de charger les panoplies pour le filtre:', error);
                const fallbackPanoplies = new Map();
                getAllEquipements().forEach(item => {
                    if (item.panoplie?.nom) {
                        const id = item.panoplie.id ? String(item.panoplie.id) : item.panoplie.nom;
                        fallbackPanoplies.set(id, item.panoplie.nom);
                    }
                });
                panoplieSelect.replaceChildren(new Option('Toutes panoplies', ''));
                [...fallbackPanoplies.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')).forEach(([id, name]) => {
                    panoplieSelect.add(new Option(name, id));
                });
                panoplies = [...fallbackPanoplies.entries()].map(([id, name]) => ({ id, name }));
            }
            renderSuggestions();
        };

        if (!panoplieSearchInput.dataset.eventBound) {
            panoplieSearchInput.addEventListener('input', () => {
                if (currentPanoplieFilter) {
                    currentPanoplieFilter = '';
                    panoplieSelect.value = '';
                    if (addPanoplieButton) addPanoplieButton.disabled = true;
                    displayEquipementsBdd();
                }
                renderSuggestions();
            });
            panoplieSearchInput.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    const firstSuggestion = panoplieSuggestions.querySelector('.panoply-suggestion');
                    if (firstSuggestion) {
                        event.preventDefault();
                        firstSuggestion.click();
                    }
                } else if (event.key === 'Escape') {
                    closeSuggestions();
                }
            });
            panoplieSuggestions.addEventListener('click', event => {
                const option = event.target.closest('.panoply-suggestion');
                const panoplie = panoplies.find(set => String(set.id) === option?.dataset.panoplieId);
                if (panoplie) choosePanoplie(panoplie);
            });
            panoplieSearchInput.dataset.eventBound = 'true';
        }
        if (addPanoplieButton && !addPanoplieButton.dataset.eventBound) {
            addPanoplieButton.addEventListener('click', () => addPanoplieToInventory(currentPanoplieFilter));
            addPanoplieButton.dataset.eventBound = 'true';
        }
        if (addPanoplieButton) addPanoplieButton.disabled = !currentPanoplieFilter;
        populatePanoplieOptions();
    }
}

function initBdd() {
    const container = document.getElementById('categoriesBdd');
    if (container) {
        const applyCategoryFilter = (cat) => {
            document.querySelectorAll('#categoriesBdd .cat-btn').forEach(b => b.classList.remove('active'));
            const selectedButton = document.querySelector(`#categoriesBdd .cat-btn[data-categorie="${cat}"]`);
            if (selectedButton) selectedButton.classList.add('active');
            currentCategorie = cat;
            displayEquipementsBdd();
        };

        container.innerHTML = '<button class="cat-btn active" data-categorie="all">📦 Tous</button>';
        const allButton = container.querySelector('[data-categorie="all"]');
        if (allButton) {
            allButton.onclick = () => applyCategoryFilter('all');
        }

        const categories = getCategories();
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-btn';
            btn.setAttribute('data-categorie', cat);
            btn.textContent = `📦 ${getCategorieDisplayName(cat)}`;
            btn.onclick = () => applyCategoryFilter(cat);
            if (currentCategorie === cat) {
                btn.classList.add('active');
            }
            container.appendChild(btn);
        });
    }

    const displayModeButtons = document.querySelectorAll('.display-mode-btn');
    const refreshDisplayModeState = () => {
        displayModeButtons.forEach((button) => {
            const stateSpan = button.querySelector('.display-mode-state');
            const isActive = button.dataset.mode === currentDisplayMode;
            button.classList.toggle('active', isActive);
            if (stateSpan) {
                stateSpan.textContent = isActive ? 'ON' : 'OFF';
            }
        });
    };

    displayModeButtons.forEach((button) => {
        const isActive = button.dataset.mode === currentDisplayMode;
        button.classList.toggle('active', isActive);
        button.onclick = () => {
            currentDisplayMode = button.dataset.mode;
            localStorage.setItem('dofusBddDisplayMode', currentDisplayMode);
            refreshDisplayModeState();
            displayEquipementsBdd();
        };
    });
    refreshDisplayModeState();

    if (!bddFiltersBound) {
        const searchInput = document.getElementById('searchNom');
        if (searchInput) searchInput.addEventListener('input', (e) => { currentSearchTerm = e.target.value; displayEquipementsBdd(); });
        
        const levelSelect = document.getElementById('searchLevelBdd');
        if (levelSelect) levelSelect.addEventListener('change', (e) => { currentLevelFilterBdd = e.target.value; displayEquipementsBdd(); });
        
        initAdvancedSearch();
        
        const btnRechercher = document.getElementById('btnRechercher');
        if (btnRechercher) btnRechercher.addEventListener('click', () => { displayEquipementsBdd(); });
        
        const btnReset = document.getElementById('btnReset');
        if (btnReset) btnReset.addEventListener('click', () => {
            currentSearchTerm = '';
            currentLevelFilterBdd = '';
            currentStatFilter = '';
            currentStatMin = '';
            currentStatMax = '';
            currentPanoplieFilter = '';
            if (searchInput) searchInput.value = '';
            if (levelSelect) levelSelect.value = '';
            const statSelect = document.getElementById('searchStatBdd');
            const statMin = document.getElementById('searchStatMin');
            const statMax = document.getElementById('searchStatMax');
            const panoplieSelect = document.getElementById('searchPanoplieBdd');
            const panoplieSearchInput = document.getElementById('searchPanoplieInput');
            const panoplieSuggestions = document.getElementById('panoplieSuggestions');
            const addPanoplieButton = document.getElementById('addPanoplieToInventoryBtn');
            if (statSelect) statSelect.value = '';
            if (statMin) statMin.value = '';
            if (statMax) statMax.value = '';
            if (panoplieSelect) panoplieSelect.value = '';
            if (panoplieSearchInput) {
                panoplieSearchInput.value = '';
                panoplieSearchInput.setAttribute('aria-expanded', 'false');
            }
            if (panoplieSuggestions) {
                panoplieSuggestions.replaceChildren();
                panoplieSuggestions.hidden = true;
            }
            if (addPanoplieButton) addPanoplieButton.disabled = true;
            displayEquipementsBdd();
        });
        
        bddFiltersBound = true;
    }
}

function initShortcutsPanel() {
    const shortcuts = document.querySelector('.shortcuts');
    const summary = shortcuts?.querySelector('summary');
    if (!shortcuts || !summary) {
        return;
    }

    const savedState = localStorage.getItem('dofusShortcutsOpen');
    shortcuts.open = savedState === 'true';

    const persistShortcutState = () => {
        window.requestAnimationFrame(() => {
            localStorage.setItem('dofusShortcutsOpen', String(shortcuts.open));
        });
    };

    summary.addEventListener('click', persistShortcutState);
    shortcuts.addEventListener('toggle', persistShortcutState);
}

function initBackToTop() {
    const btn = document.getElementById('backToTopBdd');
    if (!btn) return;

    const toggle = () => {
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
        if (activeTab !== 'tab-bdd') { btn.classList.remove('show'); return; }
        if (window.scrollY > 300) btn.classList.add('show'); else btn.classList.remove('show');
    };

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', toggle);
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => setTimeout(toggle, 50)));
    toggle();
}

// ==================== TEMPLATES STUFF ====================

let currentEditingTemplateIndex = -1;

function loadTemplates() {
    const saved = localStorage.getItem('dofusTemplates');
    if (saved) {
        try {
            templates = JSON.parse(saved);
        } catch (e) {
            templates = [];
        }
    } else {
        templates = [];
    }
    updateTemplateSelect();
}

function saveTemplates() {
    localStorage.setItem('dofusTemplates', JSON.stringify(templates));
    updateTemplateSelect();
    updateFooterStats();
}

function updateTemplateSelect() {
    const select = document.getElementById('loadTemplateSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Charger un template...</option>';
    templates.forEach((template, index) => {
        const option = document.createElement('option');
        option.value = index;
        const equipCount = Object.values(template.set).filter(s => s).length;
        const modified = template.modified ? ' ✏️' : '';
        option.textContent = `${template.name} (${equipCount} équipements) - ${template.date || 'sans date'}${modified}`;
        if (template.modified) {
            option.style.backgroundColor = '#ffa50020';
            option.style.color = '#ffd89b';
        }
        select.appendChild(option);
    });
    
    const footerTemplateCount = document.getElementById('footerTemplateCount');
    if (footerTemplateCount) {
        footerTemplateCount.textContent = templates.length;
    }
    
    const templateStatus = document.getElementById('templateStatus');
    if (templateStatus) {
        if (currentEditingTemplateIndex >= 0 && templates[currentEditingTemplateIndex]) {
            templateStatus.innerHTML = `📝 Édition en cours : "${templates[currentEditingTemplateIndex].name}" - Modifie puis clique sur "Modifier" pour enregistrer`;
            templateStatus.style.color = '#ffa500';
        } else {
            templateStatus.innerHTML = '';
        }
    }
}

function saveCurrentTemplate() {
    const nameInput = document.getElementById('templateName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showToast('⚠️ Veuillez entrer un nom pour le template');
        return;
    }
    
    const existingIndex = templates.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingIndex !== -1) {
        if (confirm(`Un template nommé "${name}" existe déjà. Voulez-vous le remplacer ?`)) {
            updateExistingTemplate(existingIndex, name);
        }
        return;
    }
    
    const template = {
        name: name,
        date: new Date().toLocaleString(),
        ...captureTemplateConfiguration(),
        modified: false
    };
    
    templates.push(template);
    saveTemplates();
    nameInput.value = '';
    showToast(`✅ Template "${name}" sauvegardé !`);
}

function updateExistingTemplate(index, newName = null) {
    const template = templates[index];
    
    template.date = new Date().toLocaleString();
    Object.assign(template, captureTemplateConfiguration());
    template.modified = true;
    
    if (newName) {
        template.name = newName;
    }
    
    saveTemplates();
    showToast(`✅ Template "${template.name}" mis à jour !`);
    
    currentEditingTemplateIndex = -1;
    const nameInput = document.getElementById('templateName');
    if (nameInput) nameInput.value = '';
    updateTemplateSelect();
}

function editTemplate() {
    const select = document.getElementById('loadTemplateSelect');
    const selectedIndex = parseInt(select.value);
    
    if (isNaN(selectedIndex) || selectedIndex < 0 || !templates[selectedIndex]) {
        showToast('⚠️ Veuillez sélectionner un template à modifier');
        return;
    }
    
    currentEditingTemplateIndex = selectedIndex;
    const template = templates[selectedIndex];
    
    const nameInput = document.getElementById('templateName');
    if (nameInput) {
        nameInput.value = template.name;
    }
    
    updateTemplateSelect();
    
    showToast(`✏️ Édition du template "${template.name}" - Modifie ton stuff puis clique sur "Modifier"`);
}

function loadTemplate(index) {
    const template = templates[index];
    if (!template) return;
    
    for (const slot of slotsConfig) {
        if (template.set[slot.id]) {
            const originalItem = getAllEquipements().find(i => i.id === template.set[slot.id].id);
            if (originalItem) {
                currentSet[slot.id] = originalItem;
            } else {
                currentSet[slot.id] = template.set[slot.id];
            }
        } else {
            currentSet[slot.id] = null;
        }
    }

    if (template.characteristicPoints) {
        characteristicPoints = normalizeCharacteristicPoints(template.characteristicPoints);
        localStorage.setItem(CHARACTER_POINTS_STORAGE_KEY, JSON.stringify(characteristicPoints));
        updateCharacterPointAllocationDisplay();
    }

    if (Object.prototype.hasOwnProperty.call(template, 'equipmentForgemage')) {
        equipmentForgemage = template.equipmentForgemage && typeof template.equipmentForgemage === 'object'
            ? template.equipmentForgemage
            : {};
        localStorage.setItem(EQUIPMENT_FORGEMAGE_STORAGE_KEY, JSON.stringify(equipmentForgemage));
    }
    
    forgePA = template.forgePA || 0;
    forgePM = template.forgePM || 0;
    forgePO = template.forgePO || 0;
    saveForgeState();
    
    if (template.parchotageStats) {
        parchotageStats = { ...parchotageStats, ...template.parchotageStats };
        saveParchotageState();
        updateParchotageDisplay();
    }
    
    saveSet();
    displayEquippedSlots();
    updateCharacterSheet();
    displayInventory();
    
    const checkPA = document.getElementById('forgePACheck');
    const checkPM = document.getElementById('forgePMCheck');
    const checkPO = document.getElementById('forgePOCheck');
    if (checkPA) checkPA.checked = forgePA === 1;
    if (checkPM) checkPM.checked = forgePM === 1;
    if (checkPO) checkPO.checked = forgePO === 1;
    if (document.getElementById('forgePAValue')) document.getElementById('forgePAValue').textContent = forgePA === 1 ? '+1' : '+0';
    if (document.getElementById('forgePMValue')) document.getElementById('forgePMValue').textContent = forgePM === 1 ? '+1' : '+0';
    if (document.getElementById('forgePOValue')) document.getElementById('forgePOValue').textContent = forgePO === 1 ? '+1' : '+0';
    
    currentEditingTemplateIndex = -1;
    const nameInput = document.getElementById('templateName');
    if (nameInput) nameInput.value = '';
    updateTemplateSelect();
    
    showToast(`📦 Template "${template.name}" chargé !`);
}

function deleteTemplate(index) {
    if (confirm(`Supprimer le template "${templates[index].name}" ?`)) {
        templates.splice(index, 1);
        saveTemplates();
        showToast(`🗑️ Template supprimé`);
        
        if (currentEditingTemplateIndex === index) {
            currentEditingTemplateIndex = -1;
            const nameInput = document.getElementById('templateName');
            if (nameInput) nameInput.value = '';
        }
        updateTemplateSelect();
    }
}

function initTemplates() {
    loadTemplates();
    
    const saveBtn = document.getElementById('saveTemplateBtn');
    const updateBtn = document.getElementById('updateTemplateBtn');
    const loadSelect = document.getElementById('loadTemplateSelect');
    const deleteBtn = document.getElementById('deleteTemplateBtn');
    
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentTemplate);
    if (updateBtn) updateBtn.addEventListener('click', () => {
        if (currentEditingTemplateIndex >= 0) {
            const nameInput = document.getElementById('templateName');
            const newName = nameInput.value.trim();
            if (!newName) {
                showToast('⚠️ Veuillez entrer un nom pour le template');
                return;
            }
            updateExistingTemplate(currentEditingTemplateIndex, newName);
            currentEditingTemplateIndex = -1;
            nameInput.value = '';
        } else {
            editTemplate();
        }
    });
    if (loadSelect) loadSelect.addEventListener('change', (e) => {
        if (e.target.value !== '') {
            loadTemplate(parseInt(e.target.value));
            e.target.value = '';
        }
    });
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
        const select = document.getElementById('loadTemplateSelect');
        if (select.value !== '') {
            deleteTemplate(parseInt(select.value));
            select.value = '';
        } else {
            showToast('⚠️ Sélectionnez un template à supprimer');
        }
    });
}

// ==================== CORRECTION DES CATÉGORIES ====================

function fixItemCategories() {
    console.log('🔧 Correction des catégories...');
    
    const arcanisteIds = [19117, 23002, 23003];
    
    for (const cat in equipementsData) {
        const items = equipementsData[cat];
        if (!items || !Array.isArray(items)) continue;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            const isArcaniste = arcanisteIds.includes(item.id) || 
                                (item.nom && item.nom.toLowerCase().includes('arcaniste'));
            
            if (isArcaniste && cat !== 'trophees') {
                equipementsData[cat].splice(i, 1);
                
                if (!equipementsData['trophees']) {
                    equipementsData['trophees'] = [];
                }
                item.categorie = 'trophees';
                equipementsData['trophees'].push(item);
                
                console.log(`✅ Déplacement de "${item.nom}" (ID: ${item.id}) vers la catégorie Trophées`);
                i--;
            }
        }
    }
}

// ==================== RAFRAÎCHISSEMENT DES DONNÉES ====================

async function refreshFromDofusDB() {
    try {
        await hydrateAllEquipementsFromDofusDB(equipementsData);
        
        fixItemCategories();
        
        userInventory = userInventory.map(savedItem => {
            const registryItem = getAllEquipements().find(item => item.id === savedItem.id);
            return mergeSavedItemWithRegistry(savedItem, registryItem);
        });
        saveUserInventory();
        loadSet();
        initProfil();
        initBdd();
        displayEquippedSlots();
        displayInventory();
        displayEquipementsBdd();
        updateCharacterSheet();
        
        updateFooterStats();
        
    } catch (error) {
        console.warn('Impossible de synchroniser les données DofusDB', error);
    }
}

// Démarrage de l'application
loadUserInventory();
loadSet();
loadForgeState();
loadParchotageState();
initCharacterPointAllocation();
initTabs();
initProfil();
initBdd();
initShortcutsPanel();
initBackToTop();
initTemplates();
displayEquippedSlots();
displayInventory();
displayEquipementsBdd();
updateCharacterSheet();
updateFooterStats();
initCharacterClasses();

// Déclenchement du chargement des données depuis l'API
refreshFromDofusDB();
