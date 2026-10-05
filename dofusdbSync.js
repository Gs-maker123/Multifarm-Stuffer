// data/dofusdbSync.js - Synchronisation avec l'API DofusDB
// Version corrigée avec gestion des panoplies

const DOFUSDB_API_BASE = 'https://api.dofusdb.fr';
const PAGE_SIZE = 50;
const HYDRATE_CONCURRENCY = 6;
const CATALOG_CACHE_KEY = 'dofusdbCatalogCache';
const CATALOG_CACHE_VERSION = 8;
const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PANOPLIE_CATALOG_CACHE_KEY = 'dofusdbPanoplieCatalogCache';
const PANOPLIE_CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const EFFECT_ID_MAP = {
  vita: 125,
  force: 118,
  intelligence: 126,
  agilite: 119,
  chance: 123,
  prospection: 176,
  sagesse: 124,
  portee: 117,
  pa: 111,
  pm: 128,
  critique: 115,
  soin: 178,
  invocations: 182,
  tacle: 753,
  fuite: 752,
  esqPA: 160,
  esqPM: 161,
  retPA: 410,
  retPM: 412,
  puissance: 138,
  initiative: 174,
  doCri: 418,
  doPou: 414,
  dommage: 112,
  doPerArme: 1144,
  doSort: 1054,
  doMelee: 2800,
  doDist: 2804,
  doNeutre: 430,
  doTerre: 422,
  doFeu: 424,
  doEau: 426,
  doAir: 428,
  pi: 182
};

const NEGATIVE_EFFECT_ID_MAP = {
  vita: 153,
  force: 157,
  intelligence: 155,
  agilite: 154,
  chance: 152,
  prospection: 177,
  sagesse: 156,
  portee: 116,
  pa: 168,
  pm: 169,
  soin: 179,
  tacle: 755,
  fuite: 754,
  esqPA: 162,
  esqPM: 163,
  retPA: 411,
  retPM: 413,
  initiative: 175,
  critique: 171,
  puissance: 186,
  doCri: 419,
  doPou: 415,
  dommage: 145,
  doNeutre: 431,
  doTerre: 423,
  doFeu: 425,
  doEau: 427,
  doAir: 429,
  doMelee: 2801,
  doDist: 2805
};

const ADDITIONAL_EFFECT_ID_MAP = {
  doSort: 2812
};

const ADDITIONAL_NEGATIVE_EFFECT_ID_MAP = {
  doSort: 2813
};

const RESISTANCE_EFFECTS = {
  210: 'terre',
  211: 'eau',
  212: 'air',
  213: 'feu',
  214: 'neutre',
  215: 'terre',
  216: 'eau',
  217: 'air',
  218: 'feu',
  219: 'neutre',
  240: 'terre',
  241: 'eau',
  242: 'air',
  243: 'feu',
  244: 'neutre',
  245: 'neutre',
  246: 'eau',
  247: 'air',
  248: 'feu',
  249: 'neutre',
  2802: 'melee',
  2803: 'melee',
  2806: 'dist',
  2807: 'dist',
  420: 'cri',
  421: 'cri'
};

const NEGATIVE_RESISTANCE_EFFECT_IDS = new Set([215, 216, 217, 218, 219, 245, 246, 247, 248, 249, 2802, 2806, 421]);

const CATEGORY_TYPE_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  16, 17, 18, 19, 22, 23, 24, 25, 26, 27,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
  71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
  91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  101, 102, 103, 104, 105, 106, 107, 108, 109,
  110, 111, 112, 113, 114, 115, 116, 117, 118,
  119, 120, 121, 122, 123, 124, 125, 126, 127,
  128, 129, 130, 131, 132, 133, 134, 135, 136,
  137, 138, 139, 140, 141, 142, 143, 144, 145,
  146, 147, 148, 149, 150, 151, 152, 153, 154,
  155, 156, 157, 158, 159, 160, 161, 162, 163,
  164, 165, 166, 167, 168, 169, 170, 171, 172,
  173, 174, 175, 176, 177, 178, 179, 180, 181,
  182, 183, 184, 185, 186, 187, 188, 189, 190,
  191, 192, 193, 194, 195, 196, 197, 198, 199
];

function normalizeEffectValue(effect) {
  if (!effect) {
    return 0;
  }
  if (effect.to !== undefined && effect.to !== 0) {
    return effect.to;
  }
  return effect.from || 0;
}

function getEffect(effects, effectId) {
  return effects.find(effect => effect.effectId === effectId);
}

function normalizeName(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getLocalizedText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value?.fr) {
    return value.fr;
  }
  if (value?.en) {
    return value.en;
  }
  if (typeof value === 'object' && value !== null) {
    const firstValue = Object.values(value).find(item => typeof item === 'string' && item.length > 0);
    return firstValue || '';
  }
  return '';
}

/**
 * Extrait les informations de panoplie d'un équipement
 */
function extractPanoplieInfo(remoteItem) {
  // Vérifier si l'item a une panoplie directement
  if (remoteItem.panoplie) {
    if (typeof remoteItem.panoplie === 'object') {
      const id = remoteItem.panoplie.id || (remoteItem.itemSetId > 0 ? remoteItem.itemSetId : undefined);
      return {
        id,
        nom: getLocalizedText(remoteItem.panoplie.nom) || (id ? `Panoplie #${id}` : null),
        bonus: remoteItem.panoplie.bonus
      };
    }
    if (typeof remoteItem.panoplie === 'number') {
      return {
        id: remoteItem.panoplie,
        nom: null
      };
    }
  }

  if (Number(remoteItem.itemSetId) > 0) {
    return {
      id: Number(remoteItem.itemSetId),
      nom: `Panoplie #${remoteItem.itemSetId}`
    };
  }
  
  // Vérifier dans les ancestors
  if (remoteItem.ancestors && Array.isArray(remoteItem.ancestors)) {
    const panoplieAncestor = remoteItem.ancestors.find(a => a.type === "panoplie");
    if (panoplieAncestor) {
      return {
        id: panoplieAncestor.id,
        nom: getLocalizedText(panoplieAncestor.name) || getLocalizedText(panoplieAncestor.nom) || `Panoplie #${panoplieAncestor.id}`
      };
    }
  }
  
  return null;
}

function getCategoryForRemoteItem(remoteItem) {
  const names = [
    getLocalizedText(remoteItem?.type?.name),
    getLocalizedText(remoteItem?.superType?.name),
    getLocalizedText(remoteItem?.type),
    getLocalizedText(remoteItem?.superType),
    getLocalizedText(remoteItem?.name)
  ].filter(Boolean).map(normalizeName);

  const joined = names.join(' ');
  
  // Vérification spécifique pour le trophée Arcaniste
  // L'ID de l'item Arcaniste (à vérifier, c'est un exemple)
  if (remoteItem.id === 19117 || remoteItem.nom?.toLowerCase().includes('arcaniste')) {
    return 'trophees';
  }

  if (joined.includes('amulette')) return 'amulettes';
  if (joined.includes('anneau')) return 'anneaux';
  if (joined.includes('bouclier')) return 'boucliers';
  if (joined.includes('bottes')) return 'bottes';
  if (joined.includes('cape')) return 'capes';
  if (joined.includes('ceinture')) return 'ceintures';
  if (joined.includes('coiffe') || joined.includes('casque') || joined.includes('chapeau')) return 'coiffes';
  if (joined.includes('arc')) return 'arcs';
  if (joined.includes('baguette')) return 'baguettes';
  if (joined.includes('baton')) return 'batons';
  if (joined.includes('dague')) return 'dagues';
  if (joined.includes('dofus')) return 'dofus';
  if (joined.includes('familier')) return 'familiers';
  if (joined.includes('faux')) return 'faux';
  if (joined.includes('hache')) return 'haches';
  if (joined.includes('lance')) return 'lances';
  if (joined.includes('marteau')) return 'marteaux';
  if (joined.includes('pelle')) return 'pelles';
  if (joined.includes('epée') || joined.includes('epee')) return 'epees';
  if (joined.includes('trophee') || joined.includes('trophée')) return 'trophees';
  if (joined.includes('montilier')) return 'montiliers';
  if (joined.includes('muldo')) return 'muldos';
  if (joined.includes('dragodinde')) return 'dragodindes';
  if (joined.includes('volkorne')) return 'volkornes';

  // Les armes sont classées dans "ressource"
  if (joined.includes('arme') || joined.includes('arc') || joined.includes('baguette') || 
      joined.includes('baton') || joined.includes('dague') || joined.includes('faux') ||
      joined.includes('hache') || joined.includes('lance') || joined.includes('marteau') ||
      joined.includes('pelle') || joined.includes('epee') || joined.includes('epée')) {
    return 'ressource';
  }
  
  return 'ressource';
}

function buildStatsFromRemoteItem(remoteItem) {
  const effects = remoteItem.effects || [];
  const stats = {
    vita: 0,
    initiative: 0,
    prospection: 0,
    sagesse: 0,
    pa: 0,
    pm: 0,
    portee: 0,
    critique: 0,
    soin: 0,
    invocations: 0,
    tacle: 0,
    fuite: 0,
    esqPA: 0,
    esqPM: 0,
    retPA: 0,
    retPM: 0,
    pi: 0,
    doNeutre: 0,
    doTerre: 0,
    doFeu: 0,
    doEau: 0,
    doAir: 0,
    dommage: 0,
    doCri: 0,
    doPou: 0,
    doPerArme: 0,
    doSort: 0,
    doMelee: 0,
    doDist: 0,
    caracteristiques: {
      force: 0,
      intelligence: 0,
      chance: 0,
      agilite: 0,
      puissance: 0
    },
    resistance: {
      neutre: 0,
      terre: 0,
      feu: 0,
      eau: 0,
      air: 0,
      cri: 0,
      melee: 0,
      armes: 0,
      pou: 0,
      dist: 0
    }
  };

  // Mapper chaque effet connu
  Object.entries(EFFECT_ID_MAP).forEach(([key, effectId]) => {
    const effect = getEffect(effects, effectId);
    const negativeEffect = NEGATIVE_EFFECT_ID_MAP[key]
      ? getEffect(effects, NEGATIVE_EFFECT_ID_MAP[key])
      : null;
    if (!effect && !negativeEffect) return;
    const value = (effect ? normalizeEffectValue(effect) : 0)
      - (negativeEffect ? Math.abs(normalizeEffectValue(negativeEffect)) : 0);
    
    if (key === 'force' || key === 'intelligence' || key === 'chance' || key === 'agilite' || key === 'puissance') {
      stats.caracteristiques[key] = value;
    } else if (key === 'doNeutre' || key === 'doTerre' || key === 'doFeu' || key === 'doEau' || key === 'doAir') {
      stats[key] = value;
    } else if (key === 'doCri' || key === 'doPou' || key === 'dommage' || key === 'doPerArme' || key === 'doSort' || key === 'doMelee' || key === 'doDist') {
      stats[key] = value;
    } else if (key === 'pi') {
      stats[key] = value;
    } else if (stats[key] !== undefined) {
      stats[key] = value;
    }
  });

  Object.entries(ADDITIONAL_EFFECT_ID_MAP).forEach(([key, effectId]) => {
    const effect = getEffect(effects, effectId);
    const negativeEffect = getEffect(effects, ADDITIONAL_NEGATIVE_EFFECT_ID_MAP[key]);
    stats[key] += (effect ? normalizeEffectValue(effect) : 0)
      - (negativeEffect ? Math.abs(normalizeEffectValue(negativeEffect)) : 0);
  });

  // Résistances
  Object.entries(RESISTANCE_EFFECTS).forEach(([effectId, key]) => {
    const effect = getEffect(effects, Number(effectId));
    if (!effect) return;
    const rawValue = normalizeEffectValue(effect);
    const value = NEGATIVE_RESISTANCE_EFFECT_IDS.has(Number(effectId))
      ? -Math.abs(rawValue)
      : rawValue;
    if (stats.resistance[key] !== undefined) {
      stats.resistance[key] += value;
    }
  });

  return stats;
}

function getLocalizedName(remoteItem) {
  if (typeof remoteItem.name === 'string') {
    return remoteItem.name;
  }
  if (remoteItem.name?.fr) {
    return remoteItem.name.fr;
  }
  if (remoteItem.name?.en) {
    return remoteItem.name.en;
  }
  if (remoteItem.localizedName) {
    return remoteItem.localizedName;
  }
  if (remoteItem.nom) {
    return remoteItem.nom;
  }
  return `Item ${remoteItem.iconId || remoteItem.id}`;
}

function buildLocalItem(remoteItem) {
  const categorie = getCategoryForRemoteItem(remoteItem);
  const iconId = Number(remoteItem.iconId || remoteItem.id || 0);
  const generatedId = remoteItem.generatedId ?? iconId;

  const localItem = {
    id: generatedId,
    imageId: iconId,
    dofusdbId: remoteItem.id,
    hasRecipe: Boolean(remoteItem.hasRecipe),
    nom: getLocalizedName(remoteItem),
    categorie,
    level: remoteItem.level || 1,
    image: remoteItem.img || `assets/images/equipements/${categorie}/${iconId}.png`,
    valeurK: remoteItem.price || remoteItem.value || 0,
    stats: buildStatsFromRemoteItem(remoteItem),
    conditions: {
      level: remoteItem.level || 1,
      classe: remoteItem.classRequirement || remoteItem.conditions?.classe || null
    },
    craft: {
      metier: remoteItem.craft?.metier || remoteItem.craft?.name || 'Inconnu',
      niveau: remoteItem.craft?.niveau || remoteItem.craft?.level || remoteItem.level || 1
    }
  };

  // Ajouter les infos de panoplie si disponibles
  const panoplieInfo = extractPanoplieInfo(remoteItem);
  if (panoplieInfo) {
    localItem.panoplie = panoplieInfo;
  }

  return localItem;
}

function loadCatalogCache() {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed.version !== CATALOG_CACHE_VERSION) {
      return null;
    }

    if (Date.now() - parsed.timestamp > CATALOG_CACHE_TTL_MS) {
      return null;
    }

    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

function saveCatalogCache(items) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      timestamp: Date.now(),
      items: items || []
    }));
  } catch {
    // Ignorer les erreurs de quota/stockage
  }
}

function hydrateRegistryFromItems(equipementsData, items) {
  Object.keys(equipementsData).forEach((key) => {
    if (Array.isArray(equipementsData[key])) {
      equipementsData[key].length = 0;
    }
  });

  items.forEach((item) => {
    if (!item || !Array.isArray(equipementsData[item.categorie])) {
      return;
    }
    equipementsData[item.categorie].push(item);
  });
}

async function fetchItemsForType(typeId, skip = 0) {
  const url = `${DOFUSDB_API_BASE}/items?typeId=${typeId}&$limit=${PAGE_SIZE}&$skip=${skip}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DofusDB fetch failed for type ${typeId}: ${response.status}`);
  }

  const payload = await response.json();
  return payload || { data: [], total: 0 };
}

async function hydrateType(typeId) {
  let skip = 0;
  const collected = [];

  while (true) {
    const payload = await fetchItemsForType(typeId, skip);
    const items = payload?.data || [];
    const total = payload?.total ?? items.length;

    if (!items.length) break;

    collected.push(...items.filter(Boolean));

    if (skip + items.length >= total) break;
    skip += items.length;
  }

  return collected;
}

async function hydrateTypesInParallel(typeIds) {
  const results = [];
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(HYDRATE_CONCURRENCY, typeIds.length) }, async () => {
    while (nextIndex < typeIds.length) {
      const currentTypeId = typeIds[nextIndex++];
      const items = await hydrateType(currentTypeId);
      results.push(...items);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Calcule les bonus de panoplies pour un set d'équipements donné
 * @param {Object} currentSet - L'objet contenant les équipements équipés par slot
 * @returns {Object} - Les bonus totaux des panoplies
 */
export async function calculateSetPanoplieBonuses(currentSet) {
  const panoplieCounts = new Map();
  
  // Compter les équipements par panoplie
  for (const slotId in currentSet) {
    const item = currentSet[slotId];
    if (item && item.panoplie && item.panoplie.id) {
      const panoplieId = item.panoplie.id;
      if (!panoplieCounts.has(panoplieId)) {
        panoplieCounts.set(panoplieId, {
          count: 0,
          name: item.panoplie.nom || `Panoplie #${panoplieId}`
        });
      }
      panoplieCounts.get(panoplieId).count++;
    }
  }
  
  // Note: L'API DofusDB ne fournit pas facilement les bonus de panoplies
  // Pour l'instant, on retourne des bonus vides
  // Dans le futur, on pourrait charger un fichier JSON local avec les bonus
  
  if (panoplieCounts.size > 0) {
    console.log('Panoplies détectées:', Array.from(panoplieCounts.entries()).map(([id, data]) => 
      `${data.name} (${data.count} pièces)`
    ).join(', '));
  }
  
  return {
    stats: {},
    caracteristiques: {},
    resistance: {}
  };
}

export async function hydrateAllEquipementsFromDofusDB(targetEquipementsData = null) {
  const equipementsData = targetEquipementsData ?? (await import('./index.js')).equipementsData;
  const cachedItems = loadCatalogCache();

  if (cachedItems?.length) {
    hydrateRegistryFromItems(equipementsData, cachedItems);
    console.log(`✅ ${cachedItems.length} équipements chargés depuis le cache`);
    return Object.values(equipementsData).flat();
  }

  console.log('🔄 Synchronisation avec DofusDB...');
  const remoteItems = await hydrateTypesInParallel(CATEGORY_TYPE_IDS);
  console.log(`📦 ${remoteItems.length} équipements récupérés depuis l'API`);

  const imageCounts = new Map();
  remoteItems.forEach((item) => {
    const imageId = Number(item?.iconId || item?.id || 0);
    if (!imageId) {
      return;
    }
    imageCounts.set(imageId, (imageCounts.get(imageId) || 0) + 1);
  });

  const itemsToKeep = remoteItems
    .filter(item => item && (item.iconId || item.id))
    .map((item) => {
      const imageId = Number(item.iconId || item.id || 0);
      const generatedId = (imageCounts.get(imageId) || 0) > 1 ? Number(`${imageId}${item.id}`) : imageId;

      return buildLocalItem({
        ...item,
        generatedId
      });
    })
    .filter(item => item.id !== undefined && item.id !== null);

  const panoplieCount = itemsToKeep.filter(item => item.panoplie).length;
  console.log(`📦 Équipements avec panoplie: ${panoplieCount}`);

  hydrateRegistryFromItems(equipementsData, itemsToKeep);
  saveCatalogCache(itemsToKeep);

  console.log(`✅ Synchronisation terminée : ${itemsToKeep.length} équipements mis à jour`);
  return Object.values(equipementsData).flat();
}

export async function hydrateCoiffesFromDofusDB(targetEquipementsData = null) {
  return hydrateAllEquipementsFromDofusDB(targetEquipementsData);
}

// ==================== PANOPLIES BONUS ====================

// Cache des bonus de panoplies
let panoplieBonusesCache = new Map();
let effectDescriptionsCache = new Map();
let itemRecipesCache = new Map();
let panoplieCatalogRequest = null;

/**
 * Récupère les bonus d'une panoplie depuis l'API
 */
async function fetchPanoplieBonus(panoplieId) {
    if (panoplieBonusesCache.has(panoplieId)) {
        return panoplieBonusesCache.get(panoplieId);
    }
    
    try {
        const response = await fetch(`${DOFUSDB_API_BASE}/item-sets/${panoplieId}?lang=fr`);
        if (!response.ok) {
          panoplieBonusesCache.set(panoplieId, null);
          return null;
        }
        const data = await response.json();
        panoplieBonusesCache.set(panoplieId, data);
        return data;
    } catch (error) {
        console.warn(`Erreur chargement panoplie ${panoplieId}:`, error);
        return null;
    }
}

  export async function getPanoplieItems(panoplieId) {
    const data = await fetchPanoplieBonus(panoplieId);
    if (!data) return null;

    return {
      name: getLocalizedText(data.name) || `Panoplie #${panoplieId}`,
      items: (data.items || []).map(item => ({
        id: item.id,
        name: getLocalizedText(item.name) || `Item #${item.id}`,
        level: item.level || 0,
        image: item.img || (item.iconId ? `${DOFUSDB_API_BASE}/img/items/${item.iconId}.png` : '')
      }))
    };
  }

    export async function getPanoplieCatalog() {
      if (panoplieCatalogRequest) return panoplieCatalogRequest;

      panoplieCatalogRequest = (async () => {
        try {
          const cached = JSON.parse(localStorage.getItem(PANOPLIE_CATALOG_CACHE_KEY) || 'null');
          if (cached?.sets?.length && Date.now() - cached.timestamp < PANOPLIE_CATALOG_CACHE_TTL_MS) {
            return cached.sets;
          }
        } catch {
          // Ignore invalid local cache and fetch a fresh catalog.
        }

        const pageSize = 50;
        const fetchPage = async (skip) => {
          const params = new URLSearchParams([
            ['$limit', String(pageSize)],
            ['$skip', String(skip)],
            ['$select[]', 'id'],
            ['$select[]', 'name'],
            ['lang', 'fr']
          ]);
          const response = await fetch(`${DOFUSDB_API_BASE}/item-sets?${params}`);
          if (!response.ok) throw new Error(`DofusDB item-sets failed: ${response.status}`);
          return response.json();
        };

        try {
          const firstPage = await fetchPage(0);
          const offsets = Array.from(
            { length: Math.ceil(firstPage.total / pageSize) - 1 },
            (_, index) => (index + 1) * pageSize
          );
          const pages = [firstPage];
          let nextPage = 0;
          await Promise.all(Array.from({ length: Math.min(4, offsets.length) }, async () => {
            while (nextPage < offsets.length) {
              const offset = offsets[nextPage++];
              pages.push(await fetchPage(offset));
            }
          }));

          const sets = pages.flatMap(page => page.data || [])
            .map(set => ({ id: set.id, name: getLocalizedText(set.name) || `Panoplie #${set.id}` }))
            .filter(set => Number(set.id) > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

          localStorage.setItem(PANOPLIE_CATALOG_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), sets }));
          return sets;
        } finally {
          panoplieCatalogRequest = null;
        }
      })();

      return panoplieCatalogRequest;
    }

  async function fetchEffectDescription(effectId) {
    if (effectDescriptionsCache.has(effectId)) {
      return effectDescriptionsCache.get(effectId);
    }

    const request = (async () => {
      try {
        const response = await fetch(`${DOFUSDB_API_BASE}/effects/${effectId}?lang=fr`);
        if (!response.ok) return '';
        const data = await response.json();
        return getLocalizedText(data.description);
      } catch (error) {
        console.warn(`Erreur chargement effet ${effectId}:`, error);
        return '';
      }
    })();
    effectDescriptionsCache.set(effectId, request);
    return request;
  }

  export async function getItemRecipeDetails(itemId) {
    if (itemRecipesCache.has(itemId)) {
      return itemRecipesCache.get(itemId);
    }

    const request = (async () => {
      try {
        const response = await fetch(`${DOFUSDB_API_BASE}/recipes/${itemId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return {
          itemName: getLocalizedText(data.result?.name),
          job: getLocalizedText(data.job?.name) || 'Métier inconnu',
          level: data.resultLevel || data.result?.level || 0,
          ingredients: (data.ingredients || []).map((ingredient, index) => ({
            name: getLocalizedText(ingredient.name) || `Ressource ${ingredient.id}`,
            image: ingredient.img || (ingredient.iconId ? `${DOFUSDB_API_BASE}/img/items/${ingredient.iconId}.png` : ''),
            quantity: data.quantities?.[index] || 1
          }))
        };
      } catch (error) {
        console.warn(`Erreur chargement recette de l'item ${itemId}:`, error);
        return null;
      }
    })();

    itemRecipesCache.set(itemId, request);
    return request;
  }

  function formatPanoplieEffect(description, effect) {
    const from = effect.from ?? effect.value ?? 0;
    const to = effect.to ?? 0;
    const value = to && to !== from ? `${from} à ${to}` : String(from);
    const pluralValue = Number(to || from);
    const template = description || `Effet #${effect.effectId}`;
    return template
      .replace(/#1\{\{[\s\S]*?\}\}#2/g, value)
      .replace(/#1/g, String(from))
      .replace(/#2/g, String(to || from))
      .replace(/\{\{~ps\}\}/g, pluralValue > 1 ? 's' : '')
      .replace(/\{\{~zs\}\}/g, '')
      .replace(/\{\{~[^}]*\}\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  export async function getPanoplieBonusDetails(panoplieId) {
    const data = await fetchPanoplieBonus(panoplieId);
    if (!data) return null;

    const tiers = Array.isArray(data.effects)
      ? data.effects
        .map((effects, index) => ({ pieces: index + 1, effects }))
        .filter(tier => tier.pieces >= 2 && tier.effects?.length)
      : (data.bonus || []).map(tier => ({ pieces: tier.amount, effects: tier.effects || [] }));

    const bonuses = await Promise.all(tiers.map(async tier => ({
      pieces: tier.pieces,
      effects: await Promise.all(tier.effects.map(async effect => {
        const description = effect.effectId ? await fetchEffectDescription(effect.effectId) : '';
        return formatPanoplieEffect(description, effect);
      }))
    })));

    return {
      name: getLocalizedText(data.name) || `Panoplie #${panoplieId}`,
      bonuses
    };
  }

/**
 * Calcule les bonus de panoplies pour un set d'équipements
 */
export async function calculatePanoplieBonuses(currentSet, slotsConfig) {
    const panoplieCounts = new Map();
    
    // Compter les pièces par panoplie
    for (const slot of slotsConfig) {
        const item = currentSet[slot.id];
        if (item && item.panoplie && item.panoplie.id) {
            const panoplieId = item.panoplie.id;
            panoplieCounts.set(panoplieId, (panoplieCounts.get(panoplieId) || 0) + 1);
        }
    }
    
    const totalBonuses = {
        stats: {},
        caracteristiques: {},
        resistance: {}
    };
    
    // Seul le palier le plus élevé atteint s'applique pour chaque panoplie.
    for (const [panoplieId, count] of panoplieCounts) {
        if (count >= 2) {
            const panoplieData = await fetchPanoplieBonus(panoplieId);
        const tiers = Array.isArray(panoplieData?.effects)
          ? panoplieData.effects.map((effects, index) => ({ amount: index + 1, effects }))
          : (panoplieData?.bonus || []);
        const applicableTier = tiers
          .filter(tier => (tier.amount || 0) <= count && tier.effects?.length)
          .at(-1);
        if (applicableTier) {
          for (const effect of applicableTier.effects) {
            applyBonusEffect(totalBonuses, effect);
          }
            }
        }
    }
    
    return totalBonuses;
}

function applyBonusEffect(bonuses, effect) {
    const effectName = effect.effectName || effect.name || '';
  const rawValue = Number(effect.value ?? (effect.to && effect.to !== 0 ? effect.to : effect.from) ?? 0);
  const negativeEffectIds = new Set([145, 186, 215, 216, 217, 218, 219, 245, 246, 247, 248, 249, 2802, 2806, 2813, 419, 421, 423, 425, 427, 429, 431, 2801, 2805]);
  const value = negativeEffectIds.has(effect.effectId) ? -Math.abs(rawValue) : rawValue;

  const effectIdMapping = {
    125: { type: 'stats', field: 'vita' },
    118: { type: 'caracteristiques', field: 'force' },
    126: { type: 'caracteristiques', field: 'intelligence' },
    119: { type: 'caracteristiques', field: 'agilite' },
    120: { type: 'caracteristiques', field: 'chance' },
    176: { type: 'stats', field: 'prospection' },
    124: { type: 'stats', field: 'sagesse' },
    117: { type: 'stats', field: 'portee' },
    111: { type: 'stats', field: 'pa' },
    128: { type: 'stats', field: 'pm' },
    115: { type: 'stats', field: 'critique' },
    112: { type: 'stats', field: 'dommage' },
    178: { type: 'stats', field: 'soin' },
    753: { type: 'stats', field: 'tacle' },
    752: { type: 'stats', field: 'fuite' },
    761: { type: 'stats', field: 'fuite' },
    160: { type: 'stats', field: 'esqPA' },
    163: { type: 'stats', field: 'esqPM' },
    410: { type: 'stats', field: 'retPA' },
    411: { type: 'stats', field: 'retPM' },
    138: { type: 'caracteristiques', field: 'puissance' },
    186: { type: 'caracteristiques', field: 'puissance' },
    418: { type: 'stats', field: 'doCri' },
    419: { type: 'stats', field: 'doCri' },
    79: { type: 'stats', field: 'doPou' },
    112: { type: 'stats', field: 'dommage' },
    145: { type: 'stats', field: 'dommage' },
    1144: { type: 'stats', field: 'doPerArme' },
    1054: { type: 'stats', field: 'doSort' },
    2812: { type: 'stats', field: 'doSort' },
    2813: { type: 'stats', field: 'doSort' },
    2800: { type: 'stats', field: 'doMelee' },
    2801: { type: 'stats', field: 'doMelee' },
    2804: { type: 'stats', field: 'doDist' },
    2805: { type: 'stats', field: 'doDist' },
    430: { type: 'stats', field: 'doNeutre' },
    431: { type: 'stats', field: 'doNeutre' },
    422: { type: 'stats', field: 'doTerre' },
    423: { type: 'stats', field: 'doTerre' },
    424: { type: 'stats', field: 'doFeu' },
    425: { type: 'stats', field: 'doFeu' },
    426: { type: 'stats', field: 'doEau' },
    427: { type: 'stats', field: 'doEau' },
    428: { type: 'stats', field: 'doAir' },
    429: { type: 'stats', field: 'doAir' },
    210: { type: 'resistance', field: 'terre' },
    215: { type: 'resistance', field: 'terre' },
    211: { type: 'resistance', field: 'eau' },
    216: { type: 'resistance', field: 'eau' },
    212: { type: 'resistance', field: 'air' },
    217: { type: 'resistance', field: 'air' },
    213: { type: 'resistance', field: 'feu' },
    218: { type: 'resistance', field: 'feu' },
    214: { type: 'resistance', field: 'neutre' },
    219: { type: 'resistance', field: 'neutre' },
    240: { type: 'resistance', field: 'terre' },
    245: { type: 'resistance', field: 'terre' },
    241: { type: 'resistance', field: 'eau' },
    246: { type: 'resistance', field: 'eau' },
    242: { type: 'resistance', field: 'air' },
    247: { type: 'resistance', field: 'air' },
    243: { type: 'resistance', field: 'feu' },
    248: { type: 'resistance', field: 'feu' },
    244: { type: 'resistance', field: 'neutre' },
    249: { type: 'resistance', field: 'neutre' },
    420: { type: 'resistance', field: 'cri' },
    421: { type: 'resistance', field: 'cri' },
    2802: { type: 'resistance', field: 'melee' },
    2803: { type: 'resistance', field: 'melee' },
    2806: { type: 'resistance', field: 'dist' },
    2807: { type: 'resistance', field: 'dist' }
  };
    
    const mapping = {
        'Vitalité': { type: 'stats', field: 'vita' },
        'Vitalite': { type: 'stats', field: 'vita' },
        'Force': { type: 'caracteristiques', field: 'force' },
        'Intelligence': { type: 'caracteristiques', field: 'intelligence' },
        'Chance': { type: 'caracteristiques', field: 'chance' },
        'Agilité': { type: 'caracteristiques', field: 'agilite' },
        'Agilite': { type: 'caracteristiques', field: 'agilite' },
        'Sagesse': { type: 'stats', field: 'sagesse' },
        'PA': { type: 'stats', field: 'pa' },
        'PM': { type: 'stats', field: 'pm' },
        'Portée': { type: 'stats', field: 'portee' },
        'Portee': { type: 'stats', field: 'portee' },
        'Prospection': { type: 'stats', field: 'prospection' },
        'Initiative': { type: 'stats', field: 'initiative' },
        'Dommages': { type: 'stats', field: 'dommage' },
        'Dommage': { type: 'stats', field: 'dommage' },
        'Résistance Neutre': { type: 'resistance', field: 'neutre' },
        'Résistance Terre': { type: 'resistance', field: 'terre' },
        'Résistance Feu': { type: 'resistance', field: 'feu' },
        'Résistance Eau': { type: 'resistance', field: 'eau' },
        'Résistance Air': { type: 'resistance', field: 'air' }
    };
    
    let map = effectIdMapping[effect.effectId] || mapping[effectName];
    if (!map && RESISTANCE_EFFECTS[effect.effectId]) {
      map = { type: 'resistance', field: RESISTANCE_EFFECTS[effect.effectId] };
    }
    if (!map) {
        // Chercher par correspondance approximative
        const lowerName = effectName.toLowerCase();
        for (const [key, value] of Object.entries(mapping)) {
            if (key.toLowerCase() === lowerName) {
                map = value;
                break;
            }
        }
    }
    
    if (map) {
        if (!bonuses[map.type][map.field]) bonuses[map.type][map.field] = 0;
        bonuses[map.type][map.field] += value;
    }
}

// Exporter les fonctions supplémentaires
export { extractPanoplieInfo, getLocalizedName, buildStatsFromRemoteItem };
