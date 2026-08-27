/** Customer-facing wording for internal product-profile status labels. */
export function productProfileStatusLabelPl(status: string | null | undefined): string {
  switch (status) {
    case 'PI Calculated':
      return 'Profil obliczony przez Gellatti';
    case 'PI Generated':
      return 'Profil przygotowany przez Gellatti';
    case 'Manual Adjusted':
      return 'Profil uzupełniony ręcznie';
    case 'PI Verified':
      return 'Profil zweryfikowany';
    default:
      return status ?? '';
  }
}
