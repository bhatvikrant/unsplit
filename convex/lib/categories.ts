/**
 * Expense categories. Parent groups with subcategories. `icon` is a Lucide
 * icon name rendered on the client. Slugs are stable ids stored on expenses.
 */
export type Category = { slug: string; name: string; icon: string; parent: string };
export type CategoryGroup = { slug: string; name: string; icon: string; children: Category[] };

const def = (parent: string, icon: string, items: [string, string, string?][]): Category[] =>
  items.map(([slug, name, ic]) => ({ slug, name, icon: ic ?? icon, parent }));

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    slug: "general", name: "General", icon: "Receipt",
    children: def("general", "Receipt", [["general", "General"], ["payment", "Payment", "ArrowLeftRight"]]),
  },
  {
    slug: "entertainment", name: "Entertainment", icon: "Clapperboard",
    children: def("entertainment", "Clapperboard", [
      ["games", "Games", "Gamepad2"], ["movies", "Movies", "Film"], ["music", "Music", "Music"],
      ["sports", "Sports", "Trophy"], ["entertainment-other", "Other entertainment"],
    ]),
  },
  {
    slug: "food", name: "Food & drink", icon: "UtensilsCrossed",
    children: def("food", "UtensilsCrossed", [
      ["dining-out", "Dining out", "UtensilsCrossed"], ["groceries", "Groceries", "ShoppingBasket"],
      ["liquor", "Drinks", "Wine"], ["coffee", "Coffee", "Coffee"], ["food-other", "Other food"],
    ]),
  },
  {
    slug: "home", name: "Home", icon: "House",
    children: def("home", "House", [
      ["rent", "Rent", "KeyRound"], ["mortgage", "Mortgage", "Landmark"], ["household", "Household supplies", "SprayCan"],
      ["furniture", "Furniture", "Armchair"], ["maintenance", "Maintenance", "Wrench"], ["pets", "Pets", "PawPrint"],
      ["services", "Services", "Hammer"], ["home-other", "Other home"],
    ]),
  },
  {
    slug: "life", name: "Life", icon: "Heart",
    children: def("life", "Heart", [
      ["childcare", "Childcare", "Baby"], ["clothing", "Clothing", "Shirt"], ["education", "Education", "GraduationCap"],
      ["gifts", "Gifts", "Gift"], ["insurance", "Insurance", "ShieldCheck"], ["medical", "Medical", "Stethoscope"],
      ["taxes", "Taxes", "FileText"], ["life-other", "Other life"],
    ]),
  },
  {
    slug: "transportation", name: "Transport", icon: "Car",
    children: def("transportation", "Car", [
      ["bus-train", "Bus / train", "TrainFront"], ["car", "Car", "Car"], ["gas", "Fuel", "Fuel"],
      ["hotel", "Hotel", "BedDouble"], ["parking", "Parking", "CircleParking"], ["plane", "Flights", "Plane"],
      ["taxi", "Taxi / rideshare", "CarTaxiFront"], ["bicycle", "Bicycle", "Bike"], ["transport-other", "Other transport"],
    ]),
  },
  {
    slug: "utilities", name: "Utilities", icon: "Zap",
    children: def("utilities", "Zap", [
      ["electricity", "Electricity", "Zap"], ["heat-gas", "Heat / gas", "Flame"], ["water", "Water", "Droplets"],
      ["internet", "Internet", "Wifi"], ["phone", "Phone", "Smartphone"], ["tv", "TV / streaming", "Tv"],
      ["trash", "Trash", "Trash2"], ["cleaning", "Cleaning", "Sparkles"], ["utilities-other", "Other utilities"],
    ]),
  },
  {
    slug: "uncategorized", name: "Uncategorized", icon: "CircleDashed",
    children: def("uncategorized", "CircleDashed", [["uncategorized", "Uncategorized"]]),
  },
];

export const CATEGORIES: Category[] = CATEGORY_GROUPS.flatMap((g) => g.children);
const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryBySlug(slug: string): Category {
  return bySlug.get(slug) ?? bySlug.get("general")!;
}

export function isCategory(slug: string): boolean {
  return bySlug.has(slug);
}

/** Keyword-based suggestion from a description. Returns a slug or null. */
const KEYWORDS: [RegExp, string][] = [
  [/\b(rent|lease)\b/i, "rent"],
  [/\b(grocer|supermarket|whole foods|trader joe|costco|aldi|lidl|tesco|safeway|kroger|walmart)\b/i, "groceries"],
  [/\b(dinner|lunch|brunch|breakfast|restaurant|pizza|sushi|burger|taco|ramen|cafe|bistro|diner|takeout|take-out|doordash|ubereats|deliveroo|zomato|swiggy)\b/i, "dining-out"],
  [/\b(coffee|latte|espresso|starbucks|cappuccino)\b/i, "coffee"],
  [/\b(beer|wine|bar|drinks|cocktail|liquor|pub|brewery)\b/i, "liquor"],
  [/\b(uber|lyft|taxi|cab|ola|grab|bolt)\b/i, "taxi"],
  [/\b(flight|airline|plane|airfare|ryanair|easyjet|delta|united)\b/i, "plane"],
  [/\b(hotel|airbnb|hostel|motel|lodging|resort)\b/i, "hotel"],
  [/\b(gas|petrol|fuel|diesel|shell|chevron|exxon|bp)\b/i, "gas"],
  [/\b(train|bus|metro|subway|transit|rail|amtrak|tube)\b/i, "bus-train"],
  [/\b(parking|toll)\b/i, "parking"],
  [/\b(electric|power bill|electricity)\b/i, "electricity"],
  [/\b(water bill|water)\b/i, "water"],
  [/\b(internet|wifi|broadband|fiber|comcast|xfinity)\b/i, "internet"],
  [/\b(phone|mobile|verizon|t-mobile|at&t|vodafone|airtel|jio)\b/i, "phone"],
  [/\b(netflix|hulu|spotify|disney|hbo|prime video|tv|cable|streaming)\b/i, "tv"],
  [/\b(heat|heating|gas bill)\b/i, "heat-gas"],
  [/\b(cleaning|cleaner|maid)\b/i, "cleaning"],
  [/\b(movie|cinema|theater|theatre|concert|show|tickets?)\b/i, "movies"],
  [/\b(game|games|steam|playstation|xbox|nintendo)\b/i, "games"],
  [/\b(doctor|pharmacy|medicine|hospital|dentist|clinic|cvs|walgreens)\b/i, "medical"],
  [/\b(gift|present|birthday)\b/i, "gifts"],
  [/\b(ikea|couch|sofa|table|chair|furniture|mattress)\b/i, "furniture"],
  [/\b(dog|cat|pet|vet)\b/i, "pets"],
  [/\b(insurance)\b/i, "insurance"],
  [/\b(tuition|course|class|school|textbook)\b/i, "education"],
  [/\b(clothes|clothing|shoes|zara|h&m|uniqlo)\b/i, "clothing"],
  [/\b(toilet paper|detergent|soap|paper towels|supplies|household)\b/i, "household"],
  [/\b(plumber|repair|fix|maintenance|handyman)\b/i, "maintenance"],
  [/\b(gym|yoga|fitness|sports?|tennis|football|basketball)\b/i, "sports"],
  [/\b(trash|garbage|waste)\b/i, "trash"],
];

export function suggestCategory(description: string): string | null {
  for (const [re, slug] of KEYWORDS) if (re.test(description)) return slug;
  return null;
}
