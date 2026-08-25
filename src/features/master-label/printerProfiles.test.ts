import { describe, expect, it } from 'vitest';
import {
  PRINTER_PROFILES,
  normalizePrinterSettings,
  printerGeometryIssues,
  type PrinterProfileId,
} from './printerProfiles';

const required: PrinterProfileId[] = [
  'system_a4_letter',
  'aimo_243bt',
  'brother_ql_820nwbc',
  'brother_ql_1110nwbc',
  'brother_td_4550dnwb',
  'zebra_zd421_203',
  'zebra_zd421_300',
  'dymo_labelwriter_550',
  'dymo_labelwriter_5xl',
  'epson_colorworks_c4000',
  'epson_colorworks_c6000',
  'generic_thermal_58',
  'generic_thermal_80',
  'generic_thermal_104',
  'custom',
];

describe('printer profiles', () => {
  it('contains every required system, thermal and colour preset without fake direct print', () => {
    expect(Object.keys(PRINTER_PROFILES)).toEqual(required);
    expect(
      Object.values(PRINTER_PROFILES).every((profile) => !profile.directPrintImplemented),
    ).toBe(true);
    expect(PRINTER_PROFILES.aimo_243bt).toMatchObject({
      dpiOptions: [203],
      supportedConnections: ['bluetooth', 'usb', 'app_handoff', 'system'],
    });
  });

  it('constrains connection, DPI, media width, margins and copies to the selected model', () => {
    const settings = normalizePrinterSettings({
      profileId: 'brother_ql_820nwbc',
      connection: 'app_handoff',
      dpi: 203,
      widthMm: 100,
      heightMm: 0,
      marginMm: 20,
      copies: 0,
    });
    expect(settings).toMatchObject({
      profileId: 'brother_ql_820nwbc',
      connection: 'usb',
      dpi: 300,
      widthMm: 62,
      heightMm: 20,
      marginMm: 10,
      copies: 1,
    });
    expect(printerGeometryIssues(settings)).toEqual([]);
  });

  it('reports out-of-profile geometry instead of silently claiming printer compatibility', () => {
    const valid = normalizePrinterSettings({ profileId: 'generic_thermal_58', widthMm: 58 });
    expect(printerGeometryIssues({ ...valid, widthMm: 80 })).toEqual([
      'Szerokość musi mieścić się w zakresie 20–58 mm.',
    ]);
  });
});
