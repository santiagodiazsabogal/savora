// Lista estática de comidas GENÉRICAS (sin marcas) para el buscador del mercado.
// El usuario pidió "abarcar lo más posible" → cobertura amplia de un súper de EE.UU.
// Cada categoría comparte un emoji. Añadir comidas = añadir strings a la categoría.
// Todo vive en el frontend (cero API externa) → el buscador filtra al instante.

export interface FoodOption {
  name: string
  emoji: string
}

const CATEGORIES: { emoji: string; foods: string[] }[] = [
  { emoji: '🥛', foods: ['Milk', 'Whole milk', 'Skim milk', '2% milk', 'Almond milk', 'Oat milk', 'Soy milk', 'Coconut milk', 'Lactose-free milk', 'Buttermilk', 'Condensed milk', 'Evaporated milk', 'Heavy cream', 'Half and half', 'Whipping cream', 'Sour cream', 'Yogurt', 'Greek yogurt', 'Kefir'] },
  { emoji: '🧀', foods: ['Cheese', 'Cheddar cheese', 'Mozzarella', 'Parmesan', 'Feta', 'Gouda', 'Brie', 'Cream cheese', 'Cottage cheese', 'Ricotta', 'Swiss cheese', 'Provolone', 'Blue cheese', 'Goat cheese', 'String cheese', 'American cheese', 'Monterey Jack', 'Queso fresco', 'Shredded cheese'] },
  { emoji: '🧈', foods: ['Butter', 'Unsalted butter', 'Margarine', 'Ghee'] },
  { emoji: '🥚', foods: ['Eggs', 'Egg whites', 'Liquid eggs'] },
  { emoji: '🍗', foods: ['Chicken breast', 'Chicken thighs', 'Whole chicken', 'Chicken wings', 'Chicken drumsticks', 'Ground chicken', 'Rotisserie chicken', 'Turkey', 'Ground turkey', 'Turkey breast', 'Duck'] },
  { emoji: '🥩', foods: ['Beef', 'Ground beef', 'Steak', 'Ribeye', 'Sirloin', 'Beef roast', 'Brisket', 'Short ribs', 'Pork', 'Pork chops', 'Pork loin', 'Ground pork', 'Pork ribs', 'Bacon', 'Ham', 'Sausage', 'Hot dogs', 'Lamb', 'Lamb chops', 'Veal'] },
  { emoji: '🥓', foods: ['Salami', 'Pepperoni', 'Prosciutto', 'Deli meat', 'Turkey slices', 'Roast beef', 'Meatballs', 'Chorizo'] },
  { emoji: '🐟', foods: ['Salmon', 'Tuna', 'Cod', 'Tilapia', 'Trout', 'Catfish', 'Mackerel', 'Sardines', 'Fish fillet', 'Halibut'] },
  { emoji: '🦐', foods: ['Shrimp', 'Crab', 'Lobster', 'Scallops', 'Mussels', 'Clams', 'Oysters', 'Calamari'] },
  { emoji: '🥬', foods: ['Lettuce', 'Romaine', 'Spinach', 'Kale', 'Arugula', 'Cabbage', 'Bok choy', 'Collard greens', 'Swiss chard', 'Mixed greens', 'Sprouts'] },
  { emoji: '🥦', foods: ['Broccoli', 'Cauliflower', 'Brussels sprouts', 'Asparagus', 'Green beans', 'Peas', 'Snap peas', 'Artichoke', 'Okra'] },
  { emoji: '🥕', foods: ['Carrot', 'Beet', 'Radish', 'Turnip', 'Parsnip', 'Ginger', 'Celery', 'Leek'] },
  { emoji: '🥔', foods: ['Potato', 'Sweet potato', 'Russet potato', 'Yam', 'Red potato'] },
  { emoji: '🧅', foods: ['Onion', 'Red onion', 'Green onion', 'Shallot', 'Garlic'] },
  { emoji: '🍅', foods: ['Tomato', 'Cherry tomatoes', 'Roma tomatoes'] },
  { emoji: '🫑', foods: ['Bell pepper', 'Red pepper', 'Green pepper', 'Jalapeño', 'Serrano pepper', 'Poblano pepper', 'Chili pepper'] },
  { emoji: '🥒', foods: ['Cucumber', 'Zucchini', 'Eggplant', 'Squash', 'Butternut squash', 'Pumpkin'] },
  { emoji: '🍄', foods: ['Mushrooms', 'Portobello', 'Shiitake'] },
  { emoji: '🌽', foods: ['Corn', 'Corn on the cob'] },
  { emoji: '🥑', foods: ['Avocado'] },
  { emoji: '🍎', foods: ['Apple', 'Green apple', 'Pear', 'Peach', 'Plum', 'Nectarine', 'Apricot'] },
  { emoji: '🍌', foods: ['Banana', 'Plantain'] },
  { emoji: '🍊', foods: ['Orange', 'Tangerine', 'Clementine', 'Grapefruit', 'Mandarin'] },
  { emoji: '🍋', foods: ['Lemon', 'Lime'] },
  { emoji: '🍇', foods: ['Grapes', 'Raisins'] },
  { emoji: '🍓', foods: ['Strawberries', 'Blueberries', 'Raspberries', 'Blackberries', 'Cranberries', 'Mixed berries'] },
  { emoji: '🍍', foods: ['Pineapple', 'Mango', 'Papaya', 'Kiwi', 'Guava', 'Passion fruit', 'Dragon fruit', 'Coconut'] },
  { emoji: '🍉', foods: ['Watermelon', 'Cantaloupe', 'Honeydew'] },
  { emoji: '🍒', foods: ['Cherries', 'Pomegranate', 'Figs', 'Dates'] },
  { emoji: '🍞', foods: ['Bread', 'White bread', 'Wheat bread', 'Whole grain bread', 'Sourdough', 'Rye bread', 'Baguette', 'Ciabatta', 'Brioche', 'Dinner rolls', 'Hamburger buns', 'Hot dog buns', 'Breadcrumbs'] },
  { emoji: '🥯', foods: ['Bagels', 'English muffins', 'Croissant', 'Biscuits'] },
  { emoji: '🫓', foods: ['Tortillas', 'Corn tortillas', 'Flour tortillas', 'Pita bread', 'Naan', 'Wraps'] },
  { emoji: '🥞', foods: ['Pancakes', 'Waffles', 'Pancake mix', 'Cornbread'] },
  { emoji: '🍝', foods: ['Pasta', 'Spaghetti', 'Penne', 'Macaroni', 'Lasagna', 'Fettuccine', 'Ravioli', 'Gnocchi', 'Orzo', 'Egg noodles', 'Rice noodles', 'Ramen', 'Couscous'] },
  { emoji: '🍚', foods: ['Rice', 'White rice', 'Brown rice', 'Jasmine rice', 'Basmati rice', 'Quinoa', 'Barley', 'Bulgur', 'Farro', 'Polenta', 'Grits'] },
  { emoji: '🌾', foods: ['Oats', 'Oatmeal', 'Rolled oats', 'Flour', 'All-purpose flour', 'Whole wheat flour', 'Almond flour', 'Cornmeal'] },
  { emoji: '🫘', foods: ['Black beans', 'Kidney beans', 'Pinto beans', 'Chickpeas', 'Lentils', 'White beans', 'Navy beans', 'Refried beans', 'Edamame', 'Split peas'] },
  { emoji: '🥜', foods: ['Almonds', 'Peanuts', 'Walnuts', 'Cashews', 'Pecans', 'Pistachios', 'Hazelnuts', 'Sunflower seeds', 'Pumpkin seeds', 'Chia seeds', 'Flax seeds', 'Sesame seeds', 'Peanut butter', 'Almond butter', 'Trail mix'] },
  { emoji: '🫒', foods: ['Olive oil', 'Vegetable oil', 'Canola oil', 'Coconut oil', 'Avocado oil', 'Sesame oil', 'Cooking spray', 'Olives', 'Capers'] },
  { emoji: '🧂', foods: ['Salt', 'Sea salt', 'Black pepper', 'Vinegar', 'Balsamic vinegar', 'Apple cider vinegar'] },
  { emoji: '🥫', foods: ['Ketchup', 'Mustard', 'Mayonnaise', 'Soy sauce', 'Hot sauce', 'Sriracha', 'BBQ sauce', 'Ranch dressing', 'Salad dressing', 'Salsa', 'Pasta sauce', 'Marinara sauce', 'Pizza sauce', 'Worcestershire sauce', 'Teriyaki sauce', 'Tomato paste', 'Tomato sauce', 'Canned tomatoes', 'Chicken broth', 'Beef broth', 'Vegetable broth', 'Canned tuna', 'Canned corn', 'Canned beans', 'Soup', 'Pickles', 'Relish', 'Pesto', 'Gravy', 'Hummus', 'Guacamole'] },
  { emoji: '🌿', foods: ['Basil', 'Oregano', 'Thyme', 'Rosemary', 'Parsley', 'Cilantro', 'Dill', 'Sage', 'Mint', 'Bay leaves'] },
  { emoji: '🧄', foods: ['Cumin', 'Paprika', 'Cinnamon', 'Nutmeg', 'Turmeric', 'Curry powder', 'Chili powder', 'Garlic powder', 'Onion powder', 'Cayenne pepper', 'Cloves', 'Cardamom', 'Coriander', 'Red pepper flakes', 'Italian seasoning', 'Ginger powder'] },
  { emoji: '🍯', foods: ['Sugar', 'Brown sugar', 'Powdered sugar', 'Honey', 'Maple syrup', 'Agave', 'Molasses'] },
  { emoji: '🧁', foods: ['Baking powder', 'Baking soda', 'Yeast', 'Cornstarch', 'Vanilla extract', 'Cocoa powder', 'Chocolate chips', 'Cake mix', 'Frosting', 'Sprinkles', 'Gelatin'] },
  { emoji: '🥣', foods: ['Cereal', 'Granola', 'Corn flakes', 'Breakfast bars', 'Grits'] },
  { emoji: '🍫', foods: ['Chocolate', 'Dark chocolate', 'Candy', 'Cookies', 'Marshmallows'] },
  { emoji: '🍿', foods: ['Chips', 'Potato chips', 'Tortilla chips', 'Pretzels', 'Popcorn', 'Crackers', 'Rice cakes', 'Granola bars', 'Protein bars', 'Dried fruit', 'Fruit snacks', 'Jerky'] },
  { emoji: '🍦', foods: ['Ice cream', 'Popsicles', 'Frozen yogurt'] },
  { emoji: '🧊', foods: ['Frozen pizza', 'Frozen vegetables', 'Frozen fruit', 'Frozen berries', 'Frozen waffles', 'Frozen fries', 'Frozen dumplings', 'Frozen dinner', 'Ice'] },
  { emoji: '🍲', foods: ['Tofu', 'Tempeh', 'Seitan', 'Bouillon', 'Nutritional yeast', 'Protein powder'] },
  { emoji: '☕', foods: ['Coffee', 'Ground coffee', 'Coffee beans', 'Instant coffee', 'Hot chocolate'] },
  { emoji: '🍵', foods: ['Tea', 'Green tea', 'Black tea', 'Herbal tea', 'Matcha'] },
  { emoji: '🧃', foods: ['Orange juice', 'Apple juice', 'Juice', 'Lemonade', 'Iced tea', 'Coconut water', 'Kombucha'] },
  { emoji: '🥤', foods: ['Soda', 'Cola', 'Sparkling water', 'Water', 'Bottled water', 'Energy drink', 'Sports drink'] },
  { emoji: '🍷', foods: ['Wine', 'Red wine', 'White wine', 'Beer', 'Champagne'] },
  { emoji: '🍶', foods: ['Vodka', 'Whiskey', 'Rum', 'Tequila', 'Gin'] },
]

// Aplanado a { name, emoji }. (Se computa una vez al importar el módulo.)
export const FOODS: FoodOption[] = CATEGORIES.flatMap((c) =>
  c.foods.map((name) => ({ name, emoji: c.emoji })),
)

// Búsqueda exacta nombre→emoji (minúsculas) para pintar el emoji de un ítem guardado.
const EMOJI_BY_NAME = new Map(FOODS.map((f) => [f.name.toLowerCase(), f.emoji]))

// Fallback por keyword para nombres que NO están en la lista (p.ej. ingredientes que
// llegan del flujo de recetas: "chicken broth", "cherry tomatoes"...).
const EMOJI_FALLBACK: [RegExp, string][] = [
  [/milk|yogurt|cream|kefir/i, '🥛'],
  [/cheese|parmesan|mozzarella|cheddar|feta|ricotta/i, '🧀'],
  [/butter|margarine|ghee/i, '🧈'],
  [/egg/i, '🥚'],
  [/chicken|turkey|duck|poultry/i, '🍗'],
  [/beef|steak|pork|bacon|ham|sausage|lamb|veal|meat|ribs/i, '🥩'],
  [/salami|pepperoni|prosciutto|deli|chorizo/i, '🥓'],
  [/salmon|tuna|cod|tilapia|trout|fish|sardine|mackerel/i, '🐟'],
  [/shrimp|crab|lobster|scallop|mussel|clam|oyster|calamari/i, '🦐'],
  [/lettuce|spinach|kale|arugula|cabbage|greens|sprout|chard/i, '🥬'],
  [/broccoli|cauliflower|asparagus|bean|pea|artichoke|okra/i, '🥦'],
  [/carrot|beet|radish|turnip|celery|leek|ginger/i, '🥕'],
  [/potato|yam/i, '🥔'],
  [/onion|garlic|shallot/i, '🧅'],
  [/tomato/i, '🍅'],
  [/pepper|jalape|chili|serrano|poblano/i, '🫑'],
  [/cucumber|zucchini|eggplant|squash|pumpkin/i, '🥒'],
  [/mushroom|portobello|shiitake/i, '🍄'],
  [/corn/i, '🌽'],
  [/avocado/i, '🥑'],
  [/apple|pear|peach|plum|nectarine|apricot/i, '🍎'],
  [/banana|plantain/i, '🍌'],
  [/orange|tangerine|clementine|grapefruit|mandarin/i, '🍊'],
  [/lemon|lime/i, '🍋'],
  [/grape|raisin/i, '🍇'],
  [/berr/i, '🍓'],
  [/pineapple|mango|papaya|kiwi|guava|coconut/i, '🍍'],
  [/watermelon|melon/i, '🍉'],
  [/cherr|pomegranate|fig|date/i, '🍒'],
  [/bread|baguette|ciabatta|brioche|roll|bun|crumb|rye|sourdough/i, '🍞'],
  [/bagel|muffin|croissant|biscuit/i, '🥯'],
  [/tortilla|pita|naan|wrap/i, '🫓'],
  [/pancake|waffle|cornbread/i, '🥞'],
  [/pasta|spaghetti|penne|macaroni|lasagna|noodle|ravioli|gnocchi|orzo|couscous|ramen/i, '🍝'],
  [/rice|quinoa|barley|bulgur|farro|polenta|grits/i, '🍚'],
  [/oat|flour|cornmeal/i, '🌾'],
  [/lentil|chickpea|garbanzo|edamame/i, '🫘'],
  [/almond|peanut|walnut|cashew|pecan|pistachio|hazelnut|seed|nut/i, '🥜'],
  [/olive|oil|caper/i, '🫒'],
  [/salt|pepper|vinegar/i, '🧂'],
  [/ketchup|mustard|mayo|sauce|salsa|broth|stock|dressing|pickle|relish|pesto|gravy|hummus|guacamole|soup|canned|paste/i, '🥫'],
  [/basil|oregano|thyme|rosemary|parsley|cilantro|dill|sage|mint|bay/i, '🌿'],
  [/cumin|paprika|cinnamon|nutmeg|turmeric|curry|chili powder|garlic powder|cayenne|clove|cardamom|coriander|seasoning/i, '🧄'],
  [/sugar|honey|syrup|agave|molasses/i, '🍯'],
  [/baking|yeast|cornstarch|vanilla|cocoa|chocolate chip|cake mix|frosting|sprinkle|gelatin/i, '🧁'],
  [/cereal|granola|flakes/i, '🥣'],
  [/chocolate|candy|cookie|marshmallow/i, '🍫'],
  [/chips|pretzel|popcorn|cracker|jerky|snack|bar/i, '🍿'],
  [/ice cream|popsicle|frozen yogurt/i, '🍦'],
  [/frozen|\bice\b/i, '🧊'],
  [/tofu|tempeh|seitan|bouillon|protein powder/i, '🍲'],
  [/coffee/i, '☕'],
  [/\btea\b|matcha/i, '🍵'],
  [/juice|lemonade|kombucha/i, '🧃'],
  [/soda|cola|water|energy drink|sports drink/i, '🥤'],
  [/wine|beer|champagne/i, '🍷'],
  [/vodka|whiskey|rum|tequila|gin/i, '🍶'],
]

// Emoji para un nombre de comida: exacto de la lista → keyword → 🛒 por defecto.
export function foodEmoji(name: string): string {
  const exact = EMOJI_BY_NAME.get(name.trim().toLowerCase())
  if (exact) return exact
  return EMOJI_FALLBACK.find(([re]) => re.test(name))?.[1] ?? '🛒'
}
