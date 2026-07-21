-- Meal Prep recipe refresh (2026-07): mild, balanced, high-protein +
-- pregnancy-friendly. Removes the spicy/curry dishes, de-spices the stir-fry,
-- and adds 11 new meals. No chilli/curry/masala, no shellfish, no raw fish.
--
-- Safe to run in the Supabase SQL editor against project objkdeagyltvgcuxsnxu.
-- Idempotent: re-running it just re-applies the same state.

-- 1. Remove the spicy dishes (cascades to any planned slots that used them).
delete from mealprep_recipes
 where id in ('bobotie','chicken-breyani','curried-mince','bean-curry',
              'chicken-sosaties','lentil-bobotie','chakalaka-bowls');

-- 2. Rework the old sweet & sour into a mild honey-soy stir-fry (keep the id
--    so any week already planning it stays valid).
update mealprep_recipes set
  name = 'Honey-soy chicken stir-fry',
  emoji = '🥡',
  ingredients = '[
    {"n":"Chicken breasts","q":600,"u":"g","c":"meat"},{"n":"Stir-fry veg mix","q":500,"u":"g","c":"frozen"},
    {"n":"Egg noodles","q":400,"u":"g","c":"pantry"},{"n":"Soy sauce","q":4,"u":"tbsp","c":"pantry"},
    {"n":"Honey","q":2,"u":"tbsp","c":"pantry"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"}]'::jsonb,
  notes = 'Fifteen-minute dinner if the chicken is sliced on prep day. Sauce = soy + honey + garlic, reduced for 2 minutes — savoury-sweet, no heat.',
  updated_at = now()
 where id = 'sweet-sour-stirfry';

-- 3. Add the new balanced meals.
insert into mealprep_recipes (id, name, emoji, meal_type, serves, ingredients, notes) values
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
('baked-eggs-spinach', 'Baked eggs with spinach & feta', '🍳', 'any', 4, '[
 {"n":"Eggs","q":8,"u":"","c":"dairy"},{"n":"Baby spinach","q":200,"u":"g","c":"veg"},
 {"n":"Feta","q":1,"u":"round","c":"dairy"},{"n":"Tinned tomatoes","q":1,"u":"tin","c":"pantry"},
 {"n":"Onion","q":1,"u":"","c":"veg"},{"n":"Garlic","q":2,"u":"cloves","c":"veg"},
 {"n":"Bread rolls","q":4,"u":"","c":"bakery"},{"n":"Olive oil","q":1,"u":"tbsp","c":"pantry"}]',
 'Folate-rich spinach and protein-packed eggs — a pregnancy-friendly light dinner or weekend lunch. Wilt the spinach, crack the eggs over, bake till just set. Gentle tomato, nothing hot.'),
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
('tuna-pasta-bake', 'Tuna pasta bake', '🐟', 'dinner', 4, '[
 {"n":"Pasta","q":400,"u":"g","c":"pantry"},{"n":"Tuna","q":3,"u":"tins","c":"pantry"},
 {"n":"Milk","q":400,"u":"ml","c":"dairy"},{"n":"Butter","q":40,"u":"g","c":"dairy"},
 {"n":"Flour","q":40,"u":"g","c":"pantry"},{"n":"Cheddar","q":120,"u":"g","c":"dairy"},
 {"n":"Frozen peas","q":1,"u":"cup","c":"frozen"},{"n":"Sweetcorn","q":1,"u":"tin","c":"pantry"}]',
 'Storecupboard comfort with a protein hit from tinned tuna (cooked, no raw fish). Creamy cheese sauce, 20 min in the oven, reheats brilliantly.'),
('lentil-shepherds-pie', 'Lentil shepherd''s pie', '🥧', 'dinner', 4, '[
 {"n":"Brown lentils","q":2,"u":"tins","c":"pantry"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Carrots","q":2,"u":"","c":"veg"},{"n":"Frozen peas","q":1,"u":"cup","c":"frozen"},
 {"n":"Tinned tomatoes","q":1,"u":"tin","c":"pantry"},{"n":"Veg stock cubes","q":1,"u":"","c":"pantry"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Butter","q":40,"u":"g","c":"dairy"},
 {"n":"Milk","q":100,"u":"ml","c":"dairy"},{"n":"Mixed herbs","q":1,"u":"tbsp","c":"spices"}]',
 'Meat-free, iron- and fibre-rich and easy on the stomach — good for the pregnancy weeks. Thyme and herbs, nothing hot.'),
('pork-chops-apple', 'Pork chops with apple & mash', '🥩', 'dinner', 4, '[
 {"n":"Pork chops","q":4,"u":"","c":"meat"},{"n":"Apples","q":2,"u":"","c":"veg"},
 {"n":"Potatoes","q":6,"u":"","c":"veg"},{"n":"Onion","q":1,"u":"","c":"veg"},
 {"n":"Butter","q":40,"u":"g","c":"dairy"},{"n":"Milk","q":100,"u":"ml","c":"dairy"},
 {"n":"Green beans","q":300,"u":"g","c":"veg"},{"n":"Olive oil","q":1,"u":"tbsp","c":"pantry"}]',
 'Lean pork with sweet softened apple — comforting and mild. Creamy mash and green beans round it out.')
on conflict (id) do update set
  name = excluded.name, emoji = excluded.emoji, meal_type = excluded.meal_type,
  serves = excluded.serves, ingredients = excluded.ingredients, notes = excluded.notes,
  updated_at = now();
