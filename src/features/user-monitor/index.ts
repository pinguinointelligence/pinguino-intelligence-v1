/**
 * PINGÜINO User Monitor — Monitor Pro (SPEC §14) public barrel.
 * Pure §14 view models (modules, summary cards, §20.5 recipe-level statuses),
 * the `UserMonitorLayout` model + device-local persistence (§14.3, §23.1) and
 * the presentational panel. Presentation only — the engine is never re-derived.
 */
export {
  CONFIDENCE_LEVEL_BY_TIER,
  MONITOR_STATUS_LINE_TEXT,
  deriveMonitorStatusLine,
  deriveRecipeDataConfidence,
  deriveRecipeReadiness,
  type MonitorStatusLine,
  type MonitorStatusLineId,
  type RecipeDataConfidenceTier,
  type RecipeDataConfidenceView,
  type RecipeReadinessView,
} from './recipeIndicatorStatuses';

export {
  USER_MONITOR_LAYOUT_STORAGE_KEY,
  USER_MONITOR_MODULE_ORDER,
  defaultUserMonitorLayout,
  loadUserMonitorLayout,
  movePinned,
  parseUserMonitorLayout,
  pinMetric,
  resetUserMonitorLayout,
  saveUserMonitorLayout,
  toggleModule,
  unpinMetric,
  type UserMonitorLayout,
  type UserMonitorModuleId,
} from './userMonitorLayout';

export {
  FRIENDLY_METRIC_PRESENTATION,
  SUMMARY_CARD_LABELS,
  SUMMARY_CARD_METRICS,
  SUMMARY_CARD_ORDER,
  USER_MONITOR_MODULE_TITLES,
  buildUserMonitorModules,
  buildUserMonitorSummaryCards,
  type MetricPresentation,
  type SummaryCardId,
  type UserMonitorModuleView,
  type UserMonitorRow,
  type UserMonitorSummaryCard,
} from './userMonitorModules';

export {
  CUSTOMIZE_VIEW_LABEL,
  PINNED_SECTION_LABEL,
  RESET_LAYOUT_LABEL,
  USER_MONITOR_TITLE,
  UserMonitorPro,
} from './UserMonitorPro';
