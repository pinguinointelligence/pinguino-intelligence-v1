# Gellatti Shop product — free Gelato Base Guide (0 €)

Content for the Shop product page. This is copy only: nothing here has been written to the app or the database.

- **Source:** the FINAL v23 base workbook.
- **Scope:** the six base ingredients in 75 countries. It is not the Recipe Library, and it is not a complete ingredient catalogue.
- **The PDF itself is in English**, so both the English and the Polish page say that.

---

## English

**Product title**
Gelato Base Guide — 75 Countries

**Price**
Free · 0 €

**Short description** (card / listing, 111 characters)
Free PDF: the six base ingredients of Gellatti gelato, matched to a specific product in each of 75 countries.

**Full description**
Every gelato starts with its base. This free guide shows which products Gellatti identified in each of 75 countries for
the six base ingredients: whole milk, cream, skim milk powder, sugar, dextrose and tara gum.

Each country page gives you the brand, the exact product name, the pack size and the barcode where the product has one,
with links to where each product was found. A clear tag marks products you would order from a shop abroad.

Open the PDF on your phone or computer, tap your country in the index, and take the list shopping. Then let Gellatti
calculate the base for your machine and your batch size.

**What's inside**
- 75 country pages, one per country, A–Z, with a tappable index and bookmarks
- The same six base ingredients on every page: milk, cream, skim milk powder, sugar, dextrose, tara gum
- Brand, exact product name, pack size, and the barcode (EAN/UPC) where the product has one
- Links to where each product was found
- One page on what each ingredient does and what to check when you buy it
- Notes on products from abroad, fat content, and changing labels

**Coverage statement**
Covers the six base ingredients of the Gellatti gelato base in 75 countries. It does not list every ingredient used in
Gellatti recipes.

**Format**
Digital PDF · 82 pages · English · Edition 1, September 2026 · Free download (0 €)

**Call to action**
Primary button: **Download the free guide**
Secondary link: **Open Gellatti**

**Small print**
Product information was compiled in September 2026 from manufacturer and retailer sources. Availability, prices and
delivery are not guaranteed. Always check the label before you buy.

---

## Polski

**Nazwa produktu**
Przewodnik po bazie gelato — 75 krajów

**Cena**
Za darmo · 0 €

**Krótki opis** (karta / lista, 101 znaków)
Darmowy PDF: sześć składników bazy Gellatti z konkretnym produktem dla każdego z 75 krajów.

**Pełny opis**
Każde gelato zaczyna się od bazy. Ten darmowy przewodnik pokazuje, jakie produkty Gellatti wskazało w każdym z 75 krajów
dla sześciu składników bazy: mleka pełnego, śmietanki, mleka odtłuszczonego w proszku, cukru, dekstrozy i gumy tara.

Na stronie każdego kraju znajdziesz markę, dokładną nazwę produktu, wielkość opakowania i kod kreskowy (jeśli produkt go
ma) oraz linki do miejsc, w których produkt znaleziono. Wyraźne oznaczenie pokazuje produkty zamawiane ze sklepu za granicą.

Otwórz PDF w telefonie lub na komputerze, wybierz swój kraj w spisie i idź z listą na zakupy. Potem Gellatti policzy bazę
dla Twojej maszyny i wielkości partii.

**W środku**
- 75 stron krajów, po jednej na kraj, od A do Z, z klikalnym spisem i zakładkami
- Te same sześć składników bazy na każdej stronie: mleko, śmietanka, mleko odtłuszczone w proszku, cukier, dekstroza, guma tara
- Marka, dokładna nazwa produktu, wielkość opakowania i kod kreskowy (EAN/UPC), jeśli produkt go ma
- Linki do miejsc, w których produkt znaleziono
- Strona o tym, co robi każdy składnik i na co zwrócić uwagę przy zakupie
- Uwagi o produktach z zagranicy, zawartości tłuszczu i zmianach etykiet

**Zakres**
Obejmuje sześć składników bazy gelato Gellatti w 75 krajach. Nie zawiera wszystkich składników używanych w recepturach
Gellatti.

**Format**
PDF · 82 strony · w języku angielskim · wydanie 1, wrzesień 2026 · do pobrania za darmo (0 €)

**Przycisk**
Główny: **Pobierz darmowy przewodnik**
Dodatkowy link: **Otwórz Gellatti**

**Drobny druk**
Informacje o produktach zebrano we wrześniu 2026 r. ze źródeł producentów i sprzedawców. Dostępność, ceny i dostawa nie są
gwarantowane. Przed zakupem zawsze sprawdź etykietę.

---

## Cover and thumbnail

The images are rendered from the PDF cover design:
- `cover_thumb_4x5.png` (1200 × 1500): the Shop's product frame is 4:5.
- `cover_square_1080.png` (1080 × 1080): for listings and social posts.

The images use the Gellatti tokens (#F0C44C accent, graphite, warm neutrals) and the graphite wordmark on white. Keep the
6 px safe margin of the Shop frame clear of text.

## Proposed product record (not applied)

```json
{
  "sku": "GEL-BASE-GUIDE-75",
  "slug": "gelato-base-guide-75",
  "title": "Gelato Base Guide — 75 Countries",
  "priceCents": 0,
  "currency": "eur",
  "availability": "in_stock",
  "packSizeG": null,
  "allergens": [],
  "imageUrl": "/shop/base-guide-cover.png",
  "file": "GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf"
}
```

## Integration questions for the owner (not blockers for the PDF)

1. **Product kind.** The Shop's product contract knows only `single` and `bundle`. A downloadable file needs either a new
   kind or a separate free-download block. This is a Shop architecture decision, so nothing was changed.
2. **Where the file lives.** It could be a public asset or storage with a link sent by email. The Local Starter Pack
   already sends a link by email, never an attachment.
3. **Sign-in before download.** Decide whether the download should require sign-in, for example to capture leads.
4. **Two free PDFs.** The Local Starter Pack (0 €) is a different product: local alternatives for the Starter Pack
   components. This guide covers the six base ingredients. Name and place the two so customers can tell them apart.
