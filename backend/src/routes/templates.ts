import express, { Request, Response, NextFunction } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import { asyncRouteHandler } from "../utils/routeHandler";

const router = express.Router();

// Directory where template files will be stored
const TEMPLATES_DIR = path.join(__dirname, "../../templates");

// Improved type definitions using Record
type TemplateContent = string;
type TemplatesByName = Record<string, TemplateContent>;
type TemplateCollection = Record<string, TemplatesByName>;

// Cache for templates to avoid frequent disk reads
let templatesCache: TemplateCollection | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Middleware to validate requested language
 */
async function validateLanguage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const language = req.params.language;

  if (!language) {
    return res.status(400).json({ error: "Language parameter is required" });
  }

  try {
    const langPath = path.join(TEMPLATES_DIR, language);
    const exists = await fs
      .access(langPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      return res.status(404).json({
        error: `Language '${language}' not supported or has no templates`,
      });
    }

    next();
  } catch (error) {
    console.error(`Error validating language ${language}:`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get a list of available templates for a specific language
 * @param {string} language - Programming language
 * @returns {Promise<string[]>} - List of template names
 */
async function getTemplateList(language: string): Promise<string[]> {
  try {
    const langPath = path.join(TEMPLATES_DIR, language);
    const templateFiles = await fs.readdir(langPath);
    return templateFiles.map((file) => path.basename(file, path.extname(file)));
  } catch (error) {
    console.error(`Error getting template list for ${language}:`, error);
    return [];
  }
}

/**
 * Load a single template by language and name
 * @param {string} language - Programming language
 * @param {string} templateName - Template name
 * @returns {Promise<string | null>} - Template content
 */
async function loadSingleTemplate(
  language: string,
  templateName: string
): Promise<string | null> {
  try {
    // Check if template exists in cache
    if (
      templatesCache &&
      Date.now() - lastCacheTime < CACHE_TTL &&
      templatesCache[language] &&
      templatesCache[language][templateName]
    ) {
      return templatesCache[language][templateName];
    }

    // Find template file with any extension
    const langPath = path.join(TEMPLATES_DIR, language);
    const files = await fs.readdir(langPath);

    const templateFile = files.find(
      (file) => path.basename(file, path.extname(file)) === templateName
    );

    if (!templateFile) {
      return null;
    }

    // Read the template content
    const filePath = path.join(langPath, templateFile);
    const content = await fs.readFile(filePath, "utf8");

    // Update cache
    if (!templatesCache) {
      templatesCache = {};
    }
    if (!templatesCache[language]) {
      templatesCache[language] = {};
    }
    templatesCache[language][templateName] = content;
    lastCacheTime = Date.now();

    return content;
  } catch (error) {
    console.error(
      `Error loading template ${templateName} for ${language}:`,
      error
    );
    return null;
  }
}

// Route to get a list of template names for a language
router.get(
  "/:language/list",
  validateLanguage,
  asyncRouteHandler(async (req: Request, res: Response) => {
    const language = req.params.language;

    const templateNames = await getTemplateList(language);

    if (templateNames.length === 0) {
      return res
        .status(404)
        .json({ error: `No templates found for language: ${language}` });
    }

    res.json(templateNames);
  })
);

// Route to get a single template by language and name
router.get(
  "/:language/:templateName",
  validateLanguage,
  asyncRouteHandler(async (req: Request, res: Response) => {
    const { language, templateName } = req.params;

    const templateContent = await loadSingleTemplate(language, templateName);

    if (templateContent === null) {
      return res.status(404).json({
        error: `Template '${templateName}' not found for language '${language}'`,
      });
    }

    res.json({ content: templateContent });
  })
);

export default router;
