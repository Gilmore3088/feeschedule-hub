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
 */
export function buildSkillInjection(skill: SkillInfo): string {
  return `\n\n---\n\nYou are currently operating with the "${skill.name}" methodology active. Follow the framework below to structure your analysis and output.\n\n${skill.content}`;
}

export function listSkills(): Omit<SkillInfo, "content">[] {
  return loadAllSkills().map(({ content: _, ...rest }) => rest);
}
