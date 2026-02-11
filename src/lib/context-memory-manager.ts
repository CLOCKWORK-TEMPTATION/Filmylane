import { logger } from "./logger";

export interface ClassificationRecord {
  line: string;
  classification: string;
  timestamp: number;
}

export interface ContextMemory {
  sessionId: string;
  lastModified: number;
  data: {
    commonCharacters: string[];
    commonLocations: string[];
    lastClassifications: string[];
    characterDialogueMap: { [character: string]: number };
  };
}

/**
 * A simple in-memory implementation of the ContextMemoryManager.
 * In a real application, this might use localStorage or a backend service.
 */
export class ContextMemoryManager {
  private storage: Map<string, ContextMemory> = new Map();

  constructor() {
    logger.info(
      "MemoryManager",
      "ContextMemoryManager initialized (in-memory)."
    );
  }

  async loadContext(sessionId: string): Promise<ContextMemory | null> {
    if (this.storage.has(sessionId)) {
      logger.info("MemoryManager", `Loading context for session: ${sessionId}`);
      return JSON.parse(JSON.stringify(this.storage.get(sessionId)!)); // Deep copy
    }
    logger.warning(
      "MemoryManager",
      `No context found for session: ${sessionId}`
    );
    return null;
  }

  async saveContext(sessionId: string, memory: ContextMemory): Promise<void> {
    logger.info("MemoryManager", `Saving context for session: ${sessionId}`);
    this.storage.set(sessionId, JSON.parse(JSON.stringify(memory))); // Deep copy
  }

  async updateMemory(
    sessionId: string,
    classifications: ClassificationRecord[]
  ): Promise<void> {
    logger.info(
      "MemoryManager",
      `Updating memory for session ${sessionId} with ${classifications.length} records.`
    );

    const memory = (await this.loadContext(sessionId)) || {
      sessionId,
      lastModified: Date.now(),
      data: {
        commonCharacters: [],
        commonLocations: [],
        lastClassifications: [],
        characterDialogueMap: {},
      },
    };

    memory.lastModified = Date.now();
    memory.data.lastClassifications = classifications
      .map((c) => c.classification)
      .concat(memory.data.lastClassifications)
      .slice(0, 20);

    classifications.forEach((record) => {
      if (record.classification === "character") {
        const charName = record.line.replace(/[:：]/g, "").trim();
        if (charName) {
          if (!memory.data.commonCharacters.includes(charName)) {
            memory.data.commonCharacters.push(charName);
          }
          memory.data.characterDialogueMap[charName] =
            (memory.data.characterDialogueMap[charName] || 0) + 1;
        }
      }
    });

    await this.saveContext(sessionId, memory);
  }
}
