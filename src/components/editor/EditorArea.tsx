"use client";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
} from "react";
import {
  handlePaste as newHandlePaste,
  runPendingPasteConfirmations,
  ContextMemoryManager,
  EDITOR_STYLE_FORMAT_IDS,
  getFormatStyles,
  getNextFormatOnTab,
  getNextFormatOnEnter,
  HybridClassifier,
  FeedbackCollector,
  screenplayBlocksToHtml,
} from "@/utils";
import { FileImportMode } from "@/types/file-import"; // Import this
import type { ScreenplayBlock } from "@/utils/document-model";
import { ClassificationConfirmationDialog } from "./ConfirmationDialog";
import {
  formatClassMap,
  screenplayFormats,
  formatShortcutMap,
  CONTENT_HEIGHT_PX,
} from "@/constants";
import type { DocumentStats } from "@/types/screenplay";

export interface EditorHandle {
  insertContent: (content: string, mode?: "insert" | "replace") => void;
  getElement: () => HTMLDivElement | null;
  getAllText: () => string;
  getAllHtml: () => string;
  hasSelection: () => boolean;
  copySelectionToClipboard: () => Promise<boolean>;
  cutSelectionToClipboard: () => Promise<boolean>;
  pastePlainTextWithClassifier: (text: string) => Promise<void>;
  undoCommandOperation: () => boolean;
  redoCommandOperation: () => boolean;
  selectAllContent: () => void;
  focusEditor: () => void;
  /** استيراد نص عبر مسار paste 1:1 (يمرر النص كأنه لصق) */
  importClassifiedText: (
    text: string,
    mode: "replace" | "insert"
  ) => Promise<void>;
  importStructuredBlocks: (
    blocks: ScreenplayBlock[],
    mode: "replace" | "insert"
  ) => Promise<void>;
  exportStructuredBlocks: () => ScreenplayBlock[];
}

interface EditorAreaProps {
  onContentChange: () => void;
  onStatsChange: (stats: DocumentStats) => void;
  onFormatChange: (format: string) => void;
  font: string;
  size: string;
  pageCount: number;
  onImporterReady?: (
    importer: (text: string, mode: FileImportMode) => Promise<void>
  ) => void;
}

type SerializedSelection = {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  collapsed: boolean;
} | null;

type EditorCommandSnapshot = {
  htmlByBody: string[];
  selection: SerializedSelection;
};

type EditorCommandEntry = {
  before: EditorCommandSnapshot;
  after: EditorCommandSnapshot;
};

const MAX_COMMAND_HISTORY_ENTRIES = 100;

export const EditorArea = forwardRef<EditorHandle, EditorAreaProps>(
  (
    {
      onContentChange,
      onStatsChange,
      onFormatChange,
      font: _font,
      size: _size,
      pageCount: _pageCount,
      onImporterReady,
    },
    ref
  ) => {
    const fixedFont = "AzarMehrMonospaced-San";
    const fixedSize = "12pt";
    const containerRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<number[]>([1]);
    const commandHistoryRef = useRef<{
      undo: EditorCommandEntry[];
      redo: EditorCommandEntry[];
      applying: boolean;
    }>({
      undo: [],
      redo: [],
      applying: false,
    });
    const syntheticSelectAllRef = useRef(false);

    const getAllContentNodes = useCallback(() => {
      if (!containerRef.current) return [];
      const bodies = containerRef.current.querySelectorAll(
        ".screenplay-sheet__body"
      );
      const nodes: Element[] = [];
      bodies.forEach((body) => {
        Array.from(body.children).forEach((child) => nodes.push(child));
      });
      return nodes;
    }, []);

    const getAllBodies = useCallback(() => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLDivElement>(
          ".screenplay-sheet__body"
        )
      );
    }, []);

    const extractBlocksFromEditorBodies = useCallback((): ScreenplayBlock[] => {
      const formatIds = new Set<string>(EDITOR_STYLE_FORMAT_IDS);
      const blocks: ScreenplayBlock[] = [];
      const bodies = getAllBodies();

      for (const body of bodies) {
        for (const childNode of Array.from(body.childNodes)) {
          if (childNode.nodeType !== Node.ELEMENT_NODE) continue;
          const element = childNode as HTMLElement;

          if (element.classList.contains("format-scene-header-top-line")) {
            const header1 = Array.from(element.children).find((child) =>
              child.classList.contains("format-scene-header-1")
            );
            const header2 = Array.from(element.children).find((child) =>
              child.classList.contains("format-scene-header-2")
            );

            if (header1) {
              blocks.push({
                formatId: "scene-header-1",
                text: (header1.textContent || "").trim(),
              });
            }
            if (header2) {
              blocks.push({
                formatId: "scene-header-2",
                text: (header2.textContent || "").trim(),
              });
            }
            continue;
          }

          const classMatch = Array.from(element.classList).find((className) =>
            className.startsWith("format-")
          );
          const rawId = classMatch?.slice("format-".length) ?? "";
          const formatId = formatIds.has(rawId) ? rawId : "action";

          blocks.push({
            formatId: formatId as ScreenplayBlock["formatId"],
            text: (element.textContent || "").trim(),
          });
        }
      }

      return blocks;
    }, [getAllBodies]);

    const getNodePathFromRoot = useCallback(
      (root: Node, node: Node): number[] | null => {
        const path: number[] = [];
        let current: Node | null = node;

        while (current && current !== root) {
          const parentNodeRef: Node | null = current.parentNode;
          if (!parentNodeRef) return null;
          const index = Array.prototype.indexOf.call(
            parentNodeRef.childNodes,
            current
          );
          if (index < 0) return null;
          path.unshift(index);
          current = parentNodeRef;
        }

        if (current !== root) return null;
        return path;
      },
      []
    );

    const resolveNodePathFromRoot = useCallback(
      (root: Node, path: number[]): Node | null => {
        let current: Node = root;
        for (const index of path) {
          if (!current.childNodes[index]) return null;
          current = current.childNodes[index];
        }
        return current;
      },
      []
    );

    const clampSelectionOffset = useCallback(
      (node: Node, offset: number): number => {
        if (node.nodeType === Node.TEXT_NODE) {
          return Math.max(0, Math.min(offset, node.textContent?.length ?? 0));
        }

        return Math.max(0, Math.min(offset, node.childNodes.length));
      },
      []
    );

    const getSelectionRangeInsideEditor = useCallback((): Range | null => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.rangeCount === 0) return null;

      const range = selection.getRangeAt(0);
      if (
        !container.contains(range.startContainer) ||
        !container.contains(range.endContainer)
      ) {
        return null;
      }

      return range;
    }, []);

    const extractPlainTextFromRange = useCallback((range: Range): string => {
      const fragment = range.cloneContents();
      const temp = document.createElement("div");
      temp.appendChild(fragment);
      const extracted = temp.innerText || temp.textContent || range.toString();
      return extracted.replace(/\u00A0/g, " ");
    }, []);

    const serializeSelection = useCallback(
      (range: Range): SerializedSelection => {
        const container = containerRef.current;
        if (!container) return null;

        const startPath = getNodePathFromRoot(container, range.startContainer);
        const endPath = getNodePathFromRoot(container, range.endContainer);
        if (!startPath || !endPath) return null;

        return {
          startPath,
          startOffset: range.startOffset,
          endPath,
          endOffset: range.endOffset,
          collapsed: range.collapsed,
        };
      },
      [getNodePathFromRoot]
    );

    const restoreSerializedSelection = useCallback(
      (serialized: SerializedSelection): boolean => {
        if (!serialized) return false;
        const container = containerRef.current;
        const selection = window.getSelection();
        if (!container || !selection) return false;

        const startNode = resolveNodePathFromRoot(
          container,
          serialized.startPath
        );
        const endNode = resolveNodePathFromRoot(container, serialized.endPath);
        if (!startNode || !endNode) return false;

        const range = document.createRange();

        try {
          range.setStart(
            startNode,
            clampSelectionOffset(startNode, serialized.startOffset)
          );
          range.setEnd(
            endNode,
            clampSelectionOffset(endNode, serialized.endOffset)
          );
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        } catch {
          return false;
        }
      },
      [clampSelectionOffset, resolveNodePathFromRoot]
    );

    const focusEditorEnd = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;
      const targetBody = bodies[bodies.length - 1];
      targetBody.focus();

      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(targetBody);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const ensureDocumentHasAtLeastOneLine = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      const hasAnyElement = bodies.some((body) =>
        Array.from(body.childNodes).some(
          (node) => node.nodeType === Node.ELEMENT_NODE
        )
      );

      if (hasAnyElement) return;

      const firstBody = bodies[0];
      const fallback = document.createElement("div");
      fallback.className = formatClassMap.action;
      fallback.innerHTML = "<br>";
      firstBody.appendChild(fallback);

      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(fallback);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const clearAllEditorBodies = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      bodies.forEach((body) => {
        body.innerHTML = "";
      });
      ensureDocumentHasAtLeastOneLine();
    }, [ensureDocumentHasAtLeastOneLine, getAllBodies]);

    const normalizeBodiesAfterDelete = useCallback(() => {
      const bodies = getAllBodies();
      for (const body of bodies) {
        const removable: Node[] = [];
        body.childNodes.forEach((node) => {
          if (
            node.nodeType === Node.TEXT_NODE &&
            !(node.textContent || "").trim()
          ) {
            removable.push(node);
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const isBareEmpty =
              el.childNodes.length === 0 ||
              (el.innerHTML.trim() === "" && !el.textContent);
            if (isBareEmpty) {
              removable.push(node);
            }
          }
        });
        removable.forEach((node) => node.parentNode?.removeChild(node));
      }
    }, [getAllBodies]);

    const captureCommandSnapshot =
      useCallback((): EditorCommandSnapshot | null => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return null;

        const activeRange = getSelectionRangeInsideEditor();
        return {
          htmlByBody: bodies.map((body) => body.innerHTML),
          selection: activeRange
            ? serializeSelection(activeRange.cloneRange())
            : null,
        };
      }, [getAllBodies, getSelectionRangeInsideEditor, serializeSelection]);

    const commitCommandEntry = useCallback(
      (
        before: EditorCommandSnapshot | null,
        after: EditorCommandSnapshot | null
      ) => {
        if (!before || !after) return;
        if (before.htmlByBody.join("||") === after.htmlByBody.join("||"))
          return;

        const history = commandHistoryRef.current;
        if (history.applying) return;

        history.undo.push({ before, after });
        if (history.undo.length > MAX_COMMAND_HISTORY_ENTRIES) {
          history.undo.shift();
        }
        history.redo = [];
      },
      []
    );

    const isCurrentElementEmpty = () => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return true;
      const range = selection.getRangeAt(0);
      let currentElement = range.commonAncestorContainer;
      while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
        currentElement = currentElement.parentNode!;
      }
      while (
        currentElement &&
        (currentElement as HTMLElement).tagName !== "DIV" &&
        (currentElement as HTMLElement).contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        (currentElement as HTMLElement).contentEditable === "true"
      )
        return true;
      return (currentElement.textContent || "").trim().length === 0;
    };

    const getCurrentFormat = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return "action";
      let node = selection.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode!;
      }
      while (
        node &&
        node.parentNode &&
        (node.parentNode as HTMLElement).contentEditable !== "true"
      ) {
        node = node.parentNode;
      }
      if (node && node instanceof HTMLElement && node.className) {
        const format = screenplayFormats.find((f) =>
          node.classList.contains(formatClassMap[f.id])
        );
        if (format) return format.id;
      }
      return "action";
    };

    const applyFormatToCurrentLine = (formatType: string) => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      let currentElement = range.commonAncestorContainer;
      while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
        currentElement = currentElement.parentNode!;
      }
      while (
        currentElement &&
        (currentElement as HTMLElement).tagName !== "DIV" &&
        (currentElement as HTMLElement).contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        (currentElement as HTMLElement).contentEditable === "true"
      ) {
        document.execCommand("formatBlock", false, "div");
        const newSelection = window.getSelection();
        if (!newSelection || !newSelection.rangeCount) return;
        currentElement = newSelection.getRangeAt(0).commonAncestorContainer;
        while (
          currentElement &&
          currentElement.nodeType !== Node.ELEMENT_NODE
        ) {
          currentElement = currentElement.parentNode!;
        }
      }

      if (currentElement && currentElement instanceof HTMLElement) {
        Object.values(formatClassMap).forEach((cls) =>
          currentElement.classList.remove(cls)
        );
        currentElement.classList.add(formatClassMap[formatType]);

        const newRange = document.createRange();
        newRange.selectNodeContents(currentElement);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
        handleInput();
      }
    };

    // Helper to check if a node is a "character" format (should stay with following dialogue)
    const isCharacterNode = (node: Element) => {
      return node.classList.contains(formatClassMap["character"]);
    };

    // Helper to check if a node is dialogue/parenthetical (should stay with character)
    const isDialogueOrParenthetical = (node: Element) => {
      return (
        node.classList.contains(formatClassMap["dialogue"]) ||
        node.classList.contains(formatClassMap["parenthetical"])
      );
    };

    const repaginate = useCallback(() => {
      if (!containerRef.current) return;

      const nodes = getAllContentNodes();
      if (nodes.length === 0) return;

      const bodies = Array.from(
        containerRef.current.querySelectorAll(".screenplay-sheet__body")
      ) as HTMLElement[];

      if (bodies.length === 0) return;

      let currentBodyIndex = 0;
      let currentBody = bodies[currentBodyIndex];
      let currentHeight = 0;

      const allNodes = [...nodes];

      bodies.forEach((b) => (b.innerHTML = ""));

      currentBody = bodies[0];
      currentHeight = 0;
      currentBodyIndex = 0;

      let nodesBuffer: Element[] = [];

      // Get group of related nodes (character + dialogue/parenthetical)
      const getRelatedGroup = (startIndex: number): Element[] => {
        const group: Element[] = [allNodes[startIndex]];

        // If this is a character, include following dialogue/parenthetical
        if (isCharacterNode(allNodes[startIndex])) {
          for (let j = startIndex + 1; j < allNodes.length; j++) {
            if (isDialogueOrParenthetical(allNodes[j])) {
              group.push(allNodes[j]);
              // Only keep first dialogue block with character
              if (allNodes[j].classList.contains(formatClassMap["dialogue"])) {
                break;
              }
            } else {
              break;
            }
          }
        }
        return group;
      };

      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i] as HTMLElement;

        // Check if this is a character node - we need to keep it with its dialogue
        if (isCharacterNode(node)) {
          const group = getRelatedGroup(i);
          let groupHeight = 0;

          // Calculate total height of the group
          group.forEach((n) => {
            currentBody.appendChild(n);
            groupHeight +=
              (n as HTMLElement).offsetHeight +
              parseInt(window.getComputedStyle(n).marginTop || "0") +
              parseInt(window.getComputedStyle(n).marginBottom || "0");
          });

          // Remove them temporarily
          group.forEach((n) => currentBody.removeChild(n));

          // Check if group fits on current page
          if (
            currentHeight + groupHeight > CONTENT_HEIGHT_PX - 20 &&
            currentHeight > 0
          ) {
            // Move entire group to next page
            currentBodyIndex++;
            if (currentBodyIndex >= bodies.length) {
              nodesBuffer = allNodes.slice(i);
              break;
            }
            currentBody = bodies[currentBodyIndex];
            currentHeight = 0;
          }

          // Add the group
          group.forEach((n) => {
            currentBody.appendChild(n);
            currentHeight +=
              (n as HTMLElement).offsetHeight +
              parseInt(window.getComputedStyle(n).marginTop || "0") +
              parseInt(window.getComputedStyle(n).marginBottom || "0");
          });

          // Skip the nodes we already processed
          i += group.length - 1;
          continue;
        }

        // Regular node handling
        currentBody.appendChild(node);

        const nodeHeight =
          node.offsetHeight +
          parseInt(window.getComputedStyle(node).marginTop || "0") +
          parseInt(window.getComputedStyle(node).marginBottom || "0");

        if (currentHeight + nodeHeight > CONTENT_HEIGHT_PX - 20) {
          if (currentHeight > 0) {
            currentBody.removeChild(node);

            currentBodyIndex++;
            if (currentBodyIndex >= bodies.length) {
              nodesBuffer = allNodes.slice(i);
              break;
            }

            currentBody = bodies[currentBodyIndex];
            currentBody.appendChild(node);
            currentHeight = nodeHeight;
          } else {
            currentHeight += nodeHeight;
          }
        } else {
          currentHeight += nodeHeight;
        }
      }

      if (nodesBuffer.length > 0) {
        setPages((prev) => [
          ...prev,
          ...Array.from({ length: 1 }, (_, k) => prev.length + 1 + k),
        ]);
        nodesBuffer.forEach((n) => currentBody.appendChild(n));
      }
    }, [getAllContentNodes]);

    const handleInput = useCallback(() => {
      onContentChange();
      requestAnimationFrame(repaginate);

      if (containerRef.current) {
        const allText = getAllContentNodes()
          .map((n) => (n as HTMLElement).innerText)
          .join("\n");
        const words = allText.trim().split(/\s+/).filter(Boolean).length;
        const characters = allText.length;
        const scenes = containerRef.current.querySelectorAll(
          ".format-scene-header-1"
        ).length;
        onStatsChange({ words, characters, pages: pages.length, scenes });
      }

      const format = getCurrentFormat();
      onFormatChange(format);
    }, [
      onContentChange,
      onStatsChange,
      onFormatChange,
      getAllContentNodes,
      pages.length,
      repaginate,
    ]);

    const applyCommandSnapshot = useCallback(
      (snapshot: EditorCommandSnapshot) => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;

        const mergedHtml = snapshot.htmlByBody.join("");
        bodies.forEach((body, index) => {
          body.innerHTML = index === 0 ? mergedHtml : "";
        });
        ensureDocumentHasAtLeastOneLine();
        repaginate();
        handleInput();

        requestAnimationFrame(() => {
          if (!restoreSerializedSelection(snapshot.selection)) {
            focusEditorEnd();
          }
        });
      },
      [
        ensureDocumentHasAtLeastOneLine,
        focusEditorEnd,
        getAllBodies,
        handleInput,
        repaginate,
        restoreSerializedSelection,
      ]
    );

    const memoryManager = useMemo(() => new ContextMemoryManager(), []);
    const hybridClassifier = useMemo(() => {
      const hc = new HybridClassifier(memoryManager);
      hc.initialize();
      return hc;
    }, [memoryManager]);
    const feedbackCollector = useMemo(() => new FeedbackCollector(), []);

    const [pendingConfirmations, setPendingConfirmations] = useState<
      Array<{ pasteBatchId: string; count: number }>
    >([]);

    // حالة حوار تأكيد التصنيف
    const [confirmationState, setConfirmationState] = useState<{
      open: boolean;
      line: string;
      suggestedType: string;
      confidence: number;
      resolve: ((type: string) => void) | null;
    }>({
      open: false,
      line: "",
      suggestedType: "action",
      confidence: 0,
      resolve: null,
    });

    const handleConfirmClassification = (finalType: string) => {
      if (confirmationState.resolve) {
        confirmationState.resolve(finalType);
      }
      setConfirmationState((prev) => ({ ...prev, open: false, resolve: null }));
    };

    const handleCancelConfirmation = () => {
      if (confirmationState.resolve) {
        confirmationState.resolve(confirmationState.suggestedType);
      }
      setConfirmationState((prev) => ({ ...prev, open: false, resolve: null }));
    };

    const virtualEditorRef = useMemo(
      () => ({
        current: {
          get lastChild() {
            if (!containerRef.current) return null;
            const bodies = containerRef.current.querySelectorAll(
              ".screenplay-sheet__body"
            );
            if (bodies.length === 0) return null;
            return bodies[bodies.length - 1].lastChild;
          },
        } as unknown as HTMLDivElement,
      }),
      []
    );

    // Callback لطلب تأكيد المستخدم عند الثقة المنخفضة
    const requestConfirmation = useCallback(
      (
        line: string,
        suggestedType: string,
        confidence: number
      ): Promise<string> => {
        return new Promise((resolve) => {
          setConfirmationState({
            open: true,
            line,
            suggestedType,
            confidence,
            resolve,
          });
        });
      },
      []
    );

    const handlePaste = useCallback(
      async (e: React.ClipboardEvent<HTMLDivElement>) => {
        await newHandlePaste(
          e,
          virtualEditorRef,
          (formatType) => getFormatStyles(formatType, fixedSize, fixedFont),
          handleInput,
          memoryManager,
          undefined, // sessionId - default
          hybridClassifier,
          feedbackCollector,
          requestConfirmation,
          (pasteBatchId, pendingCount) => {
            setPendingConfirmations((prev) => [
              ...prev,
              { pasteBatchId, count: pendingCount },
            ]);
          },
          null,
          null,
          null,
          "clipboard"
        );
      },
      [
        handleInput,
        memoryManager,
        virtualEditorRef,
        hybridClassifier,
        feedbackCollector,
        requestConfirmation,
      ]
    );

    const importViaPastePipeline = useCallback(
      async (text: string, importSource: "clipboard" | "file-import") => {
        const pseudoPasteEvent = {
          preventDefault: () => {},
          clipboardData: {
            getData: (format: string) => (format === "text/plain" ? text : ""),
          },
        } as unknown as React.ClipboardEvent<HTMLDivElement>;

        await newHandlePaste(
          pseudoPasteEvent,
          virtualEditorRef,
          (formatType) => getFormatStyles(formatType, fixedSize, fixedFont),
          handleInput,
          memoryManager,
          undefined,
          hybridClassifier,
          feedbackCollector,
          requestConfirmation,
          (pasteBatchId, pendingCount) => {
            setPendingConfirmations((prev) => [
              ...prev,
              { pasteBatchId, count: pendingCount },
            ]);
          },
          null,
          null,
          null,
          importSource
        );
      },
      [
        virtualEditorRef,
        fixedSize,
        fixedFont,
        handleInput,
        memoryManager,
          hybridClassifier,
          feedbackCollector,
          requestConfirmation,
          setPendingConfirmations,
        ]
    );

    const executeCommandWithHistory = useCallback(
      async (operation: () => Promise<void>) => {
        const before = captureCommandSnapshot();
        await operation();
        const after = captureCommandSnapshot();
        commitCommandEntry(before, after);
      },
      [captureCommandSnapshot, commitCommandEntry]
    );

    const ensureSelectionReadyForPaste = useCallback(() => {
      const activeRange = getSelectionRangeInsideEditor();
      if (activeRange) return;
      focusEditorEnd();
    }, [focusEditorEnd, getSelectionRangeInsideEditor]);

    const clearDocumentForReplacePaste = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      bodies.forEach((body) => {
        body.innerHTML = "";
      });

      const firstBody = bodies[0];
      firstBody.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(firstBody);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }, [getAllBodies]);

    const pastePlainTextWithClassifier = useCallback(
      async (text: string) => {
        const normalized = (text ?? "").replace(/\r\n/g, "\n");
        if (!normalized.trim()) return;

        await executeCommandWithHistory(async () => {
          if (syntheticSelectAllRef.current) {
            clearAllEditorBodies();
            clearDocumentForReplacePaste();
          } else {
            ensureSelectionReadyForPaste();
          }
          await importViaPastePipeline(normalized, "clipboard");
        });
        syntheticSelectAllRef.current = false;
      },
      [
        clearAllEditorBodies,
        clearDocumentForReplacePaste,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        importViaPastePipeline,
      ]
    );

    const copyRangeToClipboard = useCallback(
      async (range: Range): Promise<boolean> => {
        const selectedText = extractPlainTextFromRange(range);
        try {
          await navigator.clipboard.writeText(selectedText);
          return true;
        } catch {
          return false;
        }
      },
      [extractPlainTextFromRange]
    );

    const hasSelection = useCallback((): boolean => {
      if (syntheticSelectAllRef.current) {
        return getAllContentNodes().length > 0;
      }
      const activeRange = getSelectionRangeInsideEditor();
      return Boolean(activeRange && !activeRange.collapsed);
    }, [getAllContentNodes, getSelectionRangeInsideEditor]);

    const copySelectionToClipboard = useCallback(async (): Promise<boolean> => {
      if (syntheticSelectAllRef.current) {
        const allText = getAllContentNodes()
          .map((node) => (node as HTMLElement).innerText)
          .join("\n")
          .trim();
        try {
          await navigator.clipboard.writeText(allText);
          return true;
        } catch {
          return false;
        }
      }

      const activeRange = getSelectionRangeInsideEditor();
      if (!activeRange || activeRange.collapsed) return false;
      return copyRangeToClipboard(activeRange.cloneRange());
    }, [
      copyRangeToClipboard,
      getAllContentNodes,
      getSelectionRangeInsideEditor,
    ]);

    const cutSelectionToClipboard = useCallback(async (): Promise<boolean> => {
      if (syntheticSelectAllRef.current) {
        const allText = getAllContentNodes()
          .map((node) => (node as HTMLElement).innerText)
          .join("\n")
          .trim();

        try {
          await navigator.clipboard.writeText(allText);
        } catch {
          return false;
        }

        await executeCommandWithHistory(async () => {
          clearAllEditorBodies();
          repaginate();
          handleInput();
        });
        syntheticSelectAllRef.current = false;
        return true;
      }

      const activeRange = getSelectionRangeInsideEditor();
      if (!activeRange || activeRange.collapsed) return false;

      const rangeToDelete = activeRange.cloneRange();
      const copied = await copyRangeToClipboard(rangeToDelete.cloneRange());
      if (!copied) return false;

      await executeCommandWithHistory(async () => {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(rangeToDelete);
        }

        rangeToDelete.deleteContents();
        rangeToDelete.collapse(true);

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(rangeToDelete);
        }

        normalizeBodiesAfterDelete();
        ensureDocumentHasAtLeastOneLine();
        repaginate();
        handleInput();
      });

      syntheticSelectAllRef.current = false;
      return true;
    }, [
      clearAllEditorBodies,
      copyRangeToClipboard,
      ensureDocumentHasAtLeastOneLine,
      executeCommandWithHistory,
      getAllContentNodes,
      getSelectionRangeInsideEditor,
      handleInput,
      normalizeBodiesAfterDelete,
      repaginate,
    ]);

    const undoCommandOperation = useCallback((): boolean => {
      const history = commandHistoryRef.current;
      const entry = history.undo.pop();
      if (!entry) return false;

      history.redo.push(entry);
      history.applying = true;
      try {
        applyCommandSnapshot(entry.before);
      } finally {
        history.applying = false;
      }
      syntheticSelectAllRef.current = false;
      return true;
    }, [applyCommandSnapshot]);

    const redoCommandOperation = useCallback((): boolean => {
      const history = commandHistoryRef.current;
      const entry = history.redo.pop();
      if (!entry) return false;

      history.undo.push(entry);
      history.applying = true;
      try {
        applyCommandSnapshot(entry.after);
      } finally {
        history.applying = false;
      }
      syntheticSelectAllRef.current = false;
      return true;
    }, [applyCommandSnapshot]);

    const findFirstContentNode = useCallback(
      (root: HTMLElement): Node | null => {
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return (node.textContent || "").length > 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP;
              }

              if (
                node.nodeType === Node.ELEMENT_NODE &&
                (node as HTMLElement).tagName === "BR"
              ) {
                return NodeFilter.FILTER_ACCEPT;
              }

              return NodeFilter.FILTER_SKIP;
            },
          }
        );
        return walker.nextNode();
      },
      []
    );

    const findLastContentNode = useCallback(
      (root: HTMLElement): Node | null => {
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return (node.textContent || "").length > 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP;
              }

              if (
                node.nodeType === Node.ELEMENT_NODE &&
                (node as HTMLElement).tagName === "BR"
              ) {
                return NodeFilter.FILTER_ACCEPT;
              }

              return NodeFilter.FILTER_SKIP;
            },
          }
        );

        let current = walker.nextNode();
        let last: Node | null = null;
        while (current) {
          last = current;
          current = walker.nextNode();
        }

        return last;
      },
      []
    );

    const selectAllContent = useCallback(() => {
      const bodies = getAllBodies();
      if (bodies.length === 0) return;

      const firstBodyWithContent =
        bodies.find((body) => (findFirstContentNode(body) ?? null) !== null) ??
        bodies[0];
      const lastBodyWithContent =
        [...bodies]
          .reverse()
          .find((body) => (findLastContentNode(body) ?? null) !== null) ??
        bodies[bodies.length - 1];

      const startNode =
        findFirstContentNode(firstBodyWithContent) ?? firstBodyWithContent;
      const endNode =
        findLastContentNode(lastBodyWithContent) ?? lastBodyWithContent;

      const selection = window.getSelection();
      if (!selection) return;

      const range = document.createRange();
      range.setStart(startNode, 0);
      range.setEnd(
        endNode,
        clampSelectionOffset(endNode, Number.MAX_SAFE_INTEGER)
      );
      selection.removeAllRanges();
      selection.addRange(range);
      syntheticSelectAllRef.current = true;
    }, [
      clampSelectionOffset,
      findFirstContentNode,
      findLastContentNode,
      getAllBodies,
    ]);

    // --- Import Logic ---
    const importClassifiedText = useCallback(
      async (text: string, mode: FileImportMode) => {
        await executeCommandWithHistory(async () => {
          if (mode === "replace") {
            clearDocumentForReplacePaste();
            repaginate();
          } else {
            ensureSelectionReadyForPaste();
          }

          await importViaPastePipeline(text, "clipboard");
        });
        syntheticSelectAllRef.current = false;
      },
      [
        clearDocumentForReplacePaste,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        importViaPastePipeline,
        repaginate,
      ]
    );

    const importStructuredBlocks = useCallback(
      async (blocks: ScreenplayBlock[], mode: FileImportMode) => {
        const html = screenplayBlocksToHtml(blocks);

        await executeCommandWithHistory(async () => {
          if (mode === "replace") {
            const bodies = getAllBodies();
            if (bodies.length === 0) return;
            bodies.forEach((body) => {
              body.innerHTML = "";
            });
            bodies[0].innerHTML =
              html.trim().length > 0
                ? html
                : '<div class="format-action"><br></div>';
            ensureDocumentHasAtLeastOneLine();
            repaginate();
            handleInput();
            focusEditorEnd();
            return;
          }

          ensureSelectionReadyForPaste();
          document.execCommand("insertHTML", false, html);
          ensureDocumentHasAtLeastOneLine();
          repaginate();
          handleInput();
        });

        syntheticSelectAllRef.current = false;
      },
      [
        ensureDocumentHasAtLeastOneLine,
        ensureSelectionReadyForPaste,
        executeCommandWithHistory,
        focusEditorEnd,
        getAllBodies,
        handleInput,
        repaginate,
      ]
    );

    // Expose importer
    useEffect(() => {
      if (onImporterReady) {
        onImporterReady(importClassifiedText);
      }
    }, [onImporterReady, importClassifiedText]);

    const handleRunPendingConfirmations = useCallback(async () => {
      if (pendingConfirmations.length === 0) return;
      const batches = [...pendingConfirmations];
      setPendingConfirmations([]);
      for (const batch of batches) {
        await runPendingPasteConfirmations(batch.pasteBatchId);
      }
    }, [pendingConfirmations]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const currentFormat = getCurrentFormat();
        const nextFormat = getNextFormatOnEnter(currentFormat);

        document.execCommand("insertParagraph");

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          let parentElement = range.startContainer.parentElement;

          if (parentElement && parentElement.tagName !== "DIV") {
            parentElement = parentElement.parentElement;
          }

          if (parentElement && parentElement.tagName === "DIV") {
            Object.values(formatClassMap).forEach((cls) =>
              parentElement.classList.remove(cls)
            );
            parentElement.classList.add(formatClassMap[nextFormat]);

            range.selectNodeContents(parentElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        handleInput();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const currentFormat = getCurrentFormat();
        const isEmpty = isCurrentElementEmpty();
        const nextFormat = getNextFormatOnTab(
          currentFormat,
          isEmpty,
          e.shiftKey
        );
        if (nextFormat !== currentFormat) {
          applyFormatToCurrentLine(nextFormat);
        }
        return;
      }

      // Use formatShortcutMap from constants instead of inline map
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (formatShortcutMap[key]) {
          e.preventDefault();
          applyFormatToCurrentLine(formatShortcutMap[key]);
        }
      }
    };

    useEffect(() => {
      repaginate();
    }, [pages.length, repaginate]);

    useImperativeHandle(ref, () => ({
      insertContent: (
        content: string,
        mode: "insert" | "replace" = "insert"
      ) => {
        if (mode === "replace") {
          if (containerRef.current) {
            const bodies = containerRef.current.querySelectorAll(
              ".screenplay-sheet__body"
            );
            bodies.forEach((b) => (b.innerHTML = ""));
            if (bodies[0]) {
              bodies[0].innerHTML = content;
              repaginate();
              handleInput();
            }
          }
        } else {
          document.execCommand("insertHTML", false, content);
          handleInput();
        }
      },
      getElement: () => containerRef.current,
      getAllText: () => {
        const nodes = getAllContentNodes();
        return nodes.map((n) => (n as HTMLElement).innerText).join("\n");
      },
      getAllHtml: () => {
        const bodies = getAllBodies();
        return bodies
          .map((body) => body.innerHTML.trim())
          .filter((content) => content.length > 0 && content !== "<br>")
          .join("");
      },
      hasSelection,
      copySelectionToClipboard,
      cutSelectionToClipboard,
      pastePlainTextWithClassifier,
      undoCommandOperation,
      redoCommandOperation,
      selectAllContent,
      focusEditor: () => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;
        const target = bodies[bodies.length - 1];
        target.focus();
      },
      importClassifiedText,
      importStructuredBlocks,
      exportStructuredBlocks: extractBlocksFromEditorBodies,
    }));

    return (
      <div className="screenplay-container" ref={containerRef}>
        {pendingConfirmations.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-white/10 bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 transition-colors hover:bg-neutral-800"
              onClick={handleRunPendingConfirmations}
            >
              تأكيد التصنيفات (
              {pendingConfirmations.reduce((sum, x) => sum + x.count, 0)})
            </button>
          </div>
        )}
        <ClassificationConfirmationDialog
          open={confirmationState.open}
          line={confirmationState.line}
          suggestedType={confirmationState.suggestedType}
          confidence={confirmationState.confidence}
          onConfirm={handleConfirmClassification}
          onCancel={handleCancelConfirmation}
        />
        {pages.map((pageId, index) => (
          <div
            key={pageId}
            className="screenplay-sheet"
            style={{
              borderRadius: "1.5rem",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="screenplay-sheet__header">
              {/* Optional content for header */}
            </div>

            <div
              className="screenplay-sheet__body"
              contentEditable={true}
              suppressContentEditableWarning={true}
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
            />

            <div className="screenplay-sheet__footer">
              <div className="screenplay-page-number">{index + 1}.</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
);

EditorArea.displayName = "EditorArea";
