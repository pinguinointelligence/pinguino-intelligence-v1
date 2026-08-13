# Future Global Catalog Admin queue contract

The customer-facing catalog has only VERIFIED, MANUAL/UNVERIFIED, and BLOCKED product
states. Admin workflow state is separate and service-only.

The future Admin UI must consume the existing review tables without reconstructing source
evidence. A case exposes:

- one stable consolidation key and catalog product;
- kind: manual-unverified, duplicate dispute, verification failure, correction, conflict,
  or suspicious activity;
- priority, workflow status, submission count, markets, exact missing fields, and timestamps;
- normalized public candidate data;
- ranked duplicate candidates and the customer's concrete distinguishing evidence;
- latest archived image paths plus links to every contributing immutable submission;
- audit events and current/prior catalog version identifiers.

The Admin UI must not expose submitter identity publicly or copy private price, supplier,
notes, stock, purchase history, or recipe use into shared facts. Reviewer actions must be
service/admin-only, append an audit event, create a new immutable product version, and never
mutate Mapper Basement automatically.

Required future actions are: compare evidence, request more evidence, merge a duplicate,
confirm a distinct variant, correct public facts, verify/reject, revoke an Engine mapping,
and close/reopen a case. Full Admin UI is intentionally out of scope for the catalog launch.
