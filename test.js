// test.js - Application principale
const cacheBuster = Date.now();
const dataModule = await import(`./data/index.js?cache=${cacheBuster}`);
const syncModule = await import(`./data/dofusdbSync.js?cache=${cacheBuster}`);

const {
    equipementsData,
    categorieNames,
    slotsConfig,
    getAllEquipements,
    getEquipementsByCategorie,
    getCategories,
    getCategorieDisplayName,
    getItemCategorie
} = dataModule;
const { hydrateAllEquipementsFromDofusDB } = syncModule;

// ==================== ÉTAT ====================
let userInventory = [];
let profilFiltersBound = false;
let bddFiltersBound = false;
let currentSet = {};
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

function showDetailsModal(item) {
    const modal = document.getElementById('modalDetails');
    const title = document.getElementById('detailTitle');
    const content = document.getElementById('detailContent');
    if (!modal || !title || !content) return;
    
    title.textContent = item.nom;
    const imagePath = getImagePath(item);
    const defaultImage = 'assets/images/equipements/default.png';
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
        detailLine('⭐ PA', stats.pa, (value) => `+${value}`),
        detailLine('🟩 PM', stats.pm, (value) => `+${value}`),
        detailLine('👁️ Portée', stats.portee),
        detailLine('❗ Critique', stats.critique),
        detailLine('💕 Soin', stats.soin),
        detailLine('👼 Invocations', stats.invocations),
        detailLine('♾️ Tacle', stats.tacle),
        detailLine('🦶🟩 Esquive PM', stats.esqPM),
        detailLine('➖⭐ Retrait PA', stats.retPA)
    ].join('');

    const resistanceRows = [];
    if (stats.resistance) {
        resistanceRows.push(detailLine('Neutre', stats.resistance.neutre, (value) => `${value}%`));
        resistanceRows.push(detailLine('Terre', stats.resistance.terre, (value) => `${value}%`));
        resistanceRows.push(detailLine('Feu', stats.resistance.feu, (value) => `${value}%`));
        resistanceRows.push(detailLine('Eau', stats.resistance.eau, (value) => `${value}%`));
        resistanceRows.push(detailLine('Air', stats.resistance.air, (value) => `${value}%`));
    }

    const resistanceHtml = resistanceRows.some(Boolean)
        ? `<div class="detail-section"><h4>🛡️ Résistances</h4>${resistanceRows.join('')}</div>`
        : '';

    const characteristicsHtml = characteristicsRows
        ? `<div class="detail-section"><h4>📊 Caractéristiques</h4>${characteristicsRows}</div>`
        : '';

    content.innerHTML = `<div class="detail-image"><img src="${imagePath}" alt="${item.nom}" onerror="this.src='${defaultImage}'"></div>
        <div class="detail-row"><span class="detail-label">📦 Catégorie</span><span class="detail-value">${getCategorieDisplayName(item.categorie)}</span></div>
        <div class="detail-row"><span class="detail-label">⭐ Niveau</span><span class="detail-value">${item.level}</span></div>
        <div class="detail-row"><span class="detail-label">💰 Valeur</span><span class="detail-value">${formatKamas(item.valeurK || 0)} Kamas</span></div>
        ${characteristicsHtml}
        ${resistanceHtml}
        ${displayPanoplieInfo(item)}
        <div class="detail-section"><h4>🔨 Craft</h4>
            <div class="detail-row"><span class="detail-label">Métier</span><span class="detail-value">${item.craft.metier}</span></div>
            <div class="detail-row"><span class="detail-label">Niveau</span><span class="detail-value">${item.craft.niveau}</span></div></div>`;
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

    return {
        ...registryItem,
        valeurK: savedItem?.valeurK ?? registryItem?.valeurK ?? 0,
        stats: {
            ...registryItem.stats,
            ...savedItem?.stats,
            caracteristiques: {
                ...registryItem.stats?.caracteristiques,
                ...savedItem?.stats?.caracteristiques
            },
            resistance: {
                ...registryItem.stats?.resistance,
                ...savedItem?.stats?.resistance
            }
        }
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
        bonusPA: `+${totalPa}`, bonusPM: `+${totalPm}`, bonusPO: `+${totalPortee}`,
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
}

// ==================== AFFICHAGE ====================
function displayEquippedSlots() {
    const container = document.getElementById('equippedSlotsList');
    if (!container) return;
    
    const sortedSlots = [...slotsConfig].sort((a, b) => {
        if (a.id === 'anneaux1') return -1;
        if (b.id === 'anneaux1') return 1;
        if (a.id === 'anneaux2') return -1;
        if (b.id === 'anneaux2') return 1;
        return 0;
    });
    
    container.innerHTML = sortedSlots.map(slot => {
        const item = currentSet[slot.id];
        if (item) {
            const imagePath = getImagePath(item);
            const defaultImage = 'assets/images/equipements/default.png';
            return `<div class="slot-item"><div class="slot-info"><div class="slot-icon-small"><img src="${imagePath}" alt="${item.nom}" onerror="this.src='${defaultImage}'"></div><div><div class="slot-name">${slot.nom}</div><div class="slot-item-name">${item.nom}</div></div></div><div class="slot-actions"><button class="slot-details-btn-small" onclick="showDetailsModalFromId(${item.id})">🔍</button><button class="remove-slot-small" onclick="unequipItem('${slot.id}')" title="Déséquiper">−</button></div></div>`;
        } else {
            return `<div class="slot-item slot-item-empty"><div class="slot-info"><div class="slot-icon-small"><span style="font-size:16px;">${slot.emoji}</span></div><div><div class="slot-name">${slot.nom}</div><div class="slot-empty-text">—</div></div></div><div class="slot-actions"><button class="slot-details-btn-small" disabled style="opacity:0.3;">🔍</button><button class="remove-slot-small" disabled style="opacity:0.3;">Vide</button></div></div>`;
        }
    }).join('');
}

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

function showDetailsModalFromId(itemId) {
    let item = userInventory.find(i => i.id === itemId);
    if (!item) item = getAllEquipements().find(i => i.id === itemId);
    if (item) showDetailsModal(item);
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
            if (!item.panoplie || !item.panoplie.nom) return false;
            if (!item.panoplie.nom.toLowerCase().includes(currentPanoplieFilter.toLowerCase())) return false;
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
                <img src="${imagePath}" alt="${escapeHtml(item.nom)}" loading="lazy" onerror="this.src='${defaultImage}'" onclick="addToInventoryAndRefresh(${JSON.stringify(item).replace(/"/g, '&quot;')})" title="Ajouter au stuff">
                <h3>${escapeHtml(item.nom)}</h3>
                <div class="equipement-image-meta">
                    <span>📶 Niveau ${item.level}</span>
                    <span>📦 ${categorieDisplay}</span>
                    <span>${isInInventory ? '✓ Déjà dans l\'inventaire' : '➕ Cliquez sur l\'image pour ajouter'}</span>
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
                hasNonZeroValue(stats.resistance.air) ? `<div class="stat"><span>Air</span><input type="number" class="stat-input" value="${stats.resistance.air}" style="width: 45px;" onchange="updateStatValue(${item.id}, 'resistance.air', this.value)"></div>` : ''
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
            renderStatInput('⭐ PA', stats.pa, 'pa', item.id, 60),
            renderStatInput('🟩 PM', stats.pm, 'pm', item.id, 60)
        ].join('');

        html += `<div class="equipement-card"><div class="card-image"><img src="${imagePath}" alt="${escapeHtml(item.nom)}" loading="lazy" onerror="this.src='${defaultImage}'"></div><div class="card-header"><h3>${escapeHtml(item.nom)}</h3><div><span class="badge badge-level">Niveau ${item.level}</span><span class="badge badge-categorie">📦 ${categorieDisplay}</span></div></div><div class="card-body"><div class="stats-grid">${statsHtml}</div><div class="stat valeur-k"><span class="stat-label">💰 Valeur</span><span class="stat-value"><input type="number" class="stat-input" value="${item.valeurK || 0}" onchange="updateValeurK(${item.id}, this.value)" style="width: 100px;"><span style="margin-left: 5px;">Kamas</span></span></div>${resistanceHtml}${item.panoplie && item.panoplie.nom ? `<div class="panoplie"><h4>✨ ${escapeHtml(item.panoplie.nom)}</h4></div>` : ''}</div><div class="card-footer"><div class="conditions">🔒 Niveau ${item.conditions.level}${item.conditions.classe ? ' • ' + (Array.isArray(item.conditions.classe) ? item.conditions.classe.join(', ') : item.conditions.classe) : ''}</div><div class="craft-info">🔨 ${item.craft.metier} (Niv. ${item.craft.niveau})</div></div><div class="add-button-container"><button class="add-btn" onclick="addToInventoryAndRefresh(${JSON.stringify(item).replace(/"/g, '&quot;')})" ${isInInventory ? 'disabled' : ''}>${isInInventory ? '✓' : '+'}</button></div></div>`;
    }
    grid.innerHTML = html;
}

window.addToInventoryAndRefresh = function(item) {
    addToInventory(item);
    displayEquipementsBdd();
};

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
        container.innerHTML = '<button class="cat-filter active" data-cat="all">Toutes catégories</button>';
        const categories = [...new Set(getAllEquipements().map(i => i.categorie))];
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-filter';
            btn.dataset.cat = cat;
            btn.textContent = `📦 ${getCategorieDisplayName(cat)}`;
            btn.onclick = () => {
                document.querySelectorAll('#categoriesFilter .cat-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = cat;
                displayInventory();
            };
            if (currentCategory === cat) {
                btn.classList.add('active');
            }
            container.appendChild(btn);
        });
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
    
    if (statSelect) statSelect.addEventListener('change', (e) => { currentStatFilter = e.target.value; displayEquipementsBdd(); });
    if (statMin) statMin.addEventListener('input', (e) => { currentStatMin = e.target.value; displayEquipementsBdd(); });
    if (statMax) statMax.addEventListener('input', (e) => { currentStatMax = e.target.value; displayEquipementsBdd(); });
    
    if (panoplieSelect) {
        const allItems = getAllEquipements();
        const panoplies = new Set();
        allItems.forEach(item => {
            if (item.panoplie && item.panoplie.nom) {
                panoplies.add(item.panoplie.nom);
            }
        });
        const sortedPanoplies = Array.from(panoplies).sort();
        sortedPanoplies.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            panoplieSelect.appendChild(option);
        });
        panoplieSelect.addEventListener('change', (e) => { currentPanoplieFilter = e.target.value; displayEquipementsBdd(); });
    }
}

function initBdd() {
    const container = document.getElementById('categoriesBdd');
    if (container) {
        container.innerHTML = '<button class="cat-btn active" data-categorie="all">📦 Tous</button>';
        const categories = getCategories();
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-btn';
            btn.setAttribute('data-categorie', cat);
            btn.textContent = `📦 ${getCategorieDisplayName(cat)}`;
            btn.onclick = () => {
                document.querySelectorAll('#categoriesBdd .cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategorie = cat;
                displayEquipementsBdd();
            };
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
            if (statSelect) statSelect.value = '';
            if (statMin) statMin.value = '';
            if (statMax) statMax.value = '';
            if (panoplieSelect) panoplieSelect.value = '';
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
        set: {},
        forgePA: forgePA,
        forgePM: forgePM,
        forgePO: forgePO,
        parchotageStats: { ...parchotageStats },
        modified: false
    };
    
    for (const slot of slotsConfig) {
        if (currentSet[slot.id]) {
            template.set[slot.id] = currentSet[slot.id];
        }
    }
    
    templates.push(template);
    saveTemplates();
    nameInput.value = '';
    showToast(`✅ Template "${name}" sauvegardé !`);
}

function updateExistingTemplate(index, newName = null) {
    const template = templates[index];
    
    template.date = new Date().toLocaleString();
    template.set = {};
    template.forgePA = forgePA;
    template.forgePM = forgePM;
    template.forgePO = forgePO;
    template.parchotageStats = { ...parchotageStats };
    template.modified = true;
    
    if (newName) {
        template.name = newName;
    }
    
    for (const slot of slotsConfig) {
        if (currentSet[slot.id]) {
            template.set[slot.id] = currentSet[slot.id];
        }
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

// Déclenchement du chargement des données depuis l'API
refreshFromDofusDB();