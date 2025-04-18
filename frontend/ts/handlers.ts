// Import utility functions
import { debounce, takeCodeSnap, showNotification } from "./utils";
import { terminalManager } from "./terminal";

// Define WebSocket-related interfaces
interface CinCoutSocket {
  init: (messageHandler: (event: MessageEvent) => void) => void;
  sendData: (data: any) => Promise<void>;
  isConnected: () => boolean;
  getSessionId: () => string | null;
  setSessionId: (id: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  setProcessRunning: (running: boolean) => void;
  isProcessRunning: () => boolean;
  updateStateFromMessage: (type: string) => void;
  getCompilationState: () => string;
}

// Define message types
interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// DOM elements interface
interface DomElements {
  [key: string]: HTMLElement | null;
}

// Declare global objects
declare global {
  interface Window {
    CinCoutSocket: CinCoutSocket;
    editor: any;
    assemblyView: any;
    fitAddon: any;
    terminal: any;
    templates: any;
    templateLists: Record<string, string[]>;
    loadedTemplates: Set<string>;
    updateTemplates: () => Promise<void>;
    setTemplate: () => Promise<void>;
    html2canvas: any;
    getTerminalTheme: () => any;
    resetCompilationState: () => void;
  }
}

// Module pattern for better organization
const CinCoutUI = (function () {
  // DOM element cache for performance
  const domElements: DomElements = {
    template: document.getElementById("template"),
    vimMode: document.getElementById("vimMode"),
    language: document.getElementById("language"),
    outputTab: document.getElementById("outputTab"),
    assemblyTab: document.getElementById("assemblyTab"),
    output: document.getElementById("output"),
    assembly: document.getElementById("assembly"),
    compile: document.getElementById("compile"),
    memcheck: document.getElementById("memcheck"),
    format: document.getElementById("format"),
    viewAssembly: document.getElementById("viewAssembly"),
    styleCheck: document.getElementById("styleCheck"),
    themeSelect: document.getElementById("theme-select"),
    outputPanel: document.getElementById("outputPanel"),
    closeOutput: document.getElementById("closeOutput"),
    codesnap: document.getElementById("codeSnap"),
  };

  /**
   * Handle incoming WebSocket messages
   * @param {MessageEvent} event - The WebSocket message event
   */
  function handleWebSocketMessage(event: MessageEvent): void {
    const data = JSON.parse(event.data) as WebSocketMessage;

    // Update state in the CinCoutSocket module
    (window as any).CinCoutSocket.updateStateFromMessage(data.type);

    switch (data.type) {
      case "connected":
        (window as any).CinCoutSocket.setSessionId(data.sessionId);
        break;

      case "compiling":
        // Make sure the output panel is visible
        if (domElements.outputPanel) {
          domElements.outputPanel.style.display = "flex";
        }
        document.querySelector(".editor-panel")?.classList.add("with-output");
        domElements.outputTab?.click();

        if (domElements.output) {
          domElements.output.innerHTML = '<div class="loading">Compiling</div>';
        }

        // Refresh editor after layout change
        if ((window as any).editor) {
          setTimeout(() => (window as any).editor.refresh(), 10);
        }
        break;

      case "compile-error":
        // The output is already formatted by the backend
        if (domElements.output) {
          domElements.output.innerHTML = `<div class="error-output" style="white-space: pre-wrap; overflow: visible;">${data.output}</div>`;
        }

        // Disconnect WebSocket immediately after error
        (window as any).CinCoutSocket.disconnect();
        break;

      case "compile-success":
        // Clear any previous terminal instance to prevent double execution
        terminalManager.dispose();

        // Make sure the output panel is visible
        if (domElements.outputPanel) {
          domElements.outputPanel.style.display = "flex";
        }
        document.querySelector(".editor-panel")?.classList.add("with-output");
        domElements.outputTab?.click();

        // Initialize the terminal manager with current DOM elements
        terminalManager.setDomElements({
          output: domElements.output,
          outputPanel: domElements.outputPanel,
          outputTab: domElements.outputTab,
        });

        // Create terminal interface
        terminalManager.setupTerminal();

        // Refresh editor after layout change
        if ((window as any).editor) {
          setTimeout(() => (window as any).editor.refresh(), 10);
        }
        break;

      case "output":
        terminalManager.write(data.output);
        break;

      case "error":
        console.error(
          "Received error from server:",
          data.output || data.message
        );
        terminalManager.writeError(data.output || data.message);
        break;

      case "exit":
        terminalManager.writeExitMessage(data.code);

        // Disconnect WebSocket immediately when program exits
        (window as any).CinCoutSocket.disconnect();
        break;

      default:
        console.log(`Unknown message type: ${data.type}`);
    }
  }

  /**
   * Initialize event handlers
   */
  function initEventHandlers(): void {
    // Language change handler - must be added before template events
    if (domElements.language) {
      domElements.language.addEventListener(
        "change",
        async function (this: HTMLSelectElement) {
          const lang = this.value;

          // Update available templates for the selected language
          if (typeof window.updateTemplates === "function") {
            await window.updateTemplates();
          }
        }
      );
    }

    // Template change handler
    if (domElements.template) {
      domElements.template.addEventListener(
        "change",
        function (this: HTMLSelectElement) {
          if (typeof window.setTemplate === "function") {
            window.setTemplate();
          }
        }
      );
    }

    // Initialize CodeSnap button
    if (domElements.codesnap) {
      domElements.codesnap.addEventListener(
        "click",
        debounce(takeCodeSnap, 300)
      );
    }

    // Compile button event with debounce only
    if (domElements.compile) {
      domElements.compile.addEventListener(
        "click",
        debounce(async function () {
          // Check if a process is already running using the single source of truth
          if ((window as any).CinCoutSocket.isProcessRunning()) {
            console.log(
              "A process is already running, ignoring compile request"
            );
            return;
          }

          const code = (window as any).editor.getValue();
          const lang = (domElements.language as HTMLSelectElement)?.value;
          const compiler = (
            document.getElementById("compiler") as HTMLSelectElement
          )?.value;
          const optimization = (
            document.getElementById("optimization") as HTMLSelectElement
          )?.value;

          console.log(
            `Compiling ${lang} code with ${compiler} (${optimization})`
          );

          if (code.trim() === "") {
            if (domElements.output) {
              domElements.output.innerHTML =
                '<div class="error-output">Error: Code cannot be empty</div>';
            }
            return;
          }

          try {
            // Ensure output panel is visible
            if (domElements.outputPanel) {
              domElements.outputPanel.style.display = "flex";
            }
            document
              .querySelector(".editor-panel")
              ?.classList.add("with-output");
            domElements.outputTab?.click();

            if (domElements.output) {
              domElements.output.innerHTML =
                '<div class="loading">Connecting...</div>';
            }

            // Connect to WebSocket server for compilation
            await (window as any).CinCoutSocket.connect();
            if (domElements.output) {
              domElements.output.innerHTML =
                '<div class="loading">Sending code for compilation...</div>';
            }

            await (window as any).CinCoutSocket.sendData({
              type: "compile",
              code: code,
              lang: lang,
              compiler: compiler,
              optimization: optimization,
            });
          } catch (error) {
            console.error("WebSocket operation failed:", error);
            if (domElements.output) {
              domElements.output.innerHTML =
                '<div class="error-output">Error: WebSocket connection failed. Please try again.</div>';
            }

            // Ensure connection is closed on error
            try {
              (window as any).CinCoutSocket.disconnect();
            } catch (e) {
              console.error("Error disconnecting after failure:", e);
            }
          }
        }, 300)
      ); // 300ms debounce
    }

    // Close output panel event - send cleanup signal to backend
    if (domElements.closeOutput) {
      domElements.closeOutput.addEventListener("click", async function () {
        try {
          // Check if there's an active session to clean up
          const sessionId = (window as any).CinCoutSocket.getSessionId();
          if (sessionId && (window as any).CinCoutSocket.isConnected()) {
            console.log(
              `Sending cleanup request for session ${sessionId} and disconnecting...`
            );

            try {
              // Send cleanup request
              await (window as any).CinCoutSocket.sendData({
                type: "cleanup",
                sessionId: sessionId,
              });
            } catch (e) {
              console.error("Error sending cleanup message:", e);
            }

            // Disconnect regardless of cleanup success
            (window as any).CinCoutSocket.disconnect();
          }
        } catch (error) {
          console.error("Failed to handle cleanup:", error);
        }
      });
    }

    // View Assembly button click handler with debounce only
    if (domElements.viewAssembly) {
      domElements.viewAssembly.addEventListener(
        "click",
        debounce(function () {
          const code = (window as any).editor.getValue();
          const lang = (domElements.language as HTMLSelectElement)?.value;
          const compiler = (
            document.getElementById("compiler") as HTMLSelectElement
          )?.value;
          const optimization = (
            document.getElementById("optimization") as HTMLSelectElement
          )?.value;

          domElements.assemblyTab?.click();

          // Create a loading div
          const loadingDiv = document.createElement("div");
          loadingDiv.className = "loading";
          loadingDiv.textContent = "Generating assembly code";

          // Get assembly div and its CodeMirror container
          const assemblyDiv = domElements.assembly as HTMLElement;
          const cmContainer = assemblyDiv.querySelector(".CodeMirror");

          // Insert loadingDiv before cmcontainer
          if (cmContainer) {
            assemblyDiv.insertBefore(loadingDiv, cmContainer);
          } else {
            assemblyDiv.appendChild(loadingDiv);
          }

          if (window.assemblyView) {
            window.assemblyView.setValue("");
          }

          fetch("/api/compile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: code,
              lang: lang,
              compiler: compiler,
              optimization: optimization,
              action: "assembly",
            }),
          })
            .then((response) => response.text())
            .then((data) => {
              // Remove loading div
              if (loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
              }

              const trimmedData = data.trim();
              if (window.assemblyView) {
                window.assemblyView.setValue(trimmedData);
              }
            })
            .catch((error) => {
              // Remove loading div
              if (loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
              }

              if (window.assemblyView) {
                window.assemblyView.setValue("Error: " + error);
              }
            });
        }, 300)
      ); // 300ms debounce
    }

    // Memory check button click handler with debounce only
    if (domElements.memcheck) {
      domElements.memcheck.addEventListener(
        "click",
        debounce(function () {
          const code = (window as any).editor.getValue();
          const lang = (domElements.language as HTMLSelectElement)?.value;
          const compiler = (
            document.getElementById("compiler") as HTMLSelectElement
          )?.value;
          const optimization = (
            document.getElementById("optimization") as HTMLSelectElement
          )?.value;

          domElements.outputTab?.click();
          if (domElements.output) {
            domElements.output.innerHTML =
              "<div class='loading'>Running memory check...</div>";
          }

          fetch("/api/memcheck", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: code,
              lang: lang,
              compiler: compiler,
              optimization: optimization,
            }),
          })
            .then((response) => response.text())
            .then((data) => {
              if (domElements.output) {
                domElements.output.innerHTML = `<div class="memcheck-output" style="white-space: pre-wrap; overflow: visible;">${data}</div>`;
              }
            })
            .catch((error) => {
              if (domElements.output) {
                domElements.output.innerHTML = `<div class="error-output" style="white-space: pre-wrap; overflow: visible;">Error: ${error}</div>`;
              }
            });
        }, 300)
      ); // 300ms debounce
    }

    // Format button click handler with debounce only
    if (domElements.format) {
      domElements.format.addEventListener(
        "click",
        debounce(function () {
          const code = (window as any).editor.getValue();
          const cursor = (window as any).editor.getCursor();
          const lang = (domElements.language as HTMLSelectElement)?.value;

          fetch("/api/format", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: code,
              lang: lang,
            }),
          })
            .then((response) => response.text())
            .then((data) => {
              // Remove leading and trailing newlines
              const formattedData = data
                .replace(/^\n+/, "")
                .replace(/\n+$/, "");
              const scrollInfo = (window as any).editor.getScrollInfo();
              (window as any).editor.setValue(formattedData);
              (window as any).editor.setCursor(cursor);
              (window as any).editor.scrollTo(scrollInfo.left, scrollInfo.top);
              (window as any).editor.refresh();

              // Get the editor panel dimensions for centered notification
              const editorPanel = document.querySelector(".editor-panel");
              let position = { top: "50%", left: "50%" };

              // Show success notification in the center of the editor panel
              showNotification(
                "success",
                "Code formatted successfully",
                2000,
                position
              );
            })
            .catch((error) => {
              console.error("Format error:", error);
              // Show error notification in the center of the editor panel
              showNotification("error", "Failed to format code", 3000, {
                top: "50%",
                left: "50%",
              });
            });
        }, 300)
      ); // 300ms debounce
    }

    // Style check button click handler with debounce only
    if (domElements.styleCheck) {
      domElements.styleCheck.addEventListener(
        "click",
        debounce(function () {
          const code = (window as any).editor.getValue();
          const lang = (domElements.language as HTMLSelectElement)?.value;

          domElements.outputTab?.click();
          if (domElements.output) {
            domElements.output.innerHTML =
              "<div class='loading'>Running style check...</div>";
          }

          fetch("/api/styleCheck", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: code,
              lang: lang,
            }),
          })
            .then((response) => response.text())
            .then((data) => {
              const lines = data.split("\n");
              const formattedLines = lines
                .map((line) => {
                  if (line.trim()) {
                    // The line is already formatted by the backend
                    return `<div class="style-block" style="white-space: pre-wrap; overflow: visible;">${line}</div>`;
                  }
                  return "";
                })
                .filter((line) => line);

              if (domElements.output) {
                domElements.output.innerHTML = `<div class="style-check-output" style="white-space: pre-wrap; overflow: visible;">${formattedLines.join(
                  "\n"
                )}</div>`;
              }
            })
            .catch((error) => {
              if (domElements.output) {
                domElements.output.innerHTML = `<div class="error-output" style="white-space: pre-wrap; overflow: visible;">Error: ${error}</div>`;
              }
            });
        }, 300)
      ); // 300ms debounce
    }

    // Initialize theme selection
    if (domElements.themeSelect) {
      domElements.themeSelect.addEventListener(
        "change",
        function (this: HTMLSelectElement) {
          const theme = this.value;
          (window as any).applyTheme(theme);
        }
      );
    }

    // Initialize Vim mode toggle
    if (domElements.vimMode) {
      domElements.vimMode.addEventListener(
        "change",
        function (this: HTMLInputElement) {
          if ((window as any).editor) {
            (window as any).editor.setOption(
              "keyMap",
              this.checked ? "vim" : "default"
            );
          }
        }
      );
    }
  }

  /**
   * Initialize all components
   */
  function init(): void {
    // Initialize WebSocket handler but don't connect yet
    (window as any).CinCoutSocket.init(handleWebSocketMessage);

    // Initialize event handlers
    initEventHandlers();
  }

  // Public API
  return {
    init: init,
  };
})();

// Initialize the UI when the DOM is ready
document.addEventListener("DOMContentLoaded", CinCoutUI.init);
