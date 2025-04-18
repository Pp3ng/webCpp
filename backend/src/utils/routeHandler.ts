/**
 * Route handler utilities for common patterns in route implementations
 */
import * as fs from "fs-extra";
import * as path from "path";
import * as tmp from "tmp";
import { DirResult } from "tmp";
import { exec, ExecOptions } from "child_process";
import { Request, Response, NextFunction } from "express";

/**
 * Standard API response structure
 */
export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Base request interface for code operations
 */
export interface CodeRequest {
  code: string;
  lang: string;
  compiler?: string;
  optimization?: string;
  action?: string;
}

/**
 * Result of command execution
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Result of code validation
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
  error?: string;
}

/**
 * Validates input code for basic issues
 * @param {string} code - Code to validate
 * @param {boolean} useErrorField - Use 'error' property instead of 'message' in result
 * @returns {ValidationResult} Validation result
 */
export function validateCode(
  code: string,
  useErrorField: boolean = false
): ValidationResult {
  if (!code || code.trim() === "") {
    return useErrorField
      ? { valid: false, error: "Error: No code provided" }
      : { valid: false, message: "Error: No code provided" };
  }

  // Check code length
  if (code.length > 50000) {
    const errorMsg = "Error: Code exceeds maximum length of 50,000 characters";
    return useErrorField
      ? { valid: false, error: errorMsg }
      : { valid: false, message: errorMsg };
  }

  // Check line count
  if (code.split("\n").length > 1000) {
    const errorMsg = "Error: Code exceeds maximum of 1,000 lines";
    return useErrorField
      ? { valid: false, error: errorMsg }
      : { valid: false, message: errorMsg };
  }

  return { valid: true };
}

/**
 * Environment for code compilation
 */
export interface CompilationEnvironment {
  tmpDir: DirResult;
  sourceFile: string;
  outputFile: string;
  asmFile?: string;
}

/**
 * Creates a temporary working directory for code operations
 * @param {string} prefix - Prefix for temp directory name
 * @returns {DirResult} Temporary directory object
 */
export function createTempDirectory(prefix: string = "CinCout-"): DirResult {
  return tmp.dirSync({ prefix, unsafeCleanup: true });
}

/**
 * Writes code to a file in the specified directory
 * @param {string} dirPath - Directory path
 * @param {string} filename - File name
 * @param {string} code - Code content
 * @returns {string} Full path to created file
 */
export function writeCodeToFile(
  dirPath: string,
  filename: string,
  code: string
): string {
  const filePath = path.join(dirPath, filename);
  fs.writeFileSync(filePath, code);
  return filePath;
}

/**
 * Creates a standard compilation environment with necessary files
 * @param {string} lang - Programming language (cpp or c)
 * @returns {CompilationEnvironment} Object with file paths
 */
export function createCompilationEnvironment(
  lang: string
): CompilationEnvironment {
  const tmpDir = createTempDirectory();
  const sourceExtension = lang === "cpp" ? "cpp" : "c";
  const sourceFile = path.join(tmpDir.name, `program.${sourceExtension}`);
  const outputFile = path.join(tmpDir.name, "program.out");
  const asmFile = path.join(tmpDir.name, "program.s");

  return { tmpDir, sourceFile, outputFile, asmFile };
}

/**
 * Executes a command and returns a promise
 * @param {string} command - Command to execute
 * @param {object} options - Execution options
 * @returns {Promise<ExecResult>} Promise resolving with stdout or rejecting with error
 */
export function executeCommand(
  command: string,
  options: ExecOptions & {
    shell?: boolean | string;
    failOnError?: boolean;
  } = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error && options.failOnError !== false) {
        reject(stderr || error.message);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Clean file paths from output
 * @param {string} output - Raw output to sanitize
 * @returns {string} Sanitized output
 */
export function sanitizeOutput(output: string): string {
  if (!output) {
    return "";
  }
  return output.replace(/[^:\s]+\.(cpp|c|h|hpp):/g, "");
}

/**
 * Determines compiler command based on language and compiler selection
 * @param {string} lang - Programming language (cpp or c)
 * @param {string} compiler - Compiler selection
 * @returns {string} Compiler command
 */
export function getCompilerCommand(lang: string, compiler?: string): string {
  return lang === "cpp"
    ? compiler === "clang"
      ? "clang++"
      : "g++"
    : compiler === "clang"
    ? "clang"
    : "gcc";
}

/**
 * Gets standard option based on language
 * @param {string} lang - Programming language (cpp or c)
 * @returns {string} Standard option
 */
export function getStandardOption(lang: string): string {
  return lang === "cpp" ? "-std=c++20" : "-std=c11";
}

/**
 * Generic async route handler to reduce boilerplate and standardize error handling
 * @param fn - The route handler function to wrap
 * @returns A middleware function that handles errors
 */
export function asyncRouteHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error(`Route error:`, error);
      const errorMessage = (error as Error).message || String(error);
      res.status(500).json({
        success: false,
        error: `An error occurred: ${errorMessage}`,
      });
    }
  };
}

/**
 * Format output for display in frontend with HTML markup
 * @param {string} text - Text to format
 * @param {string} outputType - Type of output (default, memcheck, style, etc.)
 * @returns {string} Formatted HTML output
 */
export function formatOutput(
  text: string,
  outputType: string = "default"
): string {
  if (!text) return "";

  // Only apply HTML sanitization and formatting for output types that need it
  if (
    outputType === "default" ||
    outputType === "memcheck" ||
    outputType === "style"
  ) {
    // Basic HTML sanitization
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Process based on output type
    switch (outputType) {
      case "memcheck":
        // Pre-process memcheck output
        text = text
          // Remove valgrind prefixes
          .replace(/==\d+== /g, "")
          // Clean up spacing
          .replace(/\s+from\s+/g, " from ")
          // Remove temporary directory paths - more robust regex to catch various forms
          .replace(
            /\(\/tmp\/CinCout-[^\/]+\/[^:)]+:[^\)]+\)/g,
            "(program.c:LINE)"
          )
          .replace(
            /by 0x[0-9a-fA-F]+: \w+ \(\/tmp\/CinCout-[^\/]+\/([^:)]+):(\d+)\)/g,
            "by 0x...: (line: $2)"
          )
          // Remove all other path references
          .replace(/in \/.*?\/([^\/]+)\)/g, "in $1)")
          // Clean up whitespace
          .replace(/^\s*\n/g, "")
          .replace(/\n\s*\n/g, "\n")
          // Mark line numbers for further processing
          .replace(/\((?:program\.c|program\.cpp):(\d+)\)/g, "###LINE:$1###")
          // Mark memory leaks
          .replace(
            /(\d+ bytes? in \d+ blocks? are definitely lost.*?)(?=\s*at|$)/g,
            "###LEAK:$1###"
          );
        break;

      case "style":
        // Process style check output
        // No special pre-processing needed, just the common formatting
        break;

      default:
        // Default formatting (no pre-processing)
        break;
    }

    // Common formatting for styled output types

    // Highlight error and warning messages
    text = text
      .replace(/error:/gi, '<span class="error-text">error:</span>')
      .replace(/warning:/gi, '<span class="warning-text">warning:</span>');

    // Highlight line and column numbers
    text = text.replace(
      /(\d+):(\d+):/g,
      '<span class="line-number">$1</span>:<span class="column-number">$2</span>:'
    );

    // Format memcheck specific markers if present
    if (
      outputType === "memcheck" &&
      (text.includes("HEAP SUMMARY") ||
        text.includes("LEAK SUMMARY") ||
        text.includes("###LINE") ||
        text.includes("###LEAK"))
    ) {
      text = text
        .replace(
          /###LINE:(\d+)###/g,
          '(line: <span class="line-number">$1</span>)'
        )
        .replace(/###LEAK:(.*?)###/g, '<div class="memcheck-leak">$1</div>')
        .trim() // Remove leading and trailing whitespace
        .replace(/\n{2,}/g, "\n"); // Remove multiple newlines
    }
  }

  return text;
}
