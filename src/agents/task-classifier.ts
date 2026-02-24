/**
 * Heuristic Task Classifier — routes incoming messages to the optimal AI brain
 * using keyword/regex pattern matching. No LLM calls; completes in <50ms.
 *
 * Domains:
 *   code     → Codex (gpt-5.3-codex) — code review, debugging, refactoring
 *   creative → Claude Opus — writing, brainstorming, content creation
 *   analysis → Claude Sonnet — research, summarization, data analysis
 *   vision   → Gemini Pro (CLI) — image analysis, screenshots, diagrams
 *   search   → Gemini Flash (CLI) — web search, current events, live data
 *   system   → Claude Haiku — system commands, quick lookups, classification
 *   schedule → Claude Sonnet — calendar, reminders, planning
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("routing/classifier");

// ── Domain categories ────────────────────────────────────────────────

export type TaskDomain =
  | "code"
  | "creative"
  | "analysis"
  | "vision"
  | "system"
  | "schedule"
  | "search";

export type ClassificationResult = {
  domain: TaskDomain;
  provider: string;
  model: string;
  confidence: number; // 0-100
  reason: string;
  overrideSource?: "user" | "image" | "heuristic";
  secondaryDomains?: Array<{ domain: TaskDomain; confidence: number }>;
  isCompound?: boolean;
};

// ── Keyword rules (order matters — first match wins within each domain) ──

type DomainRule = {
  domain: TaskDomain;
  /** Keywords that suggest this domain (case-insensitive substring match) */
  keywords: string[];
  /** Regex patterns for more precise matching */
  patterns: RegExp[];
  /** Base confidence when matched (adjusted by specificity) */
  baseConfidence: number;
  /** Multiplier per keyword hit (default 3, tunable via routing-weights.json) */
  keywordBoost: number;
  /** Multiplier per pattern hit (default 5, tunable via routing-weights.json) */
  patternBoost: number;
};

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: "code",
    keywords: [
      "code",
      "function",
      "bug",
      "debug",
      "refactor",
      "compile",
      "build",
      "test",
      "lint",
      "typescript",
      "javascript",
      "python",
      "rust",
      "swift",
      "error",
      "exception",
      "stack trace",
      "pull request",
      "PR",
      "commit",
      "git",
      "npm",
      "pip",
      "cargo",
      "dependency",
      "import",
      "class",
      "interface",
      "variable",
      "algorithm",
      "API",
      "endpoint",
      "database",
      "SQL",
      "query",
      "migration",
      "deploy",
      "CI/CD",
      "docker",
      "fix",
      "patch",
      "implement",
      "scaffold",
      "boilerplate",
      // Arabic
      "كود",
      "برمجة",
      "خطأ",
      "تصحيح",
      "دالة",
      "متغير",
      "واجهة",
      "قاعدة بيانات",
      // Extended keywords
      "architecture",
      "regex",
      "schema",
      "module",
      "syntax",
      "ORM",
      "REST",
      "GraphQL",
      "webhook",
      "middleware",
      "cron",
      "CLI",
      "frontend",
      "backend",
      "server",
      // Arabic extended
      "بناء",
      "هيكل",
      "حزمة",
      "وحدة",
      "اختبار",
      "إصلاح",
    ],
    patterns: [
      /\b(def|func|fn|const|let|var|class|interface|struct|enum)\s+\w+/i,
      /\b(import|from|require|include)\s+/i,
      /\.(ts|js|py|rs|swift|go|java|rb|cpp|c|h|tsx|jsx)\b/i,
      /```\w*\n/, // code blocks
      /\b(npm|yarn|pnpm|pip|cargo|brew)\s+(install|add|run|build|test)/i,
      /\bgit\s+(push|pull|commit|merge|rebase|checkout|branch|diff|log)/i,
      /\b(eslint|prettier|vitest|jest|pytest|cargo test)\b/i,
    ],
    baseConfidence: 80,
    keywordBoost: 3,
    patternBoost: 5,
  },
  {
    domain: "creative",
    keywords: [
      "write",
      "blog",
      "post",
      "article",
      "tweet",
      "thread",
      "caption",
      "copy",
      "headline",
      "tagline",
      "slogan",
      "story",
      "narrative",
      "brainstorm",
      "ideas",
      "creative",
      "draft",
      "brand voice",
      "content",
      "social media",
      "linkedin",
      "instagram",
      "tiktok",
      "hook",
      "CTA",
      "call to action",
      "email",
      "newsletter",
      "script",
      "outline",
      "pitch",
      "proposal",
      // Arabic
      "اكتب",
      "مقال",
      "تغريدة",
      "محتوى",
      "منشور",
      "فكرة",
      "سيناريو",
      "عنوان",
      // Extended keywords
      "edit",
      "rewrite",
      "rephrase",
      "carousel",
      "reel",
      "video script",
      "landing page",
      "bio",
      "persona",
      "template",
      "audience",
      "engagement",
      // Arabic extended
      "أعد كتابة",
      "حرر",
      "نغمة",
      "قالب",
      "جمهور",
    ],
    patterns: [
      /\b(write|draft|compose|create)\s+(a|an|the|my)\s+(post|article|blog|tweet|thread|email|script)/i,
      /\b(brainstorm|ideate|generate)\s+(ideas|topics|hooks|headlines)/i,
      /\b(brand voice|tone|style)\b/i,
      /\b(content calendar|editorial|publishing)\b/i,
      /\b(rewrite|rephrase|edit)\s+(this|the|my)/i,
      /\b(social\s+media|instagram|tiktok|youtube)\s+(post|reel|carousel|shorts?)/i,
    ],
    baseConfidence: 75,
    keywordBoost: 3,
    patternBoost: 5,
  },
  {
    domain: "analysis",
    keywords: [
      "analyze",
      "summarize",
      "explain",
      "compare",
      "research",
      "review",
      "evaluate",
      "assess",
      "report",
      "insight",
      "data",
      "statistics",
      "trend",
      "pattern",
      "findings",
      "pros and cons",
      "tradeoffs",
      "recommendations",
      "what do you think",
      "your opinion",
      "help me understand",
      // Arabic
      "حلل",
      "لخص",
      "اشرح",
      "قارن",
      "بحث",
      "راجع",
      "تقرير",
      "بيانات",
      // Extended keywords
      "breakdown",
      "metric",
      "benchmark",
      "audit",
      "inference",
      "conclusion",
      "classify",
      "sentiment",
      "ROI",
      "KPI",
      // Arabic extended
      "قياس",
      "تصنيف",
      "نتائج",
      "استنتاج",
    ],
    patterns: [
      /\b(analyze|summarize|explain|compare|evaluate|assess)\s+(this|the|my|these)/i,
      /\bwhat\s+(is|are|does|do|would|should|could)\b/i,
      /\b(pros?\s+and\s+cons?|trade-?offs?|advantages?\s+and\s+disadvantages?)\b/i,
      /\b(research|investigate|look into|find out about)\b/i,
      /\b(how|why)\s+(does|do|is|are|should|would)\b/i,
    ],
    baseConfidence: 70,
    keywordBoost: 3,
    patternBoost: 5,
  },
  {
    domain: "schedule",
    keywords: [
      "schedule",
      "calendar",
      "remind",
      "reminder",
      "deadline",
      "meeting",
      "appointment",
      "plan",
      "timeline",
      "milestone",
      "due date",
      "when",
      "tomorrow",
      "next week",
      "today",
      // Arabic
      "جدول",
      "تذكير",
      "موعد",
      "اجتماع",
      "غدا",
      "الأسبوع",
      "اليوم",
      "خطة",
      // Extended keywords
      "event",
      "agenda",
      "ETA",
      "countdown",
      "block time",
      "slot",
      "availability",
      // Arabic extended
      "حدث",
      "مهمة",
      "توقيت",
    ],
    patterns: [
      /\b(schedule|plan|set|book|arrange)\s+(a|an|the|my)\s+(meeting|call|appointment|reminder)/i,
      /\b(add to|update|check)\s+(calendar|schedule)\b/i,
      /\b(by|before|after|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b\d{4}-\d{2}-\d{2}\b/, // ISO dates
      /\b(block\s+time|free\s+slot|availability)\b/i,
      /\b(at|from|until)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i,
    ],
    baseConfidence: 70,
    keywordBoost: 3,
    patternBoost: 5,
  },
  {
    domain: "system",
    keywords: [
      "system",
      "status",
      "health",
      "disk",
      "memory",
      "CPU",
      "process",
      "kill",
      "restart",
      "install",
      "update",
      "permissions",
      "config",
      "settings",
      "env",
      "clipboard",
      "screenshot",
      "notification",
      // Arabic
      "نظام",
      "حالة",
      "ذاكرة",
      "تحديث",
      "إعدادات",
      "صلاحيات",
      // Extended keywords
      "battery",
      "wifi",
      "network",
      "uptime",
      "launchd",
      "plist",
      "finder",
      "spotlight",
      "terminal",
      // Arabic extended
      "شبكة",
      "بطارية",
      "مسار",
    ],
    patterns: [
      /\b(check|show|get)\s+(system|status|health|disk|memory|CPU)\b/i,
      /\b(restart|stop|start|kill)\s+(the|a)?\s*(service|server|process|daemon)\b/i,
      /\b(launchctl|systemctl|brew|apt|yum)\s+/i,
    ],
    baseConfidence: 65,
    keywordBoost: 3,
    patternBoost: 5,
  },
  {
    domain: "search",
    keywords: [
      "search",
      "google",
      "look up",
      "find out",
      "current",
      "latest",
      "news",
      "weather",
      "price",
      "live",
      "real-time",
      "trending",
      "stock",
      "score",
      // Arabic
      "ابحث",
      "جوجل",
      "آخر",
      "أخبار",
      "طقس",
      "سعر",
      "حالي",
      // Extended keywords
      "realtime",
      "update",
      "who is",
      "where is",
      "what happened",
      "recent",
      "today's",
      "market",
      "exchange rate",
      "results",
      // Arabic extended
      "من هو",
      "أين",
      "ماذا حدث",
      "نتيجة",
      "سوق",
    ],
    patterns: [
      /\b(search|find|look up|google)\s+(for|about|me|this)\b/i,
      /\b(current|latest|real-?time|live)\s+(news|weather|prices?|stocks?|scores?)\b/i,
      /\bwhat.{0,10}(weather|price|score|news)\b/i,
      /\bwho\s+(is|was|are)\b/i,
      /\bwhere\s+(is|are|can)\b/i,
      /\b(what happened|what.s new|any news)\b/i,
    ],
    baseConfidence: 75,
    keywordBoost: 3,
    patternBoost: 5,
  },
];

// ── User override patterns ──────────────────────────────────────────

type OverridePattern = {
  pattern: RegExp;
  provider: string;
  model: string;
  label: string;
};

const USER_OVERRIDE_PATTERNS: OverridePattern[] = [
  {
    pattern: /\bask\s+claude\b/i,
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus",
  },
  {
    pattern: /\buse\s+claude\b/i,
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus",
  },
  {
    pattern: /\bwith\s+claude\b/i,
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus",
  },
  {
    pattern: /\bask\s+opus\b/i,
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus",
  },
  {
    pattern: /\buse\s+opus\b/i,
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus",
  },
  {
    pattern: /\bask\s+sonnet\b/i,
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    label: "Claude Sonnet",
  },
  {
    pattern: /\buse\s+sonnet\b/i,
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    label: "Claude Sonnet",
  },
  {
    pattern: /\bask\s+haiku\b/i,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku",
  },
  {
    pattern: /\buse\s+haiku\b/i,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku",
  },
  {
    pattern: /\bhave\s+codex\b/i,
    provider: "openai-codex",
    model: "gpt-5.3-codex",
    label: "Codex",
  },
  { pattern: /\bask\s+codex\b/i, provider: "openai-codex", model: "gpt-5.3-codex", label: "Codex" },
  { pattern: /\buse\s+codex\b/i, provider: "openai-codex", model: "gpt-5.3-codex", label: "Codex" },
  {
    pattern: /\bcodex\s+review\b/i,
    provider: "openai-codex",
    model: "gpt-5.3-codex",
    label: "Codex",
  },
  {
    pattern: /\buse\s+gemini\b/i,
    provider: "google-gemini-cli",
    model: "gemini-2.5-pro",
    label: "Gemini Pro",
  },
  {
    pattern: /\bask\s+gemini\b/i,
    provider: "google-gemini-cli",
    model: "gemini-2.5-pro",
    label: "Gemini Pro",
  },
];

// ── Routing table (domain → provider/model) ─────────────────────────

const ROUTING_TABLE: Record<TaskDomain, { provider: string; model: string }> = {
  code: { provider: "openai-codex", model: "gpt-5.3-codex" },
  creative: { provider: "anthropic", model: "claude-opus-4-6" },
  analysis: { provider: "anthropic", model: "claude-sonnet-4-5" },
  vision: { provider: "google-gemini-cli", model: "gemini-2.5-pro" },
  system: { provider: "anthropic", model: "claude-haiku-4-5" },
  schedule: { provider: "anthropic", model: "claude-sonnet-4-5" },
  search: { provider: "google-gemini-cli", model: "gemini-2.5-flash" },
};

/** Default when confidence is below threshold */
const DEFAULT_ROUTE = { provider: "anthropic", model: "claude-sonnet-4-5" };
const CONFIDENCE_THRESHOLD = 70;

// ── Dynamic routing weights (loaded from optimize.js output) ────────

export let dynamicConfidenceThreshold = CONFIDENCE_THRESHOLD;

function applyRoutingWeights(): void {
  try {
    const weightsPath = join(process.env.HOME ?? "/tmp", ".openclaw", "routing-weights.json");
    if (!existsSync(weightsPath)) {
      return;
    }
    const raw = JSON.parse(readFileSync(weightsPath, "utf-8"));
    const domains = raw.domains ?? raw;
    for (const rule of DOMAIN_RULES) {
      const w = domains[rule.domain];
      if (w && typeof w.baseConfidence === "number") {
        rule.baseConfidence = w.baseConfidence;
      }
      if (w && typeof w.keywordBoost === "number") {
        rule.keywordBoost = w.keywordBoost;
      }
      if (w && typeof w.patternBoost === "number") {
        rule.patternBoost = w.patternBoost;
      }
    }
    if (typeof raw.confidenceThreshold === "number") {
      dynamicConfidenceThreshold = raw.confidenceThreshold;
    }
    log.info(`loaded routing weights from ${weightsPath}`);
  } catch (err) {
    log.debug(`routing weights not loaded: ${err instanceof Error ? err.message : String(err)}`);
  }
}

applyRoutingWeights();

// ── Classifier ──────────────────────────────────────────────────────

export type ClassifyTaskInput = {
  message: string;
  hasImages?: boolean;
  /** If set, skip classification and use this provider/model */
  explicitOverride?: { provider: string; model: string };
};

export function classifyTask(input: ClassifyTaskInput): ClassificationResult {
  const { message, hasImages } = input;

  // 1. Check for explicit override (already resolved by caller)
  if (input.explicitOverride) {
    return {
      domain: "analysis",
      provider: input.explicitOverride.provider,
      model: input.explicitOverride.model,
      confidence: 100,
      reason: "Explicit override from caller",
      overrideSource: "user",
    };
  }

  // 2. Check for user override phrases ("ask Claude", "have Codex review")
  for (const override of USER_OVERRIDE_PATTERNS) {
    if (override.pattern.test(message)) {
      return {
        domain: "analysis", // domain is informational when overridden
        provider: override.provider,
        model: override.model,
        confidence: 100,
        reason: `User override: "${override.label}"`,
        overrideSource: "user",
      };
    }
  }

  // 3. Vision shortcut — images go to Gemini, UNLESS the message is clearly code-related
  if (hasImages) {
    // Check if the text is strongly code-oriented (e.g. code screenshot with "fix this bug")
    const lowerMsg = message.toLowerCase();
    const codeSignals = [
      "fix",
      "bug",
      "error",
      "debug",
      "refactor",
      "code",
      "function",
      "compile",
      "lint",
      "test",
      "typescript",
      "javascript",
      "python",
    ];
    const codeHits = codeSignals.filter((k) => lowerMsg.includes(k)).length;
    if (codeHits >= 2) {
      // Strong code signal with image — route to code brain (likely a code screenshot)
      const route = ROUTING_TABLE.code;
      return {
        domain: "code",
        provider: route.provider,
        model: route.model,
        confidence: 90,
        reason: `Code screenshot detected (${codeHits} code keywords + image) → Codex`,
        overrideSource: "image",
      };
    }
    const route = ROUTING_TABLE.vision;
    return {
      domain: "vision",
      provider: route.provider,
      model: route.model,
      confidence: 95,
      reason: "Image content detected → Gemini Pro (CLI)",
      overrideSource: "image",
    };
  }

  // 4. Heuristic classification — score each domain
  const scores: Array<{ domain: TaskDomain; score: number; matchedOn: string }> = [];

  for (const rule of DOMAIN_RULES) {
    let score = 0;
    let matchedOn = "";

    // Keyword matches (each keyword adds points)
    const lowerMessage = message.toLowerCase();
    let keywordHits = 0;
    for (const keyword of rule.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        keywordHits++;
        if (!matchedOn) {
          matchedOn = keyword;
        }
      }
    }

    // Pattern matches (regex adds more points)
    let patternHits = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        patternHits++;
        if (!matchedOn) {
          matchedOn = `pattern:${pattern.source.substring(0, 30)}`;
        }
      }
    }

    if (keywordHits > 0 || patternHits > 0) {
      // Score = base confidence + bonuses for multiple matches
      score = rule.baseConfidence;
      score += Math.min(keywordHits * rule.keywordBoost, 15); // up to +15 for keyword density
      score += Math.min(patternHits * rule.patternBoost, 15); // up to +15 for pattern matches
      score = Math.min(score, 100);

      scores.push({ domain: rule.domain, score, matchedOn });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  if (scores.length > 0 && scores[0].score >= dynamicConfidenceThreshold) {
    const best = scores[0];
    const route = ROUTING_TABLE[best.domain];

    // Compound detection: collect runner-up domains above threshold and within 40 points of best
    const runnerUps = scores
      .slice(1)
      .filter((s) => s.score >= dynamicConfidenceThreshold && s.score >= best.score - 40)
      .map((s) => ({ domain: s.domain, confidence: s.score }));

    const result: ClassificationResult = {
      domain: best.domain,
      provider: route.provider,
      model: route.model,
      confidence: best.score,
      reason: `Heuristic: ${best.domain} (matched: ${best.matchedOn})`,
      overrideSource: "heuristic",
    };

    if (runnerUps.length > 0) {
      result.isCompound = true;
      result.secondaryDomains = runnerUps;
    }

    return result;
  }

  // 5. Below threshold → default to Claude Sonnet
  return {
    domain: "analysis",
    provider: DEFAULT_ROUTE.provider,
    model: DEFAULT_ROUTE.model,
    confidence: scores.length > 0 ? scores[0].score : 0,
    reason:
      scores.length > 0
        ? `Below threshold (${scores[0].score}% < ${dynamicConfidenceThreshold}%) → default Sonnet`
        : "No domain matched → default Sonnet",
    overrideSource: "heuristic",
  };
}

// ── Decision logging ────────────────────────────────────────────────

export type RoutingDecision = {
  timestamp: string;
  inputSummary: string;
  classification: ClassificationResult;
};

const DECISION_LOG: RoutingDecision[] = [];
const MAX_LOG_ENTRIES = 500;

export function logRoutingDecision(message: string, result: ClassificationResult): void {
  const decision: RoutingDecision = {
    timestamp: new Date().toISOString(),
    inputSummary: message.substring(0, 100),
    classification: result,
  };

  DECISION_LOG.push(decision);
  if (DECISION_LOG.length > MAX_LOG_ENTRIES) {
    DECISION_LOG.shift();
  }

  log.info(
    `route: domain=${result.domain} provider=${result.provider} model=${result.model} ` +
      `confidence=${result.confidence}% reason="${result.reason}" ` +
      `input="${message.substring(0, 50)}..."`,
  );
}

export function getRoutingDecisions(limit?: number): RoutingDecision[] {
  const n = limit ?? 50;
  return DECISION_LOG.slice(-n);
}

export function getRoutingStats(): {
  total: number;
  byDomain: Record<string, number>;
  byProvider: Record<string, number>;
  avgConfidence: number;
} {
  const byDomain: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let totalConfidence = 0;

  for (const d of DECISION_LOG) {
    byDomain[d.classification.domain] = (byDomain[d.classification.domain] ?? 0) + 1;
    byProvider[d.classification.provider] = (byProvider[d.classification.provider] ?? 0) + 1;
    totalConfidence += d.classification.confidence;
  }

  return {
    total: DECISION_LOG.length,
    byDomain,
    byProvider,
    avgConfidence: DECISION_LOG.length > 0 ? Math.round(totalConfidence / DECISION_LOG.length) : 0,
  };
}
