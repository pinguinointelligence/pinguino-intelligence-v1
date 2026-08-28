/** Customer-facing wording for internal product-profile status labels. */
export function productProfileStatusLabelPl(status: string | null | undefined): string {
  switch (status) {
    case 'PI Calculated':
      return 'Obliczone';
    case 'PI Generated':
      return 'Wygenerowane';
    case 'Manual Adjusted':
      return 'Profil uzupełniony ręcznie';
    case 'PI Verified':
      return 'Zweryfikowane';
    default:
      return status ?? '';
  }
}
