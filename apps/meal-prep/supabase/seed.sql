-- Meal Prep starter pack (copy of record — mirrors the live curated set).
-- Mild, balanced, high-protein and pregnancy-friendly: no chilli/curry/masala,
-- cooked fish only, no shellfish. The household edits these freely in the app,
-- so the live rows drift from this file; it exists for bootstrap/recovery.
-- Ingredient shape: [{n: name, q: qty, u: unit, c: aisle}] where aisle is
-- one of meat/veg/dairy/bakery/pantry/spices/frozen/other.

insert into mealprep_recipes (id, name, emoji, meal_type, serves, ingredients, notes) values
-- ---- SA comfort staples (mild) ----
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
('frikkadelle', 'Frikkadelle with mash & peas', '🧆', 'dinner', 4, '[
 {"n":"Beef mince","q":600,"u":"g","c":"meat"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"White bread","q":2,"u":"slices","c":"bakery"},{"n":"Eggs","q":1,"u":"","c":"dairy"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Milk","q":100,"u":"ml","c":"dairy"},
 {"n":"Frozen peas","q":2,"u":"cups","c":"frozen"},{"n":"Nutmeg","q":1,"u":"pinch","c":"spices"}]',
 'Make a double batch of meatballs — they''re just as good cold in lunchboxes or in a tomato smoor later in the week.'),
('spag-bol', 'Spaghetti bolognese', '🍝', 'dinner', 4, '[
 {"n":"Beef mince","q":500,"u":"g","c":"meat"},{"n":"Spaghetti","q":400,"u":"g","c":"pantry"},
 {"n":"Tinned tomatoes","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Garlic","q":3,"u":"cloves","c":"veg"},{"n":"Carrots","q":1,"u":"","c":"veg"},
 {"n":"Cheddar","q":60,"u":"g","c":"dairy"},{"n":"Mixed herbs","q":1,"u":"tbsp","c":"spices"}]',
 'Grate the carrot into the sauce — sweetness without sugar. Sauce freezes flat in zip bags; cook pasta fresh on the night.'),
('chicken-broccoli-bake', 'Creamy chicken & broccoli bake', '🥦', 'dinner', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Broccoli","q":2,"u":"heads","c":"veg"},
 {"n":"Cream","q":250,"u":"ml","c":"dairy"},{"n":"Cheddar","q":100,"u":"g","c":"dairy"},
 {"n":"Tinned mushroom soup","q":1,"u":"tin","c":"pantry"},{"n":"Rice","q":2,"u":"cups","c":"pantry"}]',
 'Assembles in 10 minutes with the tinned-soup shortcut. Reheats well — a solid cook-double candidate.'),

-- ---- balanced / high-protein / pregnancy-friendly dinners ----
('grilled-chicken-sweet-potato', 'Grilled chicken, sweet potato & greens', '🍗', 'dinner', 4, '[
 {"n":"Chicken breasts","q":700,"u":"g","c":"meat"},{"n":"Sweet potatoes","q":4,"u":"","c":"veg"},
 {"n":"Green beans","q":300,"u":"g","c":"veg"},{"n":"Broccoli","q":1,"u":"head","c":"veg"},
 {"n":"Olive oil","q":2,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"},
 {"n":"Lemon","q":1,"u":"","c":"veg"}]',
 'Lean protein and slow-release carbs — a solid post-gym plate. Grill or pan the chicken, roast the sweet potato wedges. Cook double and the leftovers are tomorrow''s lunch.'),
('baked-salmon', 'Baked salmon with potatoes & broccoli', '🐟', 'dinner', 4, '[
 {"n":"Salmon fillets","q":600,"u":"g","c":"meat"},{"n":"Baby potatoes","q":600,"u":"g","c":"veg"},
 {"n":"Broccoli","q":1,"u":"head","c":"veg"},{"n":"Lemon","q":1,"u":"","c":"veg"},
 {"n":"Olive oil","q":2,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"},
 {"n":"Butter","q":20,"u":"g","c":"dairy"}]',
 'Omega-3 rich and gentle — great during pregnancy (cooked through, low-mercury fish). 15 min at 200°C; lemon and a little butter is all the sauce it needs.'),
('roast-chicken', 'Roast chicken with roast veg', '🍗', 'dinner', 6, '[
 {"n":"Whole chicken","q":1,"u":"","c":"meat"},{"n":"Potatoes","q":6,"u":"","c":"veg"},
 {"n":"Carrots","q":4,"u":"","c":"veg"},{"n":"Onion","q":2,"u":"","c":"veg"},
 {"n":"Baby marrow","q":3,"u":"","c":"veg"},{"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},
 {"n":"Rosemary","q":1,"u":"sprig","c":"spices"},{"n":"Garlic","q":4,"u":"cloves","c":"veg"}]',
 'Cook once, eat twice: roast on Sunday and the leftover chicken carries salads, wraps and bowls all week. Herbs and garlic only — no heat.'),
('beef-lasagne', 'Beef & vegetable lasagne', '🍝', 'dinner', 6, '[
 {"n":"Beef mince","q":600,"u":"g","c":"meat"},{"n":"Lasagne sheets","q":250,"u":"g","c":"pantry"},
 {"n":"Tinned tomatoes","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Carrots","q":2,"u":"","c":"veg"},{"n":"Baby marrow","q":2,"u":"","c":"veg"},
 {"n":"Garlic","q":3,"u":"cloves","c":"veg"},{"n":"Milk","q":500,"u":"ml","c":"dairy"},
 {"n":"Butter","q":40,"u":"g","c":"dairy"},{"n":"Flour","q":40,"u":"g","c":"pantry"},
 {"n":"Cheddar","q":150,"u":"g","c":"dairy"},{"n":"Mixed herbs","q":1,"u":"tbsp","c":"spices"}]',
 'Grated veg hidden in the ragù. Make two — one for tonight, one for the freezer. Mild oregano and basil, no chilli.'),
('beef-stroganoff', 'Beef stroganoff with rice', '🍲', 'dinner', 4, '[
 {"n":"Beef strips","q":600,"u":"g","c":"meat"},{"n":"Mushrooms","q":250,"u":"g","c":"veg"},
 {"n":"Onion","q":1,"u":"","c":"veg"},{"n":"Cream","q":250,"u":"ml","c":"dairy"},
 {"n":"Beef stock cubes","q":1,"u":"","c":"pantry"},{"n":"Rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Flour","q":1,"u":"tbsp","c":"pantry"},{"n":"Butter","q":30,"u":"g","c":"dairy"},
 {"n":"Parsley","q":1,"u":"handful","c":"veg"}]',
 'Creamy and mild — no paprika needed. Sear the strips fast, build the sauce, done in 20 minutes.'),
('hake-traybake', 'Hake & veg traybake', '🐟', 'dinner', 4, '[
 {"n":"Hake fillets","q":600,"u":"g","c":"frozen"},{"n":"Baby potatoes","q":600,"u":"g","c":"veg"},
 {"n":"Broccoli","q":1,"u":"head","c":"veg"},{"n":"Lemon","q":1,"u":"","c":"veg"},
 {"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"}]',
 'One tray, no washing up: potatoes in first for 20 min, then fish and broccoli for 15 more. Lemon over everything at the end.'),
('tuna-pasta-bake', 'Tuna pasta bake', '🐟', 'dinner', 4, '[
 {"n":"Pasta","q":400,"u":"g","c":"pantry"},{"n":"Tuna","q":3,"u":"tins","c":"pantry"},
 {"n":"Milk","q":400,"u":"ml","c":"dairy"},{"n":"Butter","q":40,"u":"g","c":"dairy"},
 {"n":"Flour","q":40,"u":"g","c":"pantry"},{"n":"Cheddar","q":120,"u":"g","c":"dairy"},
 {"n":"Frozen peas","q":1,"u":"cup","c":"frozen"},{"n":"Sweetcorn","q":1,"u":"tin","c":"pantry"}]',
 'Storecupboard comfort with a protein hit from tinned tuna (cooked, no raw fish). Creamy cheese sauce, 20 min in the oven, reheats brilliantly.'),
('pork-chops-apple', 'Pork chops with apple & mash', '🥩', 'dinner', 4, '[
 {"n":"Pork chops","q":4,"u":"","c":"meat"},{"n":"Apples","q":2,"u":"","c":"veg"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Butter","q":40,"u":"g","c":"dairy"},{"n":"Milk","q":100,"u":"ml","c":"dairy"},
 {"n":"Green beans","q":300,"u":"g","c":"veg"},{"n":"Olive oil","q":1,"u":"tbsp","c":"pantry"}]',
 'Lean pork with sweet softened apple — comforting and mild. Creamy mash and green beans round it out.'),
('lentil-shepherds-pie', 'Lentil shepherd''s pie', '🥧', 'dinner', 4, '[
 {"n":"Brown lentils","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Carrots","q":2,"u":"","c":"veg"},{"n":"Frozen peas","q":1,"u":"cup","c":"frozen"},
 {"n":"Tinned tomatoes","q":1,"u":"tin","c":"pantry"},{"n":"Veg stock cubes","q":1,"u":"","c":"pantry"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Butter","q":40,"u":"g","c":"dairy"},
 {"n":"Milk","q":100,"u":"ml","c":"dairy"},{"n":"Mixed herbs","q":1,"u":"tbsp","c":"spices"}]',
 'Meat-free, iron- and fibre-rich and easy on the stomach — good for the pregnancy weeks. Thyme and herbs, nothing hot.'),
('sweet-sour-stirfry', 'Honey-soy chicken stir-fry', '🥡', 'dinner', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Stir-fry veg mix","q":500,"u":"g","c":"frozen"},
 {"n":"Egg noodles","q":400,"u":"g","c":"pantry"},{"n":"Soy sauce","q":4,"u":"tbsp","c":"pantry"},
 {"n":"Honey","q":2,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"}]',
 'Fifteen-minute dinner if the chicken is sliced on prep day. Sauce = soy + honey + garlic, reduced for 2 minutes — savoury-sweet, no heat.'),

-- ---- lunches ----
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
('couscous-salad', 'Couscous & roast veg salad', '🥙', 'lunch', 4, '[
 {"n":"Couscous","q":2,"u":"cups","c":"pantry"},{"n":"Peppers","q":2,"u":"","c":"veg"},
 {"n":"Courgettes","q":2,"u":"","c":"veg"},{"n":"Red onion","q":1,"u":"","c":"veg"},
 {"n":"Feta","q":1,"u":"round","c":"dairy"},{"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},
 {"n":"Lemon","q":1,"u":"","c":"veg"}]',
 'Roast a big tray of veg once; it carries this salad plus sides for two dinners. Couscous takes 5 minutes — boiling water, cover, done.'),
('chicken-salad-bowl', 'Grilled chicken salad bowl', '🥗', 'lunch', 4, '[
 {"n":"Chicken breasts","q":500,"u":"g","c":"meat"},{"n":"Mixed lettuce","q":1,"u":"bag","c":"veg"},
 {"n":"Cucumber","q":1,"u":"","c":"veg"},{"n":"Cherry tomatoes","q":250,"u":"g","c":"veg"},
 {"n":"Avocado","q":2,"u":"","c":"veg"},{"n":"Feta","q":1,"u":"round","c":"dairy"},
 {"n":"Olive oil","q":3,"u":"tbsp","c":"pantry"},{"n":"Lemon","q":1,"u":"","c":"veg"}]',
 'High protein, low fuss. Grill the chicken on prep day and keep the dressing separate so it stays crisp across three days of lunches.'),
('chicken-rice-bowl', 'Chicken & rice power bowls', '🥣', 'lunch', 4, '[
 {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Rice","q":2,"u":"cups","c":"pantry"},
 {"n":"Sweetcorn","q":1,"u":"tin","c":"pantry"},{"n":"Baby spinach","q":100,"u":"g","c":"veg"},
 {"n":"Carrots","q":2,"u":"","c":"veg"},{"n":"Cucumber","q":1,"u":"","c":"veg"},
 {"n":"Plain yoghurt","q":125,"u":"ml","c":"dairy"},{"n":"Lemon","q":1,"u":"","c":"veg"}]',
 'Balanced macros in one bowl — protein, carbs and veg. Batch the chicken and rice on Sunday, assemble each morning. A yoghurt-lemon drizzle instead of anything hot.'),

-- ---- lunch or light dinner ----
('baked-eggs-spinach', 'Baked eggs with spinach & feta', '🍳', 'any', 4, '[
 {"n":"Eggs","q":8,"u":"","c":"dairy"},{"n":"Baby spinach","q":200,"u":"g","c":"veg"},
 {"n":"Feta","q":1,"u":"round","c":"dairy"},{"n":"Tinned tomatoes","q":1,"u":"tin","c":"pantry"},
 {"n":"Onion","q":1,"u":"","c":"veg"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"},
 {"n":"Bread rolls","q":4,"u":"","c":"bakery"},{"n":"Olive oil","q":1,"u":"tbsp","c":"pantry"}]',
 'Folate-rich spinach and protein-packed eggs — a pregnancy-friendly light dinner or weekend lunch. Wilt the spinach, crack the eggs over, bake till just set. Gentle tomato, nothing hot.')
on conflict (id) do nothing;
