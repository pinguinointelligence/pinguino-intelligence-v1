import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

export type ProductPickerVerificationStatus =
  | 'PINGÜINO — SPRAWDZONY'
  | 'Dane szacowane'
  | 'SYSTEM — DOPASOWANY'
  | 'DODANY PRZEZ UŻYTKOWNIKA'
  | 'WYMAGA SPRAWDZENIA ETYKIETY'
  | 'MAPPER BINDING REQUIRED'
  | 'PRODUCT DATA INCOMPLETE';

export interface ProductPickerVerificationView {
  status: ProductPickerVerificationStatus;
  reason: string | null;
}

const hasProductOwnedEngineProfile = (hit: CatalogProductSearchHit): boolean => {
  if (hit.entityKind !== 'commercial_product') return false;
  const intelligence =
    hit.publicData.productIntelligence && typeof hit.publicData.productIntelligence === 'object'
      ? (hit.publicData.productIntelligence as Record<string, unknown>)
      : {};
  return (
    intelligence.engineUsable === true &&
    hit.publicData.technicalComposition !== null &&
    typeof hit.publicData.technicalComposition === 'object'
  );
};

export const isProductPickerSelectionCurrent = (input: {
  serverSearch: boolean;
  serverSettled: boolean;
  localOption: boolean;
}): boolean => !input.serverSearch || input.localOption || input.serverSettled;

const DEFECT_LABELS: Record<string, string> = {
  nutrition_basis_per_100ml_requires_density_for_gram_topping:
    'wartości odżywcze na 100 ml bez zweryfikowanej gęstości',
  ingredients_text: 'deklaracja składników',
  allergens_text: 'deklaracja alergenów',
  nutrition_energyKcal: 'wartość energetyczna',
  nutrition_fat: 'tłuszcz',
  nutrition_carbohydrate: 'węglowodany',
  nutrition_protein: 'białko',
  nutrition_salt: 'sól',
  net_quantity_unit: 'ilość netto i jednostka',
  market_of_sale: 'rynek sprzedaży',
};

const defectLabel = (value: string): string => DEFECT_LABELS[value] ?? 'nieopisane pole danych';

const exactPickerSubject = (
  hit: CatalogProductSearchHit,
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
): string =>
  `Produkt ${hit.displayName} · ID ${hit.id} · wersja ${hit.currentVersionId ?? 'brak'} · Mapper ${hit.mappedIngredientId ?? 'brak'} · moduł ${scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING'}`;

export const exactProductPickerTechnicalReason = (
  hit: CatalogProductSearchHit,
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
  field: string,
  action: string,
): string => `${exactPickerSubject(hit, scope)} · pole ${field}. ${action}`;

const exactPickerBlock = exactProductPickerTechnicalReason;

/**
 * Truthful per-row verification projection. Search remains server-authoritative;
 * this helper only translates the returned, versioned binding facts into the
 * compact status vocabulary used by the existing picker.
 */
export function productPickerVerificationView(
  hit: CatalogProductSearchHit,
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON' = 'BASE_FORMULATION',
): ProductPickerVerificationView {
  if (hit.entityKind === 'pi_base') {
    if (hit.currentVersionId === null || hit.currentVersionId === undefined) {
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: exactPickerBlock(
          hit,
          scope,
          'currentVersionId',
          'Odśwież produkt i utwórz aktualną wersję.',
        ),
      };
    }
    if (!hit.mappedIngredientId) {
      return {
        status: 'MAPPER BINDING REQUIRED',
        reason: exactPickerBlock(
          hit,
          scope,
          'mappedIngredientId',
          'Wybierz dokładne powiązanie Mapper.',
        ),
      };
    }
    const usable = scope === 'BASE_FORMULATION' ? hit.usableInBase : hit.usableAsTopping;
    if (!usable) {
      const approvalMissing = hit.blockedReason?.includes('Brak zatwierdzenia') === true;
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: approvalMissing
          ? exactPickerBlock(
              hit,
              scope,
              scope === 'BASE_FORMULATION' ? 'approved_for_base' : 'TOPPING permission',
              `Powód serwera: ${hit.blockedReason}. Wybierz produkt zatwierdzony dla tego modułu.`,
            )
          : exactPickerBlock(
              hit,
              scope,
              'module eligibility',
              hit.blockedReason
                ? `Powód serwera: ${hit.blockedReason}. Wybierz kwalifikowany produkt.`
                : 'Wybierz kwalifikowany produkt.',
            ),
      };
    }
    if (hit.verificationMethod === 'mapper_estimated') {
      return {
        status: 'Dane szacowane',
        reason:
          'Produkt ma techniczne dane Mappera, ale źródło nie zostało jeszcze zweryfikowane na podstawie aktualnej etykiety.',
      };
    }
    if (hit.verificationMethod === 'mapper_needs_label_review') {
      return {
        status: 'WYMAGA SPRAWDZENIA ETYKIETY',
        reason:
          'Status źródła wymaga sprawdzenia etykiety. Produkt pozostaje dostępny technicznie.',
      };
    }
    if (hit.verificationMethod === 'mapper_other') {
      return {
        status: 'SYSTEM — DOPASOWANY',
        reason: 'Źródło produktu pozostaje informacją; użycie techniczne wynika z danych Mappera.',
      };
    }
    return { status: 'PINGÜINO — SPRAWDZONY', reason: null };
  }

  if (hit.currentVersionId === null || hit.currentVersionId === undefined) {
    return {
      status: 'PRODUCT DATA INCOMPLETE',
      reason: exactPickerBlock(
        hit,
        scope,
        'currentVersionId',
        'Odśwież produkt i utwórz aktualną wersję.',
      ),
    };
  }
  if (scope === 'POST_PROCESS_ADDON') {
    if (!hit.usableAsTopping) {
      const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: exactPickerBlock(
          hit,
          scope,
          defects.length > 0 ? defects.join(', ') : 'TOPPING eligibility',
          hit.blockedReason
            ? `Powód serwera: ${hit.blockedReason}. Uzupełnij dane albo wybierz inny produkt.`
            : 'Uzupełnij dane albo wybierz inny produkt.',
        ),
      };
    }
    if (hit.verificationMethod === 'mapper_estimated') {
      return {
        status: 'Dane szacowane',
        reason:
          'Produkt ma techniczne dane Mappera, ale źródło pozostaje szacowane. Etykieta końcowa może nadal wymagać uzupełnienia.',
      };
    }
    if (
      hit.verificationMethod === 'mapper_needs_label_review' ||
      hit.status === 'blocked' ||
      hit.missingFields.length > 0 ||
      hit.invalidFields.length > 0
    ) {
      return {
        status: 'WYMAGA SPRAWDZENIA ETYKIETY',
        reason:
          'Stan etykiety pozostaje informacją i nie blokuje technicznego Toppingu z dokładnym Mapperem; Label może pozostać zablokowany.',
      };
    }
    return hit.status === 'verified'
      ? { status: 'PINGÜINO — SPRAWDZONY', reason: null }
      : hit.provenance === 'automatic_verified' || hit.verificationMethod === 'automatic'
        ? { status: 'SYSTEM — DOPASOWANY', reason: null }
        : { status: 'DODANY PRZEZ UŻYTKOWNIKA', reason: null };
  }
  if (!hit.mappedIngredientId && !hasProductOwnedEngineProfile(hit)) {
    return {
      status: 'MAPPER BINDING REQUIRED',
      reason: exactPickerBlock(
        hit,
        scope,
        'product-owned profile / mappedIngredientId',
        'Utwórz gotowy profil produktu albo wybierz dokładne powiązanie Mapper.',
      ),
    };
  }
  if (!hit.usableInBase) {
    return {
      status: 'PRODUCT DATA INCOMPLETE',
      reason: exactPickerBlock(
        hit,
        scope,
        'approved_for_base / profile eligibility',
        hit.blockedReason
          ? `Powód serwera: ${hit.blockedReason}. Zmień produkt lub profil.`
          : 'Zmień produkt lub profil.',
      ),
    };
  }
  if (hit.status === 'verified') return { status: 'PINGÜINO — SPRAWDZONY', reason: null };
  if (hit.provenance === 'automatic_verified' || hit.verificationMethod === 'automatic') {
    return { status: 'SYSTEM — DOPASOWANY', reason: null };
  }
  return { status: 'DODANY PRZEZ UŻYTKOWNIKA', reason: null };
}

/**
 * Module-neutral catalogue truth. A general product page must not project a
 * BASE-ready product through the TOPPING gate (or the inverse). Module-specific
 * pickers continue to use `productPickerVerificationView` with their real scope.
 */
export function productCatalogOverviewVerificationView(
  hit: CatalogProductSearchHit,
): ProductPickerVerificationView {
  if (hit.currentVersionId === null || hit.currentVersionId === undefined) {
    return productPickerVerificationView(hit, 'BASE_FORMULATION');
  }
  const anyRoleReady = hit.usableInBase || hit.usableAsTopping;
  if (!anyRoleReady) {
    return productPickerVerificationView(
      hit,
      hit.usableAsTopping ? 'POST_PROCESS_ADDON' : 'BASE_FORMULATION',
    );
  }
  if (hit.entityKind === 'pi_base') {
    const scope = hit.usableInBase ? 'BASE_FORMULATION' : 'POST_PROCESS_ADDON';
    return productPickerVerificationView(hit, scope);
  }
  if (!hit.mappedIngredientId && !hasProductOwnedEngineProfile(hit)) {
    return {
      status: 'MAPPER BINDING REQUIRED',
      reason: exactPickerBlock(
        hit,
        'BASE_FORMULATION',
        'product-owned profile / mappedIngredientId',
        'Utwórz gotowy profil produktu albo wybierz dokładne powiązanie Mapper.',
      ),
    };
  }
  if (hit.verificationMethod === 'mapper_estimated') {
    return {
      status: 'Dane szacowane',
      reason: 'Profil jest technicznie gotowy; część danych pochodzi z dopasowania rodzinnego.',
    };
  }
  if (hit.verificationMethod === 'mapper_needs_label_review') {
    return {
      status: 'WYMAGA SPRAWDZENIA ETYKIETY',
      reason: 'Produkt jest technicznie używalny, ale aktualna etykieta nadal wymaga sprawdzenia.',
    };
  }
  if (hit.status === 'verified') return { status: 'PINGÜINO — SPRAWDZONY', reason: null };
  if (hit.provenance === 'automatic_verified' || hit.verificationMethod === 'automatic') {
    return { status: 'SYSTEM — DOPASOWANY', reason: null };
  }
  return { status: 'DODANY PRZEZ UŻYTKOWNIKA', reason: null };
}

export function productPickerUnavailableReason(
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
  hit: CatalogProductSearchHit,
): string {
  if (scope === 'BASE_FORMULATION') {
    const verification = productPickerVerificationView(hit);
    if (verification.reason) return verification.reason;
  }
  if (hit.blockedReason) {
    return exactPickerBlock(
      hit,
      scope,
      'server technical gate',
      `Powód serwera: ${hit.blockedReason}. Wykonaj wskazaną korektę albo wybierz inny produkt.`,
    );
  }
  if (hit.status === 'blocked') {
    const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
    return defects.length > 0
      ? exactPickerBlock(hit, scope, defects.join(', '), 'Uzupełnij wskazane dane.')
      : exactPickerBlock(
          hit,
          scope,
          'technical eligibility',
          'Odśwież dane albo wybierz kwalifikowany produkt.',
        );
  }
  if (scope === 'BASE_FORMULATION') {
    return exactPickerBlock(
      hit,
      scope,
      'mappedIngredientId',
      'Wybierz dokładne mapowanie do PINGÜINO Base.',
    );
  }
  if (hit.invalidFields.includes('nutrition_basis_per_100ml_requires_density_for_gram_topping')) {
    return exactPickerBlock(
      hit,
      scope,
      'nutrition basis 100 ml / density',
      'Dodaj gęstość, aby przeliczyć Topping na gramy.',
    );
  }
  const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
  return defects.length > 0
    ? exactPickerBlock(hit, scope, defects.join(', '), 'Uzupełnij pełne dane etykiety.')
    : exactPickerBlock(
        hit,
        scope,
        'nutritionPer100g / ingredients / allergens',
        'Uzupełnij wartości odżywcze, składniki i alergeny.',
      );
}
