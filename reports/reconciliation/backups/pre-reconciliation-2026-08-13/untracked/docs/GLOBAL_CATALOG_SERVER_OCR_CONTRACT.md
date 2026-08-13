# Global Catalog server OCR contract

Automatic GREEN verification is unavailable unless the staging Edge runtime has both
`CATALOG_OCR_VERIFY_URL` and `CATALOG_OCR_VERIFY_KEY`. Browser OCR, customer-editable
`products` rows, and customer OCR evidence can produce only BLUE or RED.

The catalog Edge function calls the verifier with:

- `sessionId`;
- short-lived signed URLs for every archived source image;
- each image MIME type and server-recomputed SHA-256 checksum;
- `expectedPublicSnapshotSha256`, used only to bind the response to the immutable
  owner-product snapshot. It is not sufficient for GREEN by itself.

The verifier must independently OCR the supplied images and return:

```json
{
  "provider": "provider-id",
  "providerVersion": "immutable-model-or-rules-version",
  "overallConfidence": 92,
  "verifiedFields": {
    "sourceProductSnapshotSha256": "64-lowercase-hex",
    "productName": "Original package product name",
    "brand": "Brand or null only when explicitly unbranded",
    "explicitlyUnbranded": false,
    "ean": "normalized digits or null",
    "netQuantityText": "500 g",
    "market": "Polska",
    "nutritionBasis": "per_100g",
    "nutrition": {
      "energyKcal": 123,
      "fat": 4.5,
      "saturatedFat": 2.1,
      "carbohydrate": 18,
      "sugars": 12,
      "protein": 3.4,
      "salt": 0.1,
      "fibre": 1.2
    },
    "ingredientsText": "verbatim normalized label text",
    "allergensText": "verbatim normalized label text"
  }
}
```

The database builds the same JSON object from the source record and requires exact JSONB
equality, matching image checksum sets, matching archive paths, the same account/session,
and confidence of at least 85. A hash echo, partial field set, mismatched label value, or
provider failure cannot create GREEN. It falls closed to BLUE when the complete manual
minimum is valid, otherwise RED.

Attestations are service-owned, immutable to customers, and idempotent by
`(source_session_key, evidence_sha256)`. Duplicate confirmation, manual completion, and
transient retries reuse an exact prior attestation rather than paying for OCR twice.

Catalog verification does not authorize Engine science. Engine use requires a separate,
service-owned mapping bound to an exact verified signoff and a currently active,
Base-approved, Engine-approved, verified Mapper row.
