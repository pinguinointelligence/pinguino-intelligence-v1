# PINGUINO Intelligence — User Flow v1.0 FINAL

**Folder name:** `User Flow`  
**Status:** LOCKED USER / ACCESS / ONBOARDING FLOW  
**Purpose:** define how PINGUINO asks the user what they want to make, how it detects product type, how demo vs paid access works, and how first-use defaults are saved.  
**Audience:** Nicolas / implementation AI / UI / API / internal documentation  
**Rule:** the user flow must stay simple, product-language-first and never ask technical engine questions.

This document belongs to the active PINGUINO folder structure:

```text
Calculation Source of Truth
Core Backbone
Product Profile
Recipe Intent
Designer
User Flow
Temperature Regulator
Optimizer
Integration Flow
Acceptance Tests
```

Do not mention external tool/product names in code, prompts, UI or documentation. Use neutral wording such as **calibration data** or **reference dataset** only where needed.

---

# 1. Master UX rule

```text
Start with flavor / product desire.
Do not start with price.
Do not start with technical numbers.
Do not ask the customer about PAC, POD, NPAC, lactose sanding or protein-in-solids.
```

The first message should be:

```text
Jakie lody dziś robimy?
```

Equivalent English:

```text
What are we making today?
```

---

# 2. Demo and paid flow are almost the same

The conversation flow should be the same for Demo and Paid users.

Difference:

```text
Demo / Free:
  - may go through the same questions
  - may see product profile, direction, warnings and general guidance
  - may save preferences
  - must not see exact ingredient gram amounts
  - must not see exact Auto Fix gram corrections

Paid:
  - sees exact recipe grams
  - sees exact Auto Fix
  - can save full recipes
  - can use production/batch rescue
  - can use exact correction workflow
```

Demo may store:

```text
product preferences
serving temperature
texture preference
sweetness preference
quality tier
booster availability preference
batch-size preference if allowed
```

Demo must not reveal:

```text
exact grams per ingredient
exact correction grams
exact before/after correction values if locked behind paid plan
```

---

# 3. First question

Always start:

```text
Jakie lody dziś robimy?
```

Do not start:

```text
Jaki masz budżet?
Ile ma kosztować?
Jaki PAC chcesz?
Jaki NPAC chcesz?
```

The user may answer:

```text
czekoladowe
pistacjowe
truskawkowe
mango sorbet
vegan chocolate
proteinowe
waniliowe
```

The system should first understand the product/flavor.

---

# 4. Automatic product recognition

PINGUINO should automatically detect the likely product profile from the user's answer.

## 4.1 Chocolate

User says:

```text
czekoladowe
czekolada
dark chocolate
chocolate
kakao
cacao
gianduja
```

System response:

```text
OK, robimy Chocolate Gelato. Zgadza się?
```

If user confirms:

```text
Tak.
```

Continue to batch size.

If user says no:

```text
Nie.
```

Then ask:

```text
Jasne — jakie dokładnie chcesz zrobić?
- Gelato
- Sorbet
- Vegan Gelato
- Proteinowe
```

Then show short explanation if needed.

## 4.2 Sorbet

User says:

```text
sorbet
mango sorbet
truskawkowy sorbet
owocowy sorbet
bez mleka, na wodzie
```

System response:

```text
OK, robimy Sorbet. Zgadza się?
```

If user confirms, continue.

## 4.3 Vegan

User says:

```text
vegan
wegańskie
plant based
bez mleka
bez śmietanki
bez nabiału
```

System response:

```text
OK, robimy Vegan Gelato. Zgadza się?
```

If user says:

```text
vegan chocolate
wegańskie czekoladowe
```

System must keep:

```text
productProfile = vegan_gelato
flavorGroup = chocolate
```

Do not route vegan chocolate to dairy Chocolate Gelato.

## 4.4 Protein

User says:

```text
proteinowe
high protein
więcej proteiny
białkowe
```

System response v1.0:

```text
Rozumiem — chodzi o lody proteinowe, czyli recepturę z większym udziałem białka.
Ten profil wymaga osobnego profilu Protein Gelato. W v1.0 mogę to rozpoznać jako intencję proteinową, ale pełne liczenie proteinowego profilu wymaga osobnego modułu, jeśli go aktywujemy.
```

Important:

```text
Protein is recognized as intent.
Protein Gelato is not silently calculated as Standard Gelato unless explicitly supported by Product Profile / Designer / Temperature Regulator / Optimizer.
```

If business decides to support Protein Gelato, then these documents must be updated:

```text
Product Profile
Recipe Intent
Designer
Temperature Regulator
Optimizer
Integration Flow
Acceptance Tests
```

Do not quietly add Protein logic only in User Flow.

## 4.5 Standard Gelato

If user says:

```text
waniliowe
pistacjowe
truskawkowe
kawowe
fior di latte
mleczne
classic gelato
```

and no other product profile is specified:

```text
OK, robimy Gelato. Zgadza się?
```

For chocolate specifically, use Chocolate Gelato.

---

# 5. Product type explanation

If the user does not understand the product type or rejects the automatic detection, explain simply:

```text
Gelato — klasyczne kremowe lody, najczęściej na bazie mleka i śmietanki.

Chocolate Gelato — gelato czekoladowe, z osobną logiką dla kakao/czekolady, bo czekolada zmienia strukturę, tłuszcz, słodycz i odczucie.

Sorbet — lody owocowe bez mleka, zwykle na bazie owocu, wody, cukrów, błonnika i stabilizatora.

Vegan Gelato — kremowe lody roślinne bez mleka i śmietanki, np. na bazie napoju owsianego, kokosa, roślinnego tłuszczu i błonnika.

Proteinowe — lody z większym udziałem białka; wymagają osobnego profilu proteinowego, jeśli mają być liczone jako pełny produkt technologiczny.
```

Keep explanation short.  
Do not overload user with technical metrics.

---

# 6. Question order for first paid user without saved defaults

After product recognition and confirmation:

## Step 1

```text
Jakie lody dziś robimy?
```

Example user answer:

```text
Czekoladowe.
```

System:

```text
OK, robimy Chocolate Gelato. Zgadza się?
```

User:

```text
Tak.
```

## Step 2 — batch size

```text
Ile chcesz zrobić lodów?
Możesz wybrać:
- 1 kg
- 5 kg
- 10 kg
- 25 kg
- 50 kg
- własna gramatura końcowa
```

Alternative wording:

```text
Określ końcową gramaturę partii.
```

This becomes:

```text
target_batch_grams
```

## Step 3 — serving temperature

```text
W jakiej temperaturze mają być podawane?
- −11°C
- −12°C
- −13°C
```

Default:

```text
Jeśli nie wiesz, ustawimy standardowo −12°C.
```

Business can later set default to −11°C for a specific machine or shop, but the default must be explicit and saved as preference.

## Step 4 — texture

```text
Jaka tekstura?
- twarde
- średnie
- miękkie
```

Mapping:

```text
twarde -> firm
średnie -> medium
miękkie -> soft
```

## Step 5 — sweetness

```text
Jaka słodycz?
- mało słodkie
- słodkie
- bardzo słodkie
```

Mapping:

```text
mało słodkie -> low
słodkie -> balanced
bardzo słodkie -> high
```

Do not ask:

```text
low / balanced / high sweetness
```

in technical language if the UI is in Polish.

## Step 6 — recipe style

```text
Jaki styl receptury chcesz?
- Eco — najniższy koszt, ale technicznie poprawne
- Classic — standardowa dobra receptura
- Premium — więcej realnego składnika i lepsza struktura
- Signature — najlepszy efekt smaku i jakości
```

Do not start the whole flow with cost.

Cost enters here as recipe style.

## Step 7 — boosters / pastes / concentrates

Ask availability and intent, not permission in abstract.

Correct wording:

```text
Czy masz jakieś boostery, pasty albo koncentraty, które chcesz użyć?
```

Options:

```text
Nie
Tak — wybiorę z moich produktów
Tak — dodam produkt ręcznie / zeskanuję
System może zaproponować tylko, jeśli mam taki produkt zapisany
```

Why:

```text
It makes no sense to ask "Can I use boosters?" if the customer does not have them.
```

Rules:

- if user has no boosters/pastes/concentrates, do not rely on them
- if user has them, product data must come from products/Mapper data
- AI must not invent their composition
- Designer carries this as availability/strategy
- Optimizer can use them only if verified/usable and allowed

## Step 8 — save defaults

```text
Zapisać te ustawienia jako domyślne?
```

Save:

```text
product profile preference
serving temperature
texture
sweetness
quality tier
cost priority
booster/paste/concentrate preference
batch size if user wants
dietary/allergen settings if present
```

Do not save:

```text
exact ingredient grams as default preferences
```

Exact recipe grams belong to saved recipes, not preference defaults.

---

# 7. Returning paid user with saved defaults

If defaults exist:

```text
Jakie lody dziś robimy?
```

User:

```text
Pistacjowe.
```

System:

```text
Użyję Twoich zapisanych ustawień:
Classic, −12°C, średnia tekstura, słodkie, 10 kg.
Robimy Gelato pistacjowe. Chcesz coś zmienić?
```

If user says no:

```text
calculate / design recipe
```

If user says yes:

```text
ask only the changed preference
```

Do not ask the full onboarding again unless user requests.

---

# 8. Demo user flow

Demo uses the same question order:

```text
Jakie lody dziś robimy?
OK, robimy Chocolate Gelato. Zgadza się?
Ile chcesz zrobić?
Temperatura?
Tekstura?
Słodycz?
Styl receptury?
Czy masz boostery/pasty/koncentraty?
Zapisać ustawienia?
```

Demo output may show:

```text
product profile
recipe direction
technology warnings
serving temperature fit
general correction direction
quality style
whether exact recipe is available in paid plan
```

Demo output must not show:

```text
exact ingredient grams
exact Auto Fix grams
exact correction actions
exact before/after hidden correction values
```

Example demo output:

```text
Profil: Chocolate Gelato
Styl: Classic
Temperatura: −12°C
Kierunek: receptura powinna mieć wyższą kontrolę struktury i balans słodyczy, bo czekolada zwiększa tłuszcz i suche substancje.
Pełna gramatura i Auto Fix są dostępne w Pro.
```

Do not output:

```text
Milk 600 g
Cream 135 g
Dextrose 80 g
Add 34.7 g sucrose
```

---

# 9. Paid output

Paid output may show:

```text
exact recipe grams
full ingredient list
exact batch size
exact cost
exact nutrition if available
Temperature Regulator result
Auto Fix
before/after values
batch rescue details
saved recipe
```

Paid user can use:

```text
full recipe generation
exact Auto Fix
actual batch mode
production rescue
stock shortage flow
saved recipes
```

---

# 10. Access-level gates

Suggested access model:

```ts
type AccessLevel =
  | "demo"
  | "paid";
```

Optional future paid plans can exist, but the core technical access split is:

```text
demo = redacted grams
paid = exact grams
```

Suggested access capabilities:

```ts
interface AccessCapabilities {
  canViewExactRecipeGrams: boolean;
  canViewExactCorrectionGrams: boolean;
  canUseAutoFix: boolean;
  canSavePreferences: boolean;
  canSaveFullRecipes: boolean;
  canUseActualBatchRescue: boolean;
  canUseStockShortageWorkflow: boolean;
}
```

Demo:

```ts
{
  canViewExactRecipeGrams: false,
  canViewExactCorrectionGrams: false,
  canUseAutoFix: false,
  canSavePreferences: true,
  canSaveFullRecipes: false,
  canUseActualBatchRescue: false,
  canUseStockShortageWorkflow: false
}
```

Paid:

```ts
{
  canViewExactRecipeGrams: true,
  canViewExactCorrectionGrams: true,
  canUseAutoFix: true,
  canSavePreferences: true,
  canSaveFullRecipes: true,
  canUseActualBatchRescue: true,
  canUseStockShortageWorkflow: true
}
```

---

# 11. What to save as defaults

Preferences:

```text
product profile preference
quality tier
serving temperature
texture
sweetness
cost priority
batch size preference if user chooses
booster/paste/concentrate preference
dietary/allergen restrictions
```

Do not save as preference defaults:

```text
final ingredient grams
Auto Fix corrections
one-time stock shortage decisions
one-time actual-batch rescue decisions
```

Those belong to:

```text
saved recipe
production batch log
actual batch record
```

---

# 12. Product recognition rules

## Chocolate

```text
chocolate/czekoladowe/kakao -> Chocolate Gelato by default
```

Ask confirmation:

```text
OK, robimy Chocolate Gelato. Zgadza się?
```

## Fruit

```text
truskawkowe/mango/malinowe/bananowe -> Gelato by default unless user says sorbet or vegan
```

Ask:

```text
OK, robimy Gelato {flavor}. Zgadza się?
```

If fruit + sorbet:

```text
OK, robimy Sorbet {flavor}. Zgadza się?
```

## Vegan

Explicit vegan wins.

## Sorbet

Explicit sorbet wins.

## Protein

Recognize protein intent. Do not silently calculate as supported full profile unless Product Profile supports it.

## Alcohol

Recognize alcohol as flavor/constraint. Keep product profile based on user phrase, usually standard_gelato unless future alcohol profile is added.

---

# 13. User-decision branch after rejection

If system says:

```text
OK, robimy Chocolate Gelato. Zgadza się?
```

and user says:

```text
Nie.
```

Ask:

```text
Jasne — jakie dokładnie chcesz zrobić?

- Gelato — klasyczne kremowe lody na bazie mleka/śmietanki.
- Sorbet — owocowe, bez mleka, na bazie owocu i wody.
- Vegan Gelato — kremowe, ale roślinne, bez mleka i śmietanki.
- Proteinowe — z większym udziałem białka; wymaga profilu proteinowego.
```

Then route according to selection.

---

# 14. Required UI tone

Tone should be:

```text
short
clear
human
non-technical
confident
```

Avoid:

```text
PAC
NPAC
MSNF
lactose sanding
protein in solids
freezing depression
unless user is in expert mode
```

The system may use technical terms only in expert/pro technical panels, not in first onboarding questions.

---

# 15. Expert mode

Future optional mode:

```text
Expert mode
```

Can show:

```text
POD
PAC
NPAC
ice fraction
lactose sanding
protein share
water/solids/fat
```

But default user flow should not ask for these values.

Expert mode must still not allow AI to invent numbers.

---

# 16. Acceptance tests

## First question

1. First message is `Jakie lody dziś robimy?`
2. System does not start with price.
3. System does not start with technical metrics.

## Chocolate recognition

4. `czekoladowe` routes to `chocolate_gelato`.
5. System says `OK, robimy Chocolate Gelato. Zgadza się?`
6. If user confirms, next question is batch size.
7. If user rejects, system asks product type clarification.

## Product explanation

8. Gelato explanation is short and non-technical.
9. Sorbet explanation says fruit/water/no milk.
10. Vegan explanation says plant-based/no milk/cream.
11. Protein explanation says higher protein and requires active profile if full calculation is supported.

## Batch size

12. Batch size is asked before final recipe generation.
13. Options include 1 kg, 5 kg, 10 kg, 25 kg, 50 kg and custom final gram amount.
14. Batch size maps to `target_batch_grams`.

## Temperature

15. User can choose −11°C, −12°C or −13°C.
16. If unknown, default is explicit, normally −12°C unless saved preference says otherwise.

## Texture

17. Texture options are twarde / średnie / miękkie.
18. They map to firm / medium / soft.

## Sweetness

19. Sweetness options are mało słodkie / słodkie / bardzo słodkie.
20. They map to low / balanced / high.

## Recipe style

21. Style options are Eco / Classic / Premium / Signature.
22. Style is not asked before flavor.
23. Cost is not the first question.

## Boosters / pastes / concentrates

24. Question asks if the user has and wants to use boosters/pastes/concentrates.
25. System does not assume user has them.
26. If user has them, product data must be verified/available.
27. AI does not invent booster composition.

## Defaults

28. System asks whether to save defaults.
29. Paid user can save preferences.
30. Demo user can save preferences.
31. Exact recipe grams are not saved as defaults.

## Demo

32. Demo follows same question flow.
33. Demo does not show ingredient grams.
34. Demo does not show exact Auto Fix grams.
35. Demo may show product profile and general guidance.

## Paid

36. Paid shows exact grams.
37. Paid can use Auto Fix.
38. Paid can use production rescue.
39. Paid can save full recipe.

---

# 17. Final lock statement

```text
User Flow starts with product desire, not price.
PINGUINO should recognize obvious intent automatically, especially chocolate -> Chocolate Gelato.
If the user disagrees, explain product types simply and ask what they mean.
Batch size, serving temperature, texture, sweetness, recipe style and available boosters follow.
Demo and Paid use the same flow, but Demo hides exact gramature and exact Auto Fix.
If a rule is missing, stop and ask.
```
