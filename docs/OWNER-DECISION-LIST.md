# OWNER DECISION LIST

Questions that came up during implementation, were not determined by an accepted
design, and did not block the work. Each entry says what was shipped in the
meantime and what decision is still owed.

## GEL-MENU-01 — what „Pomoc" actually offers

**Raised:** 2026-09-19, while reconciling the global menu with DESIGN V3.0.
**Status:** OPEN — does not block the menu.

The accepted signed-in menu carries „Pomoc" as a separate entry from „Dlaczego to
dziala?": knowledge explains, support fixes. The app had **no** help destination at
all — no route, no page, no copy key — so the entry had nothing to point at.

To ship the accepted structure, `/help` now exists as a real destination that
invents no support system: it routes to `info@gellatti.com`, the mailbox the app
already uses for partner applications and cooperation, and links across to the
knowledge destination for questions that are not problems.

**The decision still owed:** what Pomoc should really be — a mailbox, a form that
files a ticket like the franchise inquiry does, a FAQ, or a link to something
outside the app. Until that is decided the page stays deliberately thin; it is
honest, not finished.

**Not decided here:** the Polish copy on the page is placeholder-grade and should be
reviewed with the rest of the support voice.
