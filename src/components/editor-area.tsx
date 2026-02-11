"use client";
import React, { forwardRef, useCallback, useRef } from "react";
import { formatClassMap, screenplayFormats } from "@/lib/screenplay-config";
import { handlePaste as newHandlePaste } from "@/lib/paste-classifier";
import { ContextMemoryManager } from "@/lib/context-memory-manager";
import { getFormatStyles } from "@/lib/editor-styles";

interface EditorAreaProps {
  onContentChange: () => void;
  font: string;
  size: string;
  pageCount: number;
}

export const EditorArea = forwardRef<HTMLDivElement, EditorAreaProps>(
  ({ onContentChange, font, size, pageCount }, ref) => {
    const memoryManager = useRef(new ContextMemoryManager()).current;

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
        currentElement instanceof HTMLElement &&
        currentElement.tagName !== "DIV" &&
        currentElement.contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        !(currentElement instanceof HTMLElement) ||
        currentElement.contentEditable === "true"
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
        currentElement instanceof HTMLElement &&
        currentElement.tagName !== "DIV" &&
        currentElement.contentEditable !== "true"
      ) {
        currentElement = currentElement.parentNode!;
      }
      if (
        !currentElement ||
        !(currentElement instanceof HTMLElement) ||
        currentElement.contentEditable === "true"
      ) {
        document.execCommand("formatBlock", false, "div");
        // Re-select to get the new div
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
        // Clear existing format classes
        Object.values(formatClassMap).forEach((cls) =>
          currentElement.classList.remove(cls)
        );
        // Add new format class
        currentElement.classList.add(formatClassMap[formatType]);

        const newRange = document.createRange();
        newRange.selectNodeContents(currentElement);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
        onContentChange();
      }
    };

    const getNextFormatOnTab = (
      currentFormat: string,
      isEmpty = false,
      shiftPressed = false
    ) => {
      const mainSequence = [
        "scene-header-1",
        "action",
        "character",
        "transition",
      ];
      if (currentFormat === "character" && isEmpty)
        return shiftPressed ? "action" : "transition";
      if (currentFormat === "dialogue")
        return shiftPressed ? "character" : "parenthetical";
      if (currentFormat === "parenthetical")
        return shiftPressed ? "dialogue" : "dialogue";

      const currentIndex = mainSequence.indexOf(currentFormat);
      if (currentIndex !== -1) {
        if (shiftPressed)
          return mainSequence[
            (currentIndex - 1 + mainSequence.length) % mainSequence.length
          ];
        else return mainSequence[(currentIndex + 1) % mainSequence.length];
      }
      return currentFormat;
    };

    const handlePaste = useCallback(
      async (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (typeof ref === "function" || !ref) return;
        await newHandlePaste(
          e,
          ref,
          (formatType) => getFormatStyles(formatType, size, font),
          onContentChange,
          memoryManager
        );
      },
      [ref, size, font, onContentChange, memoryManager]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const currentFormat = getCurrentFormat();
        const nextFormat = getNextFormatOnEnter(currentFormat);

        document.execCommand("insertParagraph");

        // The new paragraph is now the current selection. We need to format it.
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          let parentElement = range.startContainer.parentElement;

          if (parentElement && parentElement.tagName !== "DIV") {
            parentElement = parentElement.parentElement;
          }

          if (parentElement && parentElement.tagName === "DIV") {
            // Clear existing format classes
            Object.values(formatClassMap).forEach((cls) =>
              parentElement.classList.remove(cls)
            );
            // Add new format class
            parentElement.classList.add(formatClassMap[nextFormat]);

            // Ensure cursor is inside the newly formatted element
            range.selectNodeContents(parentElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        onContentChange();
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

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const formatKeys: { [key: string]: string } = {
          "1": "scene-header-1",
          "2": "character",
          "3": "dialogue",
          "4": "action",
          "6": "transition",
        };
        if (formatKeys[key]) {
          e.preventDefault();
          applyFormatToCurrentLine(formatKeys[key]);
        }
      }
    };

    return (
      <div className="flex-grow bg-background p-4">
        <div className="relative mx-auto w-full max-w-[calc(21cm+4rem)]">
          <div
            ref={ref}
            contentEditable={true}
            suppressContentEditableWarning={true}
            className="content-editable editor-page"
            onInput={onContentChange}
            onKeyUp={onContentChange}
            onMouseUp={onContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            style={{
              fontFamily: `${font}, 'PT Sans', sans-serif`,
              fontSize: size,
              lineHeight: 1.8,
            }}
          />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 top-0 -z-10">
            {Array.from({ length: pageCount }).map((_, i) => (
              <div key={i} className="editor-page !p-0">
                <span className="editor-page-number">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

EditorArea.displayName = "EditorArea";

// Helper to get next format on Enter
const getNextFormatOnEnter = (currentFormat: string): string => {
  const transitions: { [key: string]: string } = {
    basmala: "scene-header-1",
    "scene-header-top-line": "action",
    "scene-header-1": "action",
    "scene-header-2": "action",
    "scene-header-3": "action",
    action: "action",
    character: "dialogue",
    parenthetical: "dialogue",
    dialogue: "character",
    transition: "scene-header-1",
  };
  return transitions[currentFormat] || "action";
};
