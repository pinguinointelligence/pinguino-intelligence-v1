import { educationCopy } from '@/copy/education.pl';

export type KnowledgeTourStepId =
  | 'worlds'
  | 'freezing'
  | 'sugars'
  | 'creaminess'
  | 'flavour'
  | 'stabilizer'
  | 'temperature'
  | 'home-machines'
  | 'professional-production';

export interface KnowledgeTourAnnotation {
  id: string;
  title: string;
  detail: string;
  /** Horizontal object centre in the original Owner image coordinate system. */
  anchorX: number;
}

export interface KnowledgeTourStep {
  id: KnowledgeTourStepId;
  image: string;
  ownerAsset: string;
  edgeColor: string;
  title: string;
  body: string;
  voice: string;
  annotations: readonly KnowledgeTourAnnotation[];
  compactMobileAnnotations: boolean;
}

export const OWNER_GUIDE_ASSET_SHA256 = {
  '01.png': '5a417c8024617d5a44c0115db8186279bed5c9f54b232bf574d3c0f96ff9b404',
  '02.png': '86d2e201bd3c05c125bf8c62063a67ef1f7a57e78be6c457669d1ec30c961a33',
  '03.png': 'de319941cbe45424d57ed278a1800d2781a99520fbbbdd2107ebe9c93266e37d',
  '04.png': '72f485d68d4cd86933b8c9b2607dcdc082b17e68578fc1a631444384abe77744',
  '05.png': '2fc007fe17c0b7907b8d3e3da2d8d5b241cf01a545c38e9deedf70c7b58b02d4',
  '06.png': '63fd21d2eae58c93274f2e8dfa8753944a81f7ceacf7b6ea5a2d3ade458083bb',
  '07.png': '4e25919ca458cb258f47c62a2b1d8522e6060f309b2f8648f7a5d018967f2ea9',
  '08.png': 'daccacf208250a72b89bb9ee6e0c8c4a1c04028f215f2a9cf89622927cce1885',
  '09.png': 'e0479fb59c9c1738130d571ed070aeb14b054cef75b311e99bb731af5f553917',
} as const;

const c = educationCopy.knowledgeTour.steps;

function anchored<T extends { id: string; title: string; detail: string }>(
  annotations: readonly T[],
  anchors: readonly number[],
): readonly (T & { anchorX: number })[] {
  if (annotations.length !== anchors.length) {
    throw new Error('Every Knowledge Tour caption must have one image-coordinate anchor.');
  }
  return annotations.map((annotation, index) => ({ ...annotation, anchorX: anchors[index]! }));
}

export function projectKnowledgeTourAnchor(
  imageLeft: number,
  displayedImageWidth: number,
  normalizedAnchorX: number,
): number {
  return imageLeft + displayedImageWidth * normalizedAnchorX;
}

const STEPS: readonly KnowledgeTourStep[] = [
  {
    id: 'worlds',
    image: '/guide/01.png',
    ownerAsset: '01.png',
    edgeColor: '#f9f0e3',
    compactMobileAnnotations: true,
    ...c.worlds,
    annotations: anchored(c.worlds.annotations, [0.137, 0.387, 0.626, 0.854]),
  },
  {
    id: 'freezing',
    image: '/guide/02.png',
    ownerAsset: '02.png',
    edgeColor: '#fefcfb',
    compactMobileAnnotations: false,
    ...c.freezing,
    annotations: anchored(c.freezing.annotations, [0.257, 0.497, 0.731]),
  },
  {
    id: 'sugars',
    image: '/guide/03.png',
    ownerAsset: '03.png',
    edgeColor: '#f7efeb',
    compactMobileAnnotations: false,
    ...c.sugars,
    annotations: anchored(c.sugars.annotations, [0.194, 0.499, 0.812]),
  },
  {
    id: 'creaminess',
    image: '/guide/04.png',
    ownerAsset: '04.png',
    edgeColor: '#f4ede6',
    compactMobileAnnotations: true,
    ...c.creaminess,
    annotations: anchored(c.creaminess.annotations, [0.158, 0.329, 0.5, 0.681, 0.861]),
  },
  {
    id: 'flavour',
    image: '/guide/05.png',
    ownerAsset: '05.png',
    edgeColor: '#f4f0ec',
    compactMobileAnnotations: true,
    ...c.flavour,
    annotations: anchored(c.flavour.annotations, [0.125, 0.375, 0.625, 0.875]),
  },
  {
    id: 'stabilizer',
    image: '/guide/06.png',
    ownerAsset: '06.png',
    edgeColor: '#dec9ae',
    compactMobileAnnotations: false,
    ...c.stabilizer,
    annotations: anchored(c.stabilizer.annotations, [0.25, 0.75]),
  },
  {
    id: 'temperature',
    image: '/guide/07.png',
    ownerAsset: '07.png',
    edgeColor: '#e3d8cc',
    compactMobileAnnotations: false,
    ...c.temperature,
    annotations: anchored(c.temperature.annotations, [0.19, 0.5, 0.82]),
  },
  {
    id: 'home-machines',
    image: '/guide/08.png',
    ownerAsset: '08.png',
    edgeColor: '#ede6e2',
    compactMobileAnnotations: true,
    ...c.homeEnding,
    annotations: anchored(c.homeEnding.annotations, [0.125, 0.375, 0.625, 0.875]),
  },
  {
    id: 'professional-production',
    image: '/guide/09.png',
    ownerAsset: '09.png',
    edgeColor: '#e1d3c6',
    compactMobileAnnotations: false,
    ...c.proEnding,
    annotations: anchored(c.proEnding.annotations, [0.26, 0.535, 0.81]),
  },
];

export function knowledgeTourSteps(): readonly KnowledgeTourStep[] {
  return STEPS;
}
