/**
 * The single place the product is named. Renaming the platform is a one-line change.
 */
export const BRAND = {
  name: 'Chetna',
  nameLocal: 'चेतना',
  tagline: 'Measure the sensor, not the victim.',
  subTagline: 'A drill, not a trap.',
  productLine: 'Authorized Phishing Simulation & Security Awareness Platform',
  /** Mandatory header on every simulated message (safety-lint SL006). */
  simulationHeader: 'X-Chetna-Simulation',
  /** Secondary header, matching the convention mail gateways allowlist on. */
  simulationHeaderAlt: 'X-Simulated-Phish',
  /** Prefix for the invisible per-template watermark id. */
  watermarkPrefix: 'chetna-sim',
} as const;
