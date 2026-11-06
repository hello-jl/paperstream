/** Shared geometry for screen cards and portable exports. Values are CSS pixels. */
export const CARD_LAYOUT = {
  radius: 16, relationRadius: 12, labelRadius: 9,
  paddingX: 18, paddingTop: 16, gap: 9,
  titleSize: 18, titleLine: 24.3, titleReserve: 26, linkedTitleReserve: 58,
  bodySize: 13, bodyLine: 21.45,
  yearRight: 18, yearBottom: 15, yearSize: 11, yearLine: 17, yearPadding: 42,
  relationPaddingTop: 12, sharedActionReserve: 26,
} as const;
export const CARD_CSS_VARIABLES = {
  '--ps-card-radius': `${CARD_LAYOUT.radius}px`, '--ps-relation-radius': `${CARD_LAYOUT.relationRadius}px`,
  '--ps-label-radius': `${CARD_LAYOUT.labelRadius}px`,
  '--ps-card-padding-x': `${CARD_LAYOUT.paddingX}px`, '--ps-card-padding-top': `${CARD_LAYOUT.paddingTop}px`,
  '--ps-card-gap': `${CARD_LAYOUT.gap}px`, '--ps-card-title-size': `${CARD_LAYOUT.titleSize}px`,
  '--ps-card-title-line': `${CARD_LAYOUT.titleLine}px`, '--ps-card-title-reserve': `${CARD_LAYOUT.titleReserve}px`,
  '--ps-card-linked-title-reserve': `${CARD_LAYOUT.linkedTitleReserve}px`,
  '--ps-card-body-size': `${CARD_LAYOUT.bodySize}px`, '--ps-card-body-line': `${CARD_LAYOUT.bodyLine}px`,
  '--ps-card-year-right': `${CARD_LAYOUT.yearRight}px`, '--ps-card-year-bottom': `${CARD_LAYOUT.yearBottom}px`,
  '--ps-card-year-size': `${CARD_LAYOUT.yearSize}px`, '--ps-card-year-line': `${CARD_LAYOUT.yearLine}px`,
  '--ps-shared-action-reserve': `${CARD_LAYOUT.sharedActionReserve}px`,
  '--ps-card-year-padding': `${CARD_LAYOUT.yearPadding}px`, '--ps-card-relation-top': `${CARD_LAYOUT.relationPaddingTop}px`,
};
