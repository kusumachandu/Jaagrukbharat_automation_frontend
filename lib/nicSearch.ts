import data from "./nic-2008.json";

// Plain-words search over the official NIC-2008 list (data built by automation-os-prod/scripts/build-nic-data.js).
// A small business owner types what they do ("tailoring", "kirana shop", "mobile repair"); the best sub-classes come
// back, each carrying the 2-, 4- and 5-digit codes the Udyam portal asks for.

export interface NicHit {
  code: string; // 5-digit sub-class
  name: string;
  division: string; // 2-digit
  classCode: string; // 4-digit
  className: string;
  divisionName: string;
  score: number;
}

interface Entry {
  code: string;
  name: string;
  division: string;
  classCode: string;
  className: string;
  divisionName: string;
  nameTokens: Set<string>;
  classTokens: Set<string>;
  upperTokens: Set<string>;
  phrase: string;
}

const STOP = new Set([
  "a", "an", "and", "the", "of", "in", "my", "i", "do", "does", "we", "our", "is", "are", "to", "for", "work", "works", "working",
  "business", "shop", "shops", "store", "stores", "service", "services", "doing", "run", "running", "have", "own", "small", "little",
  "class", "classes", "dukan", "mart", "making", "selling", "sell", "sale", "unit", "work", "job",
]);

// Words people use that the official wording does not. Each maps to words that DO appear in the NIC text.
const ALIASES: Record<string, string[]> = {
  kirana: ["retail", "food", "non-specialized", "provision"],
  grocery: ["retail", "food", "cereals", "pulses", "non-specialized"],
  provision: ["retail", "food", "non-specialized"],
  general: ["non-specialized"],
  supermarket: ["non-specialized"],
  tailor: ["tailoring", "garments"],
  tailoring: ["tailoring", "garments", "apparel"],
  boutique: ["tailoring", "garments", "apparel"],
  stitching: ["tailoring", "garments"],
  readymade: ["garments", "clothing"],
  clothes: ["clothing", "garments", "apparel"],
  garment: ["garments", "apparel"],
  saree: ["textiles", "garments"],
  salon: ["hairdressing", "beauty"],
  parlour: ["hairdressing", "beauty"],
  parlor: ["hairdressing", "beauty"],
  barber: ["hairdressing"],
  beauty: ["hairdressing", "beauty"],
  mobile: ["telecommunication", "communication", "phones"],
  phone: ["telecommunication", "communication", "phones"],
  laptop: ["computers"],
  computer: ["computers"],
  cybercafe: ["cyber", "internet"],
  xerox: ["photocopying"],
  photocopy: ["photocopying"],
  photo: ["photographic"],
  photography: ["photographic"],
  studio: ["photographic"],
  restaurant: ["restaurants", "food"],
  hotel: ["restaurants", "accommodation", "lodging"],
  dhaba: ["restaurants"],
  canteen: ["canteens", "food"],
  tea: ["tea", "beverage"],
  juice: ["juice", "beverage"],
  catering: ["catering"],
  bakery: ["bakery", "bread", "cakes"],
  sweets: ["sweetmeats", "confectionery"],
  pharmacy: ["pharmaceuticals", "medical"],
  medical: ["pharmaceuticals", "medical"],
  chemist: ["pharmaceuticals"],
  clinic: ["medical", "practice"],
  doctor: ["medical", "practice"],
  hospital: ["hospital"],
  tuition: ["education", "tutoring"],
  coaching: ["education", "tutoring", "examination"],
  school: ["education"],
  teacher: ["education", "tutoring"],
  software: ["software", "computer", "programming", "program"],
  development: ["programming", "computer", "program"],
  app: ["software", "computer", "program"],
  truck: ["freight", "road", "motorised"],
  electrician: ["electrical", "installation", "wiring"],
  it: ["computer", "programming"],
  website: ["web", "design"],
  printing: ["printing"],
  press: ["printing"],
  flex: ["printing"],
  jewellery: ["jewellery"],
  jewelry: ["jewellery"],
  goldsmith: ["jewellery", "gold"],
  furniture: ["furniture"],
  carpenter: ["wood", "carpentry", "joinery"],
  carpentry: ["wood", "carpentry", "joinery"],
  welding: ["metal", "welding", "fabricated"],
  fabrication: ["fabricated", "metal"],
  plumber: ["plumbing", "installation"],
  plumbing: ["plumbing", "installation"],
  painter: ["painting"],
  construction: ["construction", "buildings"],
  contractor: ["construction"],
  builder: ["construction", "buildings"],
  mason: ["construction"],
  transport: ["transport", "freight", "passenger"],
  lorry: ["freight", "road", "transport"],
  taxi: ["taxi"],
  cab: ["taxi"],
  auto: ["motor", "vehicles"],
  car: ["motor", "vehicles"],
  bike: ["motorcycles"],
  motorcycle: ["motorcycles"],
  garage: ["repair", "motor", "vehicles"],
  mechanic: ["repair", "maintenance"],
  repair: ["repair", "maintenance"],
  tractor: ["tractors", "agricultural"],
  farming: ["growing", "crop", "agriculture"],
  farm: ["growing", "crop", "agriculture"],
  agriculture: ["growing", "crop", "agriculture"],
  vegetables: ["vegetables"],
  fruits: ["fruit"],
  dairy: ["dairy", "milk"],
  milk: ["milk", "dairy"],
  poultry: ["poultry"],
  chicken: ["poultry", "meat"],
  fish: ["fish"],
  goat: ["sheep", "goats"],
  cow: ["cattle"],
  flour: ["flour", "milling"],
  atta: ["flour", "milling"],
  rice: ["rice"],
  oil: ["oil", "oils"],
  mill: ["milling"],
  agarbatti: ["agarbatti"],
  soap: ["soap"],
  plastic: ["plastics"],
  paper: ["paper"],
  bricks: ["bricks"],
  cement: ["cement"],
  tiles: ["tiles"],
  stone: ["stone"],
  sand: ["sand"],
  water: ["water"],
  laundry: ["washing", "cleaning"],
  dryclean: ["washing", "cleaning"],
  cleaning: ["cleaning"],
  security: ["security"],
  travel: ["travel", "tour"],
  tour: ["tour", "travel"],
  event: ["event", "organization"],
  decoration: ["decorators", "interior"],
  interior: ["interior", "decorators"],
  advertising: ["advertising"],
  insurance: ["insurance"],
  accounting: ["accounting", "bookkeeping"],
  ca: ["accounting", "bookkeeping", "tax"],
  lawyer: ["legal"],
  advocate: ["legal"],
  courier: ["courier"],
  warehouse: ["warehousing", "storage"],
  godown: ["warehousing", "storage"],
  petrol: ["automotive", "fuel"],
  gas: ["gas"],
  cylinder: ["gas", "bottled"],
  stationery: ["stationery"],
  books: ["books"],
  toys: ["toys"],
  gift: ["souvenirs", "gifts"],
  flowers: ["flowers"],
  pets: ["pet"],
  footwear: ["footwear"],
  shoes: ["footwear"],
  chappal: ["footwear"],
  bags: ["bags", "luggage"],
  leather: ["leather"],
  online: ["e-commerce", "internet"],
  ecommerce: ["e-commerce", "internet"],
  wholesale: ["wholesale"],
  trading: ["wholesale", "retail"],
  retail: ["retail"],
  gym: ["sports", "recreation"],
  yoga: ["sports", "recreation"],
  cinema: ["motion", "picture"],
  recording: ["sound", "recording"],
};

const stem = (w: string) => {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
};
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\- ]+/g, " ")
    .split(/[\s]+/)
    .filter(Boolean)
    .map(stem);

type Raw = { divisions: Record<string, string>; groups: Record<string, string>; classes: Record<string, string>; subclasses: { code: string; name: string }[] };
const raw = data as unknown as Raw;

let index: Entry[] | null = null;
function build(): Entry[] {
  if (index) return index;
  index = raw.subclasses.map((s) => {
    const classCode = s.code.slice(0, 4);
    const division = s.code.slice(0, 2);
    const className = raw.classes[classCode] ?? "";
    const divisionName = raw.divisions[division] ?? "";
    return {
      code: s.code,
      name: s.name,
      division,
      classCode,
      className,
      divisionName,
      nameTokens: new Set(tokens(s.name)),
      classTokens: new Set(tokens(className)),
      upperTokens: new Set([...tokens(divisionName), ...tokens(raw.groups[s.code.slice(0, 3)] ?? "")]),
      phrase: s.name.toLowerCase(),
    };
  });
  return index;
}

/** The best matches for what the person typed, most relevant first. Empty for a query with nothing to go on. */
export function searchNic(query: string, limit = 8): NicHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  // An exact code typed in the box finds that code.
  if (/^\d{5}$/.test(q)) {
    const e = build().find((x) => x.code === q);
    return e ? [toHit(e, 100)] : [];
  }
  const words = q.replace(/[^a-z0-9\- ]+/g, " ").split(/\s+/).filter(Boolean);
  const wanted = words.filter((w) => !STOP.has(w));
  if (wanted.length === 0) return [];
  const asksForShop = words.some((w) => ["shop", "shops", "store", "stores", "dukan", "mart"].includes(w));
  // Each typed word becomes a group of alternatives: itself plus what the aliases say it means.
  const groups = wanted.map((w) => {
    const alts = new Set<string>([stem(w)]);
    for (const a of ALIASES[w] ?? ALIASES[stem(w)] ?? []) tokens(a).forEach((t) => alts.add(t));
    return { own: stem(w), alts: [...alts] };
  });
  const out: NicHit[] = [];
  for (const e of build()) {
    let score = 0;
    let matched = 0;
    for (const g of groups) {
      let best = 0;
      let extra = 0; // other alternatives of the same word that also match: a better fit
      for (const a of g.alts) {
        const weight = a === g.own ? 1 : 0.7; // the person's own word counts more than an alias
        const here = e.nameTokens.has(a) ? 3 * weight : e.classTokens.has(a) ? 1.5 * weight : e.upperTokens.has(a) ? 0.6 * weight : 0;
        if (here > best) { extra += best * 0.35; best = here; } else if (here > 0) extra += here * 0.35;
      }
      if (best > 0) matched++;
      score += best + Math.min(extra, 2);
    }
    if (matched === 0) continue;
    if (matched === groups.length) score += 2; // every word found somewhere
    if (e.phrase.includes(q)) score += 3;
    if (asksForShop && /^retail/.test(e.phrase)) score += 1.5; // "…shop" / "…store" means selling, not making
    // Prefer the plain catch-all kinds of entry over "n.e.c." leftovers, and shorter (more specific) names.
    if (/n\.e\.c/.test(e.name)) score -= 0.5;
    score -= Math.min(e.name.length, 200) / 400;
    out.push(toHit(e, score));
  }
  out.sort((a, b) => b.score - a.score || (a.code < b.code ? -1 : 1));
  return out.slice(0, limit);
}

export function nicByCode(code: string): NicHit | null {
  const e = build().find((x) => x.code === code);
  return e ? toHit(e, 0) : null;
}

function toHit(e: Entry, score: number): NicHit {
  return { code: e.code, name: e.name, division: e.division, classCode: e.classCode, className: e.className, divisionName: e.divisionName, score };
}
