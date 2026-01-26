import { ProjectConfig, RouteResult, RouteAction, InputType } from './types';

// Question indicator words
const QUESTION_STARTERS = [
  'what', 'how', 'why', 'when', 'where', 'who', 'which',
  'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does',
  'explain', 'describe', 'tell', 'show', 'help'
];

// Command indicator words
const COMMAND_INDICATORS = [
  'fix', 'update', 'change', 'add', 'remove', 'delete', 'create',
  'implement', 'refactor', 'debug', 'test', 'run', 'build', 'deploy',
  'install', 'configure', 'set', 'modify', 'edit', 'write'
];

export class AgentRouter {
  private projects: ProjectConfig[];
  private lastUsedProject: string | null = null;

  constructor(projects: ProjectConfig[]) {
    this.projects = projects;
  }

  /**
   * Update the project list
   */
  setProjects(projects: ProjectConfig[]): void {
    this.projects = projects;
  }

  /**
   * Route a command to the appropriate project
   */
  routeCommand(input: string, activeSession?: { projectId: string; sessionId: string }): RouteResult {
    const lowerInput = input.toLowerCase().trim();
    const inputType = this.classifyInput(lowerInput);

    // If there's an active session, prefer sending to it
    if (activeSession) {
      return {
        projectId: activeSession.projectId,
        confidence: 0.9,
        action: 'send_input',
        processedInput: input,
        inputType,
      };
    }

    // Try to find a project by keywords
    const matchedProject = this.findProjectByKeywords(lowerInput);

    if (matchedProject) {
      this.lastUsedProject = matchedProject.project.id;

      // Determine action based on input type
      const action: RouteAction = inputType === 'question' ? 'query' : 'start_session';

      return {
        projectId: matchedProject.project.id,
        confidence: matchedProject.confidence,
        action,
        processedInput: input,
        inputType,
      };
    }

    // Fall back to last used project if available
    if (this.lastUsedProject) {
      const project = this.projects.find(p => p.id === this.lastUsedProject);
      if (project) {
        return {
          projectId: project.id,
          confidence: 0.3,
          action: inputType === 'question' ? 'query' : 'start_session',
          processedInput: input,
          inputType,
        };
      }
    }

    // No project match - use quick session
    return {
      projectId: null,
      confidence: 0,
      action: 'start_session',
      processedInput: input,
      inputType,
    };
  }

  /**
   * Find a project by keywords in the input
   */
  findProjectByKeywords(input: string): { project: ProjectConfig; confidence: number } | null {
    const words = this.tokenize(input);
    let bestMatch: { project: ProjectConfig; confidence: number } | null = null;

    for (const project of this.projects) {
      const score = this.calculateMatchScore(words, project);

      if (score > 0 && (!bestMatch || score > bestMatch.confidence)) {
        bestMatch = { project, confidence: score };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate match score for a project
   */
  private calculateMatchScore(inputWords: string[], project: ProjectConfig): number {
    let score = 0;
    let matches = 0;

    // Check project ID match (highest priority)
    if (inputWords.includes(project.id.toLowerCase())) {
      score += 1.0;
      matches++;
    }

    // Check project ID parts (e.g., "ai-helper" matches "ai" or "helper")
    const idParts = project.id.toLowerCase().split(/[-_]/);
    for (const part of idParts) {
      if (part.length > 2 && inputWords.includes(part)) {
        score += 0.5;
        matches++;
      }
    }

    // Check project name words
    const nameWords = this.tokenize(project.name.toLowerCase());
    for (const nameWord of nameWords) {
      if (nameWord.length > 2 && inputWords.includes(nameWord)) {
        score += 0.4;
        matches++;
      }
    }

    // Check keywords (if available)
    if (project.keywords) {
      for (const keyword of project.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (inputWords.includes(keywordLower)) {
          score += 0.6;
          matches++;
        }
        // Partial keyword match
        for (const word of inputWords) {
          if (word.length > 3 && keywordLower.includes(word)) {
            score += 0.2;
          }
        }
      }
    }

    // Check tech stack (if available)
    if (project.techStack) {
      for (const tech of project.techStack) {
        if (inputWords.includes(tech.toLowerCase())) {
          score += 0.3;
          matches++;
        }
      }
    }

    // Normalize score based on match count and input length
    if (matches > 0) {
      // Cap at 1.0
      return Math.min(1.0, score / Math.max(1, Math.log2(inputWords.length + 1)));
    }

    return 0;
  }

  /**
   * Classify input as command, question, or conversation
   */
  classifyInput(input: string): InputType {
    const lowerInput = input.toLowerCase().trim();
    const firstWord = lowerInput.split(/\s+/)[0];

    // Check for question patterns
    if (lowerInput.endsWith('?')) {
      return 'question';
    }

    if (QUESTION_STARTERS.includes(firstWord)) {
      return 'question';
    }

    // Check for command patterns
    if (COMMAND_INDICATORS.includes(firstWord)) {
      return 'command';
    }

    // Check for imperative mood (starts with verb-like word)
    const imperativePatterns = [
      /^(please\s+)?/i,
      /^make\s+/i,
      /^let'?s\s+/i,
    ];

    for (const pattern of imperativePatterns) {
      const match = lowerInput.match(pattern);
      if (match && match[0].length > 0) {
        const remainder = lowerInput.slice(match[0].length);
        const nextWord = remainder.split(/\s+/)[0];
        if (COMMAND_INDICATORS.includes(nextWord)) {
          return 'command';
        }
      }
    }

    // Default to conversation
    return 'conversation';
  }

  /**
   * Tokenize input into words
   */
  private tokenize(input: string): string[] {
    return input
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Get suggestion for which project to use
   */
  getSuggestion(input: string): string | null {
    const result = this.routeCommand(input);

    if (result.projectId && result.confidence >= 0.5) {
      const project = this.projects.find(p => p.id === result.projectId);
      if (project) {
        return `Suggested project: ${project.name} (${Math.round(result.confidence * 100)}% match)`;
      }
    }

    return null;
  }

  /**
   * Set the last used project (for context)
   */
  setLastUsedProject(projectId: string): void {
    this.lastUsedProject = projectId;
  }

  /**
   * Get all projects
   */
  getProjects(): ProjectConfig[] {
    return this.projects;
  }
}
