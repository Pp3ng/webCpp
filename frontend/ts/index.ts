// 1. Import base CSS
import "codemirror/lib/codemirror.css";
import "codemirror/addon/hint/show-hint.css";
import "codemirror/addon/fold/foldgutter.css";
import "xterm/css/xterm.css";

// 2. Import local CSS
import "../css/base.css";
import "../css/buttons.css";
import "../css/components.css";
import "../css/layout.css";
import "../css/memcheck.css";
import "../css/responsive.css";
import "../css/select.css";
import "../css/terminal.css";
import "../css/utils.css";

// 3. Import external libraries and resources
import "@fortawesome/fontawesome-free/css/all.min.css";

// 4. Import CodeMirror core functionality and plugins
import CodeMirror from "codemirror";
window.CodeMirror = CodeMirror;

import "codemirror/mode/clike/clike";
import "codemirror/mode/gas/gas";
import "codemirror/keymap/vim";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/fold/foldcode";
import "codemirror/addon/fold/foldgutter";
import "codemirror/addon/fold/brace-fold";
import "codemirror/addon/fold/comment-fold";
import "codemirror/addon/hint/show-hint";

// 5. Import all application modules (in dependency order)
// Core modules first
import "./themes"; // Theme functionality
import "./templates"; // Code templates
import "./layout"; // Layout management
import "./selector"; // UI selection handling
import "./shortcuts"; // Keyboard shortcuts
import "./websocket"; // WebSocket communication
import "./terminal"; // Terminal functionality
import "./handlers"; // Event handlers
import "./editor"; // Main editor functionality (depends on most other modules)
