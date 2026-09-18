/**
 * DESIGN V3.0 IX — where the customer is inside „Receptury”, and what they chose.
 * Shape only: every name, count and photo comes from the app's own library data.
 */
import type { OfficialCollectionId } from '@/data/recipes/official/officialRecipeLibrary';
import type { HomeCommunityDoorTarget } from './matching/useHomeCommunityDoor';

/** The customer's choice, carrying what its door needs to open it. */
export type HomeLibraryChoice =
  | { readonly kind: 'official'; readonly id: string; readonly title: string }
  | {
      readonly kind: 'community';
      readonly id: string;
      readonly title: string;
      readonly target: HomeCommunityDoorTarget;
    };

/** Community is the sixth collection (owner X), next to the five official ones. */
export const HOME_COMMUNITY_COLLECTION_ID = 'community';
export type HomeLibraryCollectionId = OfficialCollectionId | typeof HOME_COMMUNITY_COLLECTION_ID;

/** Where the customer is inside „Receptury”. A search is shown over it while it has words. */
export interface HomeLibraryView {
  readonly collection: HomeLibraryCollectionId | null;
  readonly query: string;
}

export const EMPTY_LIBRARY_VIEW: HomeLibraryView = { collection: null, query: '' };
