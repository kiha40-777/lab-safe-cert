import raw from "../../config/certification.json";
import { validateCertificationConfig } from "./certification";

/**
 * The validated certification configuration. It is bundled at build time, so
 * after editing config/certification.json the app must be rebuilt (npm run build).
 */
export const certification = validateCertificationConfig(raw);
