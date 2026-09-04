# SCAN CORE PHASE 0 — instrukcja testu na telefonie (dla właściciela)

Wersja: 2026-09-04. Adres testu: **`{{URL}}`** (kod QR obok). Adres z tunelu jest ważny tylko, gdy Mac
jest włączony i tunel działa; docelowy adres po scaleniu PR: `https://staging.pinguinoai.com/scan-lab/baseline`.

## Co przygotować (5 minut)
- Jeden produkt z **wyraźnym kodem EAN-13** (np. karton mleka) — ten sam produkt we wszystkich scenach z kodem.
  Zapisz sobie 13 cyfr spod kodu — wpiszesz je raz na początku, dzięki temu policzymy błędne odczyty.
- Dodatkowo: puszka, mała butelka, opakowanie błyszczące, opakowanie z porysowanym kodem, drugi produkt z kodem,
  produkt z małym kodem (guma / przyprawa), banan, jabłko, opakowanie Oreo, karton mleka.
- Możliwość przyciemnienia pomieszczenia na 2 sceny.
- Telefon naładowany, bez trybu oszczędzania energii.

## Przebieg (ok. 8 minut na jedno uruchomienie)
1. Otwórz adres. Przeczytaj ekran startowy → **Zaczynamy**.
2. Wpisz model telefonu dokładnie tak, jak go znasz (np. `iPhone 15 Pro Max`, `Galaxy Note10+`) i 13 cyfr kodu → **Dalej**.
3. **Włącz aparat** → zezwól na dostęp. Sprawdź, że na liście wybrana jest **główna kamera tylna**
   (nie ultraszerokokątna, nie tele). Jeśli strona ostrzega o obiektywie ultraszerokokątnym — zmień kamerę. → **Dalej**.
4. Strona sama sprawdzi zoom, latarkę i uruchomi dekoder → **Przejdź do scen**.
5. Każda scena: przeczytaj polecenie, ustaw produkt, **Start**, wykonaj ruch zgodnie z poleceniem przez cały czas
   nagrywania (pasek u góry). Po zapisaniu: **Dalej** (albo **Powtórz**, jeśli coś poszło nie tak, np. produkt wypadł z kadru).
   Sceny, których nie da się wykonać (brak produktu) — **Pomiń**.
6. Ostatnia scena trwa **60 s** (test ciągły) — trzymaj telefon nad dowolnym opakowaniem z kodem.
7. **Podsumowanie** → **Eksportuj wyniki (.zip)** → wyślij plik przez AirDrop / e-mail / komunikator na Maca.
   Nic nie jest wysyłane automatycznie. Rozmiar zwykle 5–30 MB.
8. Po wysłaniu możesz **Usunąć dane tej sesji z telefonu**.

## Trzy uruchomienia (każde = osobny plik .zip)
| # | Urządzenie | Jak otworzyć |
|---|---|---|
| D1 | iPhone 15 Pro Max / iOS 26.6.1 | **Safari**, zwykła karta |
| D2 | iPhone 15 Pro Max / iOS 26.6.1 | **Aplikacja z ekranu początkowego**: w Safari na stronie testu → Udostępnij → *Do ekranu początkowego* → *Dodaj*. Otwórz ikonę **Scan Lab** i przejdź test od początku. Na ekranie „Model telefonu” tryb powinien pokazać `standalone_pwa`. |
| D3 | Samsung Galaxy Note10+ / Android Chrome | **Chrome**, zwykła karta |

Jeśli w trakcie testu iPhone przełączy aplikację w tło (powiadomienie, telefon), strona pokaże komunikat o
zatrzymanym aparacie — wróć do kroku „Włącz aparat”; zapisane sceny nie giną (strona pamięta przerwaną sesję).

## Czego NIE robić
- Nie używaj latarki poza sceną „Słabe światło + latarka”.
- Nie przełączaj kamer w trakcie sceny.
- Nie zamykaj karty przed eksportem.

## Debugowanie po kablu (opcjonalne, NIE wymagane)
iPhone: Ustawienia → Safari → Zaawansowane → *Inspektor www* włączony; Mac: Safari → Programowanie → nazwa iPhone'a →
karta testu. Android: `chrome://inspect` na Macu w Chrome, telefon z włączonym debugowaniem USB.
