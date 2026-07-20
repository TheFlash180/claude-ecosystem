-- Meal Prep starter pack: 20 SA-friendly meal-prep recipes (copy of record —
-- already seeded live). The household edits these freely in the app, so the
-- live rows drift from this file; it exists for bootstrap/disaster recovery.
-- Ingredient shape: [{n: name, q: qty, u: unit, c: aisle}] where aisle is
-- one of meat/veg/dairy/bakery/pantry/spices/frozen/other.

insert into mealprep_recipes (id, name, emoji, meal_type, serves, ingredients, notes) values
('bobotie', 'Bobotie', '🍛', 'dinner', 4, '[
 {"n":"Beef mince","q":500,"u":"g","c":"meat"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"White bread","q":2,"u":"slices","c":"bakery"},{"n":"Milk","q":250,"u":"ml","c":"dairy"},
 {"n":"Eggs","q":2,"u":"","c":"dairy"},{"n":"Curry powder","q":2,"u":"tbsp","c":"spices"},
 {"n":"Turmeric","q":1,"u":"tsp","c":"spices"},{"n":"Chutney","q":3,"u":"tbsp","c":"pantry"},
 {"n":"Raisins","q":60,"u":"g","c":"pantry"},{"n":"Bay leaves","q":4,"u":"","c":"spices"}]',
 'Soak the bread in the milk, mix into the browned mince with curry, chutney and raisins. Bake 35 min at 180°C with the egg custard on top. Freezes beautifully — portion before adding the topping if prepping ahead.'),
('chicken-breyani', 'Chicken breyani', '🍗', 'dinner', 6, '[
 {"n":"Chicken thighs","q":800,"u":"g","c":"meat"},{"n":"Basmati rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Brown lentils","q":1,"u":"cup","c":"pantry"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"Potatoes","q":3,"u":"","c":"veg"},{"n":"Breyani masala","q":3,"u":"tbsp","c":"spices"},
 {"n":"Plain yoghurt","q":125,"u":"ml","c":"dairy"},{"n":"Fresh coriander","q":1,"u":"bunch","c":"veg"}]',
 'Layer marinated chicken, par-cooked rice, lentils and fried onions; steam low and slow ~45 min. Even better the next day — a perfect Sunday prep dish.'),
('pap-en-wors', 'Pap & wors with tomato smoor', '🌭', 'dinner', 4, '[
 {"n":"Boerewors","q":500,"u":"g","c":"meat"},{"n":"Maize meal","q":2,"u":"cups","c":"pantry"},
 {"n":"Tomatoes","q":4,"u":"","c":"veg"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Tomato paste","q":2,"u":"tbsp","c":"pantry"},{"n":"Sugar","q":1,"u":"tsp","c":"pantry"}]',
 'Stywe pap or krummelpap — your call. Smoor: soften onion, add chopped tomato, paste and sugar, simmer 15 min. Wors in the pan or on the braai.'),
('cottage-pie', 'Cottage pie', '🥧', 'dinner', 4, '[
 {"n":"Beef mince","q":500,"u":"g","c":"meat"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Carrots","q":2,"u":"","c":"veg"},{"n":"Frozen peas","q":1,"u":"cup","c":"frozen"},
 {"n":"Beef stock cubes","q":1,"u":"","c":"pantry"},{"n":"Potatoes","q":6,"u":"","c":"veg"},
 {"n":"Butter","q":50,"u":"g","c":"dairy"},{"n":"Milk","q":100,"u":"ml","c":"dairy"},
 {"n":"Cheddar","q":50,"u":"g","c":"dairy"}]',
 'Assemble in two foil dishes: one for tonight, one for the freezer. Grate the cheddar over the mash before baking, 25 min at 200°C.'),
('chicken-a-la-king', 'Chicken à la king', '🍲', 'dinner', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Mushrooms","q":250,"u":"g","c":"veg"},
 {"n":"Green pepper","q":1,"u":"","c":"veg"},{"n":"Cream","q":250,"u":"ml","c":"dairy"},
 {"n":"Chicken stock cubes","q":1,"u":"","c":"pantry"},{"n":"Rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Flour","q":2,"u":"tbsp","c":"pantry"}]',
 'The sauce thickens as it stands, so add a splash of milk when reheating. Rice keeps 4 days in the fridge — cook the full 2 cups.'),
('beef-stew', 'Beef & veg stew', '🥘', 'dinner', 6, '[
 {"n":"Stewing beef","q":700,"u":"g","c":"meat"},{"n":"Potatoes","q":4,"u":"","c":"veg"},
 {"n":"Carrots","q":3,"u":"","c":"veg"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"Celery","q":2,"u":"stalks","c":"veg"},{"n":"Beef stock cubes","q":2,"u":"","c":"pantry"},
 {"n":"Tomato paste","q":2,"u":"tbsp","c":"pantry"},{"n":"Rice or samp","q":2,"u":"cups","c":"pantry"}]',
 'Potjie flavours without the fire: brown the beef hard, then 2 hours low on the stove. Doubles easily and freezes in portions.'),
('curried-mince', 'Curried mince & rice', '🍚', 'dinner', 4, '[
 {"n":"Beef mince","q":500,"u":"g","c":"meat"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Curry powder","q":2,"u":"tbsp","c":"spices"},{"n":"Frozen mixed veg","q":2,"u":"cups","c":"frozen"},
 {"n":"Potatoes","q":2,"u":"","c":"veg"},{"n":"Rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Chutney","q":2,"u":"tbsp","c":"pantry"}]',
 'Ouma-style kerrie maalvleis. The chutney at the end is not optional. Great over rice tonight, in vetkoek or jaffles later in the week.'),
('spag-bol', 'Spaghetti bolognese', '🍝', 'dinner', 4, '[
 {"n":"Beef mince","q":500,"u":"g","c":"meat"},{"n":"Spaghetti","q":400,"u":"g","c":"pantry"},
 {"n":"Tinned tomatoes","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Garlic","q":3,"u":"cloves","c":"veg"},{"n":"Carrots","q":1,"u":"","c":"veg"},
 {"n":"Cheddar","q":60,"u":"g","c":"dairy"},{"n":"Mixed herbs","q":1,"u":"tbsp","c":"spices"}]',
 'Grate the carrot into the sauce — sweetness without sugar. Sauce freezes flat in zip bags; cook pasta fresh on the night.'),
('chicken-mayo-pasta', 'Chicken mayo pasta salad', '🥗', 'lunch', 4, '[
 {"n":"Pasta shells","q":300,"u":"g","c":"pantry"},{"n":"Chicken breasts","q":400,"u":"g","c":"meat"},
 {"n":"Mayonnaise","q":4,"u":"tbsp","c":"pantry"},{"n":"Sweetcorn","q":1,"u":"tin","c":"pantry"},
 {"n":"Spring onion","q":3,"u":"","c":"veg"},{"n":"Peppers","q":1,"u":"","c":"veg"}]',
 'Classic work-lunch prep: keeps 3 days in the fridge. Dress lightly on prep day and keep a little mayo back to refresh it.'),
('tuna-wraps', 'Tuna & sweetcorn wraps', '🌯', 'lunch', 4, '[
 {"n":"Tortilla wraps","q":8,"u":"","c":"bakery"},{"n":"Tuna","q":3,"u":"tins","c":"pantry"},
 {"n":"Sweetcorn","q":1,"u":"tin","c":"pantry"},{"n":"Mayonnaise","q":3,"u":"tbsp","c":"pantry"},
 {"n":"Lettuce","q":1,"u":"head","c":"veg"},{"n":"Cucumber","q":1,"u":"","c":"veg"}]',
 'Mix the tuna filling on prep day; build wraps fresh each morning so they don''t go soggy.'),
('butternut-soup', 'Butternut soup & rolls', '🎃', 'lunch', 4, '[
 {"n":"Butternut","q":1,"u":"kg","c":"veg"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Potatoes","q":1,"u":"","c":"veg"},{"n":"Veg stock cubes","q":2,"u":"","c":"pantry"},
 {"n":"Cream","q":125,"u":"ml","c":"dairy"},{"n":"Bread rolls","q":6,"u":"","c":"bakery"},
 {"n":"Nutmeg","q":1,"u":"pinch","c":"spices"}]',
 'Roast the butternut first for a deeper flavour. Freezes perfectly — make a double pot and bank lunches.'),
('bean-curry', 'Bean curry (bunny-style)', '🫘', 'dinner', 4, '[
 {"n":"Red kidney beans","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"Tinned tomatoes","q":1,"u":"tin","c":"pantry"},{"n":"Curry powder","q":2,"u":"tbsp","c":"spices"},
 {"n":"Garlic","q":3,"u":"cloves","c":"veg"},{"n":"Fresh ginger","q":1,"u":"knob","c":"veg"},
 {"n":"Rice","q":2,"u":"cups","c":"pantry"},{"n":"Bread rolls","q":4,"u":"","c":"bakery"}]',
 'Durban-style heat is up to you. Serve in a hollowed-out roll for the bunny chow experience, or over rice. Meat-free and cheap.'),
('hake-traybake', 'Hake & veg traybake', '🐟', 'dinner', 4, '[
 {"n":"Hake fillets","q":600,"u":"g","c":"frozen"},{"n":"Baby potatoes","q":600,"u":"g","c":"veg"},
 {"n":"Broccoli","q":1,"u":"head","c":"veg"},{"n":"Lemon","q":1,"u":"","c":"veg"},
 {"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"}]',
 'One tray, no washing up: potatoes in first for 20 min, then fish and broccoli for 15 more. Lemon over everything at the end.'),
('chicken-sosaties', 'Chicken sosaties & rice', '🍢', 'dinner', 4, '[
 {"n":"Chicken breasts","q":700,"u":"g","c":"meat"},{"n":"Dried apricots","q":100,"u":"g","c":"pantry"},
 {"n":"Onion","q":1,"u":"","c":"veg"},{"n":"Curry powder","q":2,"u":"tbsp","c":"spices"},
 {"n":"Rice","q":2,"u":"cups","c":"pantry"},{"n":"Green pepper","q":1,"u":"","c":"veg"}]',
 'Skewer chicken, apricots, onion and pepper; marinate overnight in the curry mix. Pan, oven or braai — all work.'),
('frikkadelle', 'Frikkadelle with mash & peas', '🧆', 'dinner', 4, '[
 {"n":"Beef mince","q":600,"u":"g","c":"meat"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"White bread","q":2,"u":"slices","c":"bakery"},{"n":"Eggs","q":1,"u":"","c":"dairy"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Milk","q":100,"u":"ml","c":"dairy"},
 {"n":"Frozen peas","q":2,"u":"cups","c":"frozen"},{"n":"Nutmeg","q":1,"u":"pinch","c":"spices"}]',
 'Make a double batch of meatballs — they''re just as good cold in lunchboxes or in a tomato smoor later in the week.'),
('chicken-broccoli-bake', 'Creamy chicken & broccoli bake', '🥦', 'dinner', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Broccoli","q":2,"u":"heads","c":"veg"},
 {"n":"Cream","q":250,"u":"ml","c":"dairy"},{"n":"Cheddar","q":100,"u":"g","c":"dairy"},
 {"n":"Tinned mushroom soup","q":1,"u":"tin","c":"pantry"},{"n":"Rice","q":2,"u":"cups","c":"pantry"}]',
 'Assembles in 10 minutes with the tinned-soup shortcut. Reheats well — a solid cook-double candidate.'),
('lentil-bobotie', 'Lentil bobotie (meat-free)', '🌱', 'dinner', 4, '[
 {"n":"Brown lentils","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"White bread","q":2,"u":"slices","c":"bakery"},{"n":"Milk","q":250,"u":"ml","c":"dairy"},
 {"n":"Eggs","q":2,"u":"","c":"dairy"},{"n":"Curry powder","q":2,"u":"tbsp","c":"spices"},
 {"n":"Chutney","q":3,"u":"tbsp","c":"pantry"},{"n":"Raisins","q":60,"u":"g","c":"pantry"}]',
 'All the bobotie comfort, none of the mince. Same method: bake 30 min at 180°C with the custard top.'),
('chakalaka-bowls', 'Chakalaka chicken bowls', '🥣', 'lunch', 4, '[
 {"n":"Chakalaka","q":2,"u":"tins","c":"pantry"},{"n":"Rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Chicken breasts","q":400,"u":"g","c":"meat"},{"n":"Baby spinach","q":100,"u":"g","c":"veg"},
 {"n":"Feta","q":1,"u":"round","c":"dairy"}]',
 'Batch-cook the rice and chicken on Sunday; assemble bowls each morning. Mild or hot chakalaka sets the tone.'),
('couscous-salad', 'Couscous & roast veg salad', '🥙', 'lunch', 4, '[
 {"n":"Couscous","q":2,"u":"cups","c":"pantry"},{"n":"Peppers","q":2,"u":"","c":"veg"},
 {"n":"Courgettes","q":2,"u":"","c":"veg"},{"n":"Red onion","q":1,"u":"","c":"veg"},
 {"n":"Feta","q":1,"u":"round","c":"dairy"},{"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},
 {"n":"Lemon","q":1,"u":"","c":"veg"}]',
 'Roast a big tray of veg once; it carries this salad plus sides for two dinners. Couscous takes 5 minutes — boiling water, cover, done.'),
('sweet-sour-stirfry', 'Sweet & sour chicken stir-fry', '🥡', 'dinner', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Stir-fry veg mix","q":500,"u":"g","c":"frozen"},
 {"n":"Egg noodles","q":400,"u":"g","c":"pantry"},{"n":"Soy sauce","q":4,"u":"tbsp","c":"pantry"},
 {"n":"Honey","q":2,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"},
 {"n":"Fresh ginger","q":1,"u":"knob","c":"veg"}]',
 'Fifteen-minute dinner if the chicken is sliced on prep day. Sauce = soy + honey + garlic + ginger, reduced for 2 minutes.')
on conflict (id) do nothing;
