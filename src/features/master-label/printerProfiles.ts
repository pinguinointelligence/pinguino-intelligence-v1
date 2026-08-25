export type PrinterConnection = 'system' | 'usb' | 'bluetooth' | 'network' | 'app_handoff';
export type PrinterTechnology = 'system' | 'direct_thermal' | 'thermal_transfer' | 'inkjet_label';

export type PrinterProfileId =
  | 'system_a4_letter'
  | 'aimo_243bt'
  | 'brother_ql_820nwbc'
  | 'brother_ql_1110nwbc'
  | 'brother_td_4550dnwb'
  | 'zebra_zd421_203'
  | 'zebra_zd421_300'
  | 'dymo_labelwriter_5xl'
  | 'epson_colorworks_c4000'
  | 'epson_colorworks_c6000'
  | 'generic_thermal_58'
  | 'generic_thermal_80'
  | 'generic_thermal_104'
  | 'custom';

export interface LabelSizePreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  continuous?: boolean;
}

export interface PrinterProfile {
  id: PrinterProfileId;
  manufacturer: string;
  model: string;
  technology: PrinterTechnology;
  supportedConnections: readonly PrinterConnection[];
  dpiOptions: readonly number[];
  minWidthMm: number;
  maxWidthMm: number;
  sizePresets: readonly LabelSizePreset[];
  directPrintImplemented: false;
  workflowNote: string;
  sourceUrl: string | null;
  softwareVerification: 'AUTOMATED_GEOMETRY_PDF';
  hardwareVerification: 'NOT_VERIFIED';
}

export interface LabelPrinterSettings {
  profileId: PrinterProfileId;
  connection: PrinterConnection;
  dpi: number;
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  widthMm: number;
  heightMm: number;
  copies: number;
  formatMode?: 'auto' | 'preset' | 'custom';
  presetId?: string | null;
}

const COMMON = {
  directPrintImplemented: false as const,
  workflowNote:
    'Gellatti generuje wydruk o prawidłowej geometrii i przekazuje go do systemowego okna drukowania. Bezpośredni protokół urządzenia nie jest deklarowany.',
  softwareVerification: 'AUTOMATED_GEOMETRY_PDF' as const,
  hardwareVerification: 'NOT_VERIFIED' as const,
};

const sizes = {
  narrow: [
    { id: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
    {
      id: '62-continuous',
      label: '62 mm · taśma ciągła',
      widthMm: 62,
      heightMm: 70,
      continuous: true,
    },
  ],
  medium: [
    { id: '70x50', label: '70 × 50 mm', widthMm: 70, heightMm: 50 },
    { id: '80x50', label: '80 × 50 mm', widthMm: 80, heightMm: 50 },
  ],
  wide: [
    { id: '100x50', label: '100 × 50 mm', widthMm: 100, heightMm: 50 },
    { id: '100x70', label: '100 × 70 mm', widthMm: 100, heightMm: 70 },
    { id: '102x152', label: '102 × 152 mm · 4 × 6 in', widthMm: 102, heightMm: 152 },
  ],
};

export const PRINTER_PROFILES: Readonly<Record<PrinterProfileId, PrinterProfile>> = Object.freeze({
  system_a4_letter: {
    id: 'system_a4_letter',
    manufacturer: 'System',
    model: 'A4 / Letter / PDF',
    technology: 'system',
    supportedConnections: ['system'],
    dpiOptions: [300, 600],
    minWidthMm: 20,
    maxWidthMm: 216,
    sizePresets: [...sizes.medium, ...sizes.wide],
    ...COMMON,
    workflowNote: 'Uniwersalny PDF i natywne okno drukowania systemu operacyjnego.',
    sourceUrl: null,
  },
  aimo_243bt: {
    id: 'aimo_243bt',
    manufacturer: 'AIMO',
    model: '243BT',
    technology: 'direct_thermal',
    supportedConnections: ['bluetooth', 'usb', 'app_handoff', 'system'],
    dpiOptions: [203],
    minWidthMm: 25.4,
    maxWidthMm: 110,
    sizePresets: [...sizes.medium, ...sizes.wide],
    ...COMMON,
    workflowNote:
      'Profil geometrii 203 dpi. Bluetooth korzysta z obsługiwanej aplikacji/sterownika lub systemowego handoff; przeglądarka nie udaje bezpośredniego połączenia.',
    sourceUrl: 'https://www.aimotech.com/product/am-243bt-shipping-label-printer/',
  },
  brother_ql_820nwbc: {
    id: 'brother_ql_820nwbc',
    manufacturer: 'Brother',
    model: 'QL-820NWBc',
    technology: 'direct_thermal',
    supportedConnections: ['usb', 'network', 'bluetooth', 'system'],
    dpiOptions: [300],
    minWidthMm: 12,
    maxWidthMm: 62,
    sizePresets: sizes.narrow,
    ...COMMON,
    sourceUrl: 'https://www.brother-usa.com/products/ql820nwbc',
  },
  brother_ql_1110nwbc: {
    id: 'brother_ql_1110nwbc',
    manufacturer: 'Brother',
    model: 'QL-1110NWBc',
    technology: 'direct_thermal',
    supportedConnections: ['usb', 'network', 'bluetooth', 'system'],
    dpiOptions: [300],
    minWidthMm: 12,
    maxWidthMm: 103.6,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://www.brother-usa.com/products/ql1110nwbc',
  },
  brother_td_4550dnwb: {
    id: 'brother_td_4550dnwb',
    manufacturer: 'Brother',
    model: 'TD-4550DNWB',
    technology: 'direct_thermal',
    supportedConnections: ['usb', 'network', 'bluetooth', 'system'],
    dpiOptions: [300],
    minWidthMm: 19,
    maxWidthMm: 118,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://www.brother-usa.com/products/td4550dnwb',
  },
  zebra_zd421_203: {
    id: 'zebra_zd421_203',
    manufacturer: 'Zebra',
    model: 'ZD421 · 203 dpi',
    technology: 'thermal_transfer',
    supportedConnections: ['usb', 'network', 'bluetooth', 'system'],
    dpiOptions: [203],
    minWidthMm: 15,
    maxWidthMm: 108,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://www.zebra.com/us/en/products/spec-sheets/printers/desktop/zd421-zd621.html',
  },
  zebra_zd421_300: {
    id: 'zebra_zd421_300',
    manufacturer: 'Zebra',
    model: 'ZD421 · 300 dpi',
    technology: 'thermal_transfer',
    supportedConnections: ['usb', 'network', 'bluetooth', 'system'],
    dpiOptions: [300],
    minWidthMm: 15,
    maxWidthMm: 108,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://www.zebra.com/us/en/products/spec-sheets/printers/desktop/zd421-zd621.html',
  },
  dymo_labelwriter_5xl: {
    id: 'dymo_labelwriter_5xl',
    manufacturer: 'DYMO',
    model: 'LabelWriter 5XL',
    technology: 'direct_thermal',
    supportedConnections: ['usb', 'system'],
    dpiOptions: [300],
    minWidthMm: 19,
    maxWidthMm: 104,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://www.dymo.com/label-makers-printers/labelwriter-label-printers/',
  },
  epson_colorworks_c4000: {
    id: 'epson_colorworks_c4000',
    manufacturer: 'Epson',
    model: 'ColorWorks C4000',
    technology: 'inkjet_label',
    supportedConnections: ['usb', 'network', 'system'],
    dpiOptions: [600, 1200],
    minWidthMm: 25.4,
    maxWidthMm: 108,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://epson.com/colorworks-c4000-color-label-printer',
  },
  epson_colorworks_c6000: {
    id: 'epson_colorworks_c6000',
    manufacturer: 'Epson',
    model: 'ColorWorks C6000',
    technology: 'inkjet_label',
    supportedConnections: ['usb', 'network', 'system'],
    dpiOptions: [600, 1200],
    minWidthMm: 25.4,
    maxWidthMm: 108,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: 'https://epson.com/colorworks-c6000-color-label-printer',
  },
  generic_thermal_58: {
    id: 'generic_thermal_58',
    manufacturer: 'Generic',
    model: 'Thermal 58 mm',
    technology: 'direct_thermal',
    supportedConnections: ['system'],
    dpiOptions: [203],
    minWidthMm: 20,
    maxWidthMm: 58,
    sizePresets: [
      {
        id: '58-continuous',
        label: '58 mm · taśma ciągła',
        widthMm: 58,
        heightMm: 70,
        continuous: true,
      },
    ],
    ...COMMON,
    sourceUrl: null,
  },
  generic_thermal_80: {
    id: 'generic_thermal_80',
    manufacturer: 'Generic',
    model: 'Thermal 80 mm',
    technology: 'direct_thermal',
    supportedConnections: ['system'],
    dpiOptions: [203],
    minWidthMm: 20,
    maxWidthMm: 80,
    sizePresets: sizes.medium,
    ...COMMON,
    sourceUrl: null,
  },
  generic_thermal_104: {
    id: 'generic_thermal_104',
    manufacturer: 'Generic',
    model: 'Thermal 104 mm / 4 in',
    technology: 'direct_thermal',
    supportedConnections: ['system'],
    dpiOptions: [203, 300],
    minWidthMm: 20,
    maxWidthMm: 104,
    sizePresets: sizes.wide,
    ...COMMON,
    sourceUrl: null,
  },
  custom: {
    id: 'custom',
    manufacturer: 'Custom',
    model: 'Własna drukarka / format',
    technology: 'system',
    supportedConnections: ['system'],
    dpiOptions: [203, 300, 600],
    minWidthMm: 20,
    maxWidthMm: 216,
    sizePresets: [...sizes.narrow, ...sizes.medium, ...sizes.wide],
    ...COMMON,
    sourceUrl: null,
  },
});

export const DEFAULT_PRINTER_SETTINGS: LabelPrinterSettings = Object.freeze({
  profileId: 'system_a4_letter',
  connection: 'system',
  dpi: 300,
  orientation: 'portrait',
  marginMm: 2,
  widthMm: 90,
  heightMm: 60,
  copies: 1,
  formatMode: 'auto',
  presetId: null,
});

export function normalizePrinterSettings(
  input: Partial<LabelPrinterSettings> | null | undefined,
): LabelPrinterSettings {
  const profile = PRINTER_PROFILES[input?.profileId ?? DEFAULT_PRINTER_SETTINGS.profileId];
  const connection = profile.supportedConnections.includes(input?.connection ?? 'system')
    ? (input?.connection ?? 'system')
    : profile.supportedConnections[0]!;
  const dpi = profile.dpiOptions.includes(input?.dpi ?? profile.dpiOptions[0]!)
    ? (input?.dpi ?? profile.dpiOptions[0]!)
    : profile.dpiOptions[0]!;
  return {
    profileId: profile.id,
    connection,
    dpi,
    orientation: input?.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginMm: Math.max(0, Math.min(10, input?.marginMm ?? 2)),
    widthMm: Math.max(profile.minWidthMm, Math.min(profile.maxWidthMm, input?.widthMm ?? 90)),
    heightMm: Math.max(20, Math.min(400, input?.heightMm ?? 60)),
    copies: Math.max(1, Math.min(999, Math.floor(input?.copies ?? 1))),
    formatMode:
      input?.formatMode === 'preset' || input?.formatMode === 'custom' ? input.formatMode : 'auto',
    presetId: input?.presetId ?? null,
  };
}

export function printerGeometryIssues(settings: LabelPrinterSettings): string[] {
  const profile = PRINTER_PROFILES[settings.profileId];
  const issues: string[] = [];
  if (!profile.supportedConnections.includes(settings.connection)) {
    issues.push('Wybrane połączenie nie jest obsługiwane przez profil drukarki.');
  }
  if (!profile.dpiOptions.includes(settings.dpi)) {
    issues.push('Wybrana rozdzielczość nie jest obsługiwana przez profil drukarki.');
  }
  if (settings.widthMm < profile.minWidthMm || settings.widthMm > profile.maxWidthMm) {
    issues.push(
      `Szerokość musi mieścić się w zakresie ${profile.minWidthMm}–${profile.maxWidthMm} mm.`,
    );
  }
  return issues;
}
