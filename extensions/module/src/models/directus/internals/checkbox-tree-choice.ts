export type CheckboxTreeChoice = {
  text: string;
  value: string;
  children?: CheckboxTreeChoice[];

  valueCombining?: 'all' | 'branch' | 'leaf' | 'indeterminate' | 'exclusive';
  /** Will highlight every text that matches the given search */
  search?: string | null;
  /** Which key in choices is used to display the text */
  itemText?: string;
  /** Which key in choices is used to model the active state */
  itemValue?: string;
  /** Which key in choices is used to render children */
  itemChildren?: string;
  /** Disables any interaction */
  disabled?: boolean;
  /** Show only the selected choices */
  showSelectionOnly?: boolean;
};
