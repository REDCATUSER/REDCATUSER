// All distances are metres. A special is a one-way route, never a closed lap.
const REGION_LABELS = {alps:'Montagne',dakar:'Afrique / Dakar',france:'France',monte:'Monte-Carlo',usa:'États-Unis',romania:'Roumanie'};
const SURFACE_LABELS = {snow:'Neige',sand:'Sable',gravel:'Gravier',asphalt:'Asphalte',broken:'Asphalte dégradé'};
const stage = (id, name, region, surface, weather, variant, length, parTime, description) => ({id, name, region, regionLabel:REGION_LABELS[region], surface, surfaceLabel:SURFACE_LABELS[surface], weather, variant, length, parTime, description});
export const STAGES = [
  stage('alps-1', 'Col des Aiguilles', 'alps', 'snow', 'snow', 0, 3300, 188, 'Épingles enneigées, sapins et falaises. Pneus neige conseillés.'),
  stage('alps-2', 'La Combe Blanche', 'alps', 'snow', 'overcast', 1, 3550, 205, 'Longue descente alpine, neige tassée et virages aveugles.'),
  stage('alps-3', 'Sommet des Écrins', 'alps', 'snow', 'snow', 2, 3750, 220, 'Une ascension technique entre congères et garde-corps.'),
  stage('dakar-1', 'Porte du désert', 'dakar', 'sand', 'sun', 0, 3450, 180, 'Piste africaine sablonneuse, dunes et grandes courbes.'),
  stage('dakar-2', 'Les Dunes rouges', 'dakar', 'sand', 'dust', 1, 3800, 205, 'Sable profond et changements de direction entre les dunes.'),
  stage('dakar-3', 'Oued des Échos', 'dakar', 'sand', 'sun', 2, 3650, 200, 'Une piste sèche rapide qui serpente entre les rochers.'),
  stage('france-1', 'Forêt des Cévennes', 'france', 'asphalt', 'overcast', 0, 3300, 170, 'Asphalte étroit, forêt dense et enchaînements rapides.'),
  stage('france-2', 'Les Vignes du Ventoux', 'france', 'asphalt', 'rain', 1, 3500, 195, 'Routes de campagne humides, freinages et relances.'),
  stage('france-3', 'Village du Châtaignier', 'france', 'asphalt', 'sun', 2, 3700, 207, 'Traversée de village, façades en pierre puis montée entre les arbres.'),
  stage('monte-1', 'Route du Turini', 'monte', 'asphalt', 'overcast', 0, 3350, 190, 'Une spéciale inspirée des cols au-dessus de Monte-Carlo.'),
  stage('monte-2', 'Balcon de la Riviera', 'monte', 'asphalt', 'rain', 1, 3550, 207, 'Corniches sinueuses et asphalte mouillé de montagne.'),
  stage('monte-3', 'Nuit du Col', 'monte', 'asphalt', 'night', 2, 3750, 220, 'Finale nocturne : phares conseillés, précipices et épingles.'),
  stage('usa-1', 'Pine Ridge', 'usa', 'gravel', 'sun', 0, 3400, 177, 'Gravier américain et grandes forêts de conifères.'),
  stage('usa-2', 'Red Canyon', 'usa', 'gravel', 'dust', 1, 3800, 205, 'Piste rouge entre les roches, courbes et bosses.'),
  stage('usa-3', 'Cascade Pass', 'usa', 'gravel', 'rain', 2, 3700, 211, 'Finale sur gravier humide dans les montagnes du Nord-Ouest.'),
  stage('romania-1', 'Transfăgărășan', 'romania', 'broken', 'overcast', 0, 3250, 190, 'Asphalte dégradé, lacets serrés et relief des Carpates.'),
  stage('romania-2', 'Vallée des Carpates', 'romania', 'broken', 'rain', 1, 3500, 210, 'Route bosselée entre forêts et villages, prudence sous la pluie.'),
  stage('romania-3', 'Col de la Brume', 'romania', 'broken', 'fog', 2, 3550, 220, 'Une route roumaine étroite et sinueuse dans la brume.')
];
export const CARS = [
  {id:'club',name:'Horizon Club 1600',description:'La petite traction pour apprendre les spéciales. Légère, progressive et facile à placer.',power:125,mass:940,topSpeed:154,drive:'Traction',color:'#e74e35',body:'hatch',grip:1.0,acceleration:1.0},
  {id:'alpine',name:'Alpine A110 Rallye',description:'Une berlinette française légère, inspirée des premières légendes du rallye.',power:170,mass:780,topSpeed:177,drive:'Propulsion',color:'#4088d8',body:'coupe',grip:1.03,acceleration:1.12},
  {id:'escort',name:'Ford Escort RS Rallye',description:'Une sportive classique à propulsion. Un train arrière vivant pour les pistes de terre.',power:240,mass:1020,topSpeed:190,drive:'Propulsion',color:'#f1f1e8',body:'classic',grip:1.03,acceleration:1.18},
  {id:'delta',name:'Lancia Delta Integrale',description:'La compacte italienne à quatre roues motrices, agile sur les routes étroites.',power:280,mass:1180,topSpeed:202,drive:'4 roues motrices',color:'#f5f2e4',body:'hatch',grip:1.12,acceleration:1.24},
  {id:'celica',name:'Toyota Celica GT-Four',description:'Le coupé japonais à quatre roues motrices, puissant et stable à grande vitesse.',power:300,mass:1220,topSpeed:212,drive:'4 roues motrices',color:'#e9ebe6',body:'coupe',grip:1.15,acceleration:1.28},
  {id:'quattro',name:'Audi Quattro WRC',description:'La récompense ultime : une interprétation de la légende à transmission intégrale et moteur cinq cylindres.',power:420,mass:1090,topSpeed:230,drive:'4 roues motrices',color:'#eeeeea',body:'quattro',grip:1.18,acceleration:1.40}
];
export const CHAMPIONSHIPS = [
  {id:'alps',name:'Trophée des Alpes',region:'alps',subtitle:'NEIGE · MONTAGNE',description:'Trois spéciales enneigées pour maîtriser la glisse.',stageIds:['alps-1','alps-2','alps-3'],rewardCar:'alpine'},
  {id:'dakar',name:'Défi du Dakar',region:'dakar',subtitle:'SABLE · AFRIQUE',description:'Dunes, pistes africaines et sable profond.',stageIds:['dakar-1','dakar-2','dakar-3'],rewardCar:'escort'},
  {id:'france',name:'Rallye de France',region:'france',subtitle:'ASPHALTE · CÉVENNES',description:'Relances, routes étroites et météo changeante.',stageIds:['france-1','france-2','france-3'],rewardCar:'delta'},
  {id:'monte',name:'Rallye de Monte-Carlo',region:'monte',subtitle:'COLS · RIVIERA',description:'Trois spéciales de montagne jusqu’à une finale nocturne.',stageIds:['monte-1','monte-2','monte-3'],rewardCar:'celica'},
  {id:'usa',name:'Rallye des États-Unis',region:'usa',subtitle:'GRAVIER · GRANDS ESPACES',description:'Dernier défi : forêts, canyon et gravier humide.',stageIds:['usa-1','usa-2','usa-3'],rewardCar:'quattro'}
];
export const REGIONS = REGION_LABELS;
export const SURFACES = SURFACE_LABELS;
