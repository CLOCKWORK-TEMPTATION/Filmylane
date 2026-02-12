import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handlePasteMock } = vi.hoisted(() => ({
  handlePasteMock: vi.fn(async () => {}),
}));

vi.mock("@/utils", () => {
  class MockContextMemoryManager {}
  class MockHybridClassifier {
    constructor(_memoryManager: unknown) {}
    initialize() {}
  }
  class MockFeedbackCollector {}

  return {
    handlePaste: handlePasteMock,
    runPendingPasteConfirmations: vi.fn(async () => {}),
    ContextMemoryManager: MockContextMemoryManager,
    getFormatStyles: vi.fn(() => ({})),
    getNextFormatOnTab: vi.fn(() => "action"),
    getNextFormatOnEnter: vi.fn(() => "action"),
    HybridClassifier: MockHybridClassifier,
    FeedbackCollector: MockFeedbackCollector,
  };
});

import { EditorArea, type EditorHandle } from "./EditorArea";

function setCursorToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("EditorArea file import integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let editorRef: React.RefObject<EditorHandle | null>;

  beforeEach(async () => {
    // React 18/19 act environment flag for jsdom tests
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    handlePasteMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    editorRef = createRef<EditorHandle>();

    await act(async () => {
      root.render(
        <EditorArea
          ref={editorRef}
          onContentChange={() => {}}
          onStatsChange={() => {}}
          onFormatChange={() => {}}
          font="AzarMehrMonospaced-San"
          size="12pt"
          pageCount={1}
        />
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("replace mode clears existing content and routes through handlePaste", async () => {
    const body = container.querySelector(".screenplay-sheet__body") as HTMLElement;
    expect(body).toBeTruthy();

    body.innerHTML = '<div class="format-action">OLD CONTENT</div>';
    setCursorToEnd(body);

    await act(async () => {
      await editorRef.current?.importClassifiedText("new imported text", "replace");
    });

    expect(handlePasteMock).toHaveBeenCalledTimes(1);
    const eventArg = handlePasteMock.mock.calls[0][0] as {
      clipboardData: { getData: (format: string) => string };
    };
    expect(eventArg.clipboardData.getData("text/plain")).toBe("new imported text");
    expect(body.innerHTML).not.toContain("OLD CONTENT");
  });

  it("insert mode preserves existing content and routes through handlePaste", async () => {
    const body = container.querySelector(".screenplay-sheet__body") as HTMLElement;
    expect(body).toBeTruthy();

    body.innerHTML = '<div class="format-action">KEEP CONTENT</div>';
    setCursorToEnd(body);

    await act(async () => {
      await editorRef.current?.importClassifiedText("inserted text", "insert");
    });

    expect(handlePasteMock).toHaveBeenCalledTimes(1);
    const eventArg = handlePasteMock.mock.calls[0][0] as {
      clipboardData: { getData: (format: string) => string };
    };
    expect(eventArg.clipboardData.getData("text/plain")).toBe("inserted text");
    expect(body.innerHTML).toContain("KEEP CONTENT");
  });
});
