import fs from "fs";
import path from "path";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  content: string;
}

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

let skillsCache: SkillInfo[] | null = null;

function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  triggers: string[];
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { name: "", description: "", triggers: [], body: content };

  const frontmatter = match[1];
  const body = match[2];

  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "";
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
  const triggersRaw = frontmatter.match(/^triggers:\s*(.+)$/m)?.[1]?.trim() || "";
  const triggers = triggersRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  return { name, description, triggers, body };
}

function loadAllSkills(): SkillInfo[] {
  if (skillsCache) return skillsCache;

  const skills: SkillInfo[] = [];

  if (!fs.existsSync(SKILLS_DIR)) return skills;

  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillMd = path.join(SKILLS_DIR, dir.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    const content = fs.readFileSync(skillMd, "utf-8");
    const { name, description, triggers, body } = parseSkillFrontmatter(content);

    if (!triggers.length) continue;

    skills.push({
      id: dir.name,
      name: name || dir.name,
      description,
      triggers,
      content: body,
    });
  }

  skillsCache = skills;
  return skills;
}

/**
 * Auto-detect which skills are relevant to a user's message.
 * Returns the top matching skill (or null if no strong match).
 * Matching is based on keyword overlap between the message and skill triggers.
 */
export function detectSkill(userMessage: string): SkillInfo | null {
  const skills = loadAllSkills();
  if (skills.length === 0) return null;

  const messageLower = userMessage.toLowerCase();
  const messageWords = new Set(messageLower.split(/\s+/));

  let bestSkill: SkillInfo | null = null;
  let bestScore = 0;

  for (const skill of skills) {
    let score = 0;

    for (const trigger of skill.triggers) {
      // Multi-word triggers: check if the phrase appears in the message
      if (trigger.includes(" ")) {
        if (messageLower.includes(trigger)) score += 3;
      } else {
        // Single word: check word-level match
        if (messageWords.has(trigger)) score += 2;
        // Partial match (e.g., "benchmarking" matches "benchmark")
        else if (messageLower.includes(trigger)) score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  // Require at least 2 points to activate (one exact word match or partial phrase)
  return bestScore >= 2 ? bestSkill : null;
}

/**
 * Build the skill injection text to append to a system prompt.
 *
 * Skills are offered as optional deliverables, not auto-executed.
 * The model answers the user's question concisely, then offers the
 * deliverable as an option. The full skill content is NOT included
 * until the user opts in — this prevents the model from following
 * the skill's imperative instructions and burning tokens.
 */
export function buildSkillInjection(skill: SkillInfo): string {
  return `\n\n---\n\nIMPORTANT INSTRUCTION: You detected that this question may relate to a "${skill.name}" deliverable (${skill.description}). Do NOT produce a full report, guide, analysis, or structured deliverable unless the user explicitly asks for one. Instead:
1. Answer the user's question concisely using data from your tools (2-4 paragraphs max).
2. At the end, add one sentence offering the option: "Would you like me to generate a full **${skill.name}**? This will provide a more detailed, structured analysis."
3. Do NOT include any report template, executive summary, methodology section, or structured output format unless the user says yes.`;
}

/**
 * Build the full skill execution prompt — only used when the user
 * explicitly opts in to generating a deliverable.
 */
export function buildSkillExecution(skill: SkillInfo): string {
  return `\n\n---\n\nThe user has requested a full "${skill.name}" deliverable. Follow the framework below to produce it.\n\n${skill.content}`;
}

/**
 * Detect if the user's message is confirming a previously offered skill.
 * Looks for short affirmative messages like "yes", "generate it", "sure", etc.
 */
export function isSkillOptIn(userMessage: string): boolean {
  const msg = userMessage.trim().toLowerCase();
  const optInPatterns = [
    /^(yes|yeah|yep|sure|ok|okay|go ahead|do it|please|generate)/,
    /^(go for it|let'?s do it|sounds good|absolutely)/,
    /generate .*(report|guide|pulse|analysis|brief|deliverable)/,
    /full .*(report|guide|pulse|analysis|brief|deliverable)/,
  ];
  return optInPatterns.some((p) => p.test(msg));
}

/**
 * Scan conversation history to find which skill was previously offered.
 * Looks for the "Would you like me to generate a full **skill-name**" pattern
 * in assistant messages.
 */
export function findOfferedSkill(
  assistantMessages: { text: string }[]
): SkillInfo | null {
  const skills = loadAllSkills();
  for (const msg of [...assistantMessages].reverse()) {
    for (const skill of skills) {
      if (msg.text.includes(`**${skill.name}**`)) {
        return skill;
      }
    }
  }
  return null;
}

export function listSkills(): Omit<SkillInfo, "content">[] {
  return loadAllSkills().map(({ content: _, ...rest }) => rest);
}
