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
  getFormatStyles,
  getNextFormatOnTab,
  getNextFormatOnEnter,
  HybridClassifier,
  FeedbackCollector,
} from "@/utils";
import { FileImportMode } from "@/types/file-import"; // Import this
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
  selectAllContent: () => void;
  focusEditor: () => void;
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

    const getAllContentNodes = () => {
      if (!containerRef.current) return [];
      const bodies = containerRef.current.querySelectorAll(
        ".screenplay-sheet__body"
      );
      const nodes: Element[] = [];
      bodies.forEach((body) => {
        Array.from(body.children).forEach((child) => nodes.push(child));
      });
      return nodes;
    };

    const getAllBodies = () => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLDivElement>(
          ".screenplay-sheet__body"
        )
      );
    };

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
    }, []);

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
      pages.length,
      repaginate,
    ]);

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
          }
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
      async (text: string) => {
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
          }
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
      ]
    );

    // --- Import Logic ---
    const importClassifiedText = useCallback(
      async (text: string, mode: FileImportMode) => {
        // Ensure selection and focus are valid before injecting text via paste pipeline.

        if (mode === "replace") {
          if (containerRef.current) {
            const bodies = containerRef.current.querySelectorAll(".screenplay-sheet__body");
            bodies.forEach(b => b.innerHTML = "");
            // Focus first body
            (bodies[0] as HTMLElement)?.focus();
            repaginate();
          }
        } else {
          // INSERT mode
          // Ensure focus
          const sel = window.getSelection();
          if (!sel?.rangeCount) {
            // Fallback to end of doc if no selection
            const bodies = getAllBodies();
            if (bodies.length > 0) {
              const last = bodies[bodies.length - 1];
              last.focus();
              // move cursor to end
              const range = document.createRange();
              range.selectNodeContents(last);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }
        }

        await importViaPastePipeline(text);
      },
      [importViaPastePipeline, repaginate]
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
      selectAllContent: () => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;

        const firstBody = bodies[0];
        const lastBody = bodies[bodies.length - 1];
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.setStart(firstBody, 0);
        range.setEnd(lastBody, lastBody.childNodes.length);
        selection.removeAllRanges();
        selection.addRange(range);
      },
      focusEditor: () => {
        const bodies = getAllBodies();
        if (bodies.length === 0) return;
        const target = bodies[bodies.length - 1];
        target.focus();
      },
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
