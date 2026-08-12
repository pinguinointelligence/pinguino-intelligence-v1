export const isProductPickerSelectionCurrent = (input: {
  serverSearch: boolean;
  serverSettled: boolean;
  localOption: boolean;
}): boolean => !input.serverSearch || input.localOption || input.serverSettled;
