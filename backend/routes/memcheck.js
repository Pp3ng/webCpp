/**
 * Memory checking router
 */
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const {
  validateCode,
  createTempDirectory,
  writeCodeToFile,
  executeCommand,
  getCompilerCommand,
  getStandardOption,
  sanitizeOutput,
  formatMemcheckOutput
} = require('../utils/helpers');

router.post('/', async (req, res) => {
  const { code, lang, compiler: selectedCompiler, optimization } = req.body;
  
  // Validate code
  const validation = validateCode(code);
  if (!validation.valid) {
    return res.status(400).send(validation.message);
  }
  
  try {
    // Create temporary directory
    const tmpDir = createTempDirectory();
    const sourceExtension = lang === 'cpp' ? 'cpp' : 'c';
    const sourceFile = writeCodeToFile(tmpDir.name, `program.${sourceExtension}`, code);
    const outputFile = path.join(tmpDir.name, 'program.out');
    const valgrindLog = path.join(tmpDir.name, 'valgrind.log');
    
    try {
      // Determine compiler and options
      const compiler = getCompilerCommand(lang, selectedCompiler);
      const standardOption = getStandardOption(lang);
      const optimizationOption = optimization || '-O0';
      
      // Compile code
      const compileCmd = `${compiler} -g ${standardOption} ${optimizationOption} "${sourceFile}" -o "${outputFile}"`;
      
      try {
        await executeCommand(compileCmd);
      } catch (stderr) {
        return res.status(400).send(`Compilation Error:\n${sanitizeOutput(stderr)}`);
      }
      
      // Run Valgrind
      const valgrindCmd = `valgrind --tool=memcheck --leak-check=full --show-leak-kinds=all --track-origins=yes --log-file="${valgrindLog}" "${outputFile}"`;
      
      await executeCommand(valgrindCmd, { failOnError: false });
      
      // Read Valgrind log
      const valgrindOutput = fs.readFileSync(valgrindLog, 'utf8');
      
      // Extract important information
      let report = '';
      const lines = valgrindOutput.split('\n');
      let startReading = false;
      
      for (const line of lines) {
        if (line.includes('HEAP SUMMARY:')) {
          startReading = true;
        }
        
        if (startReading && line.trim() !== '' && !line.includes('For lists of')) {
          report += line + '\n';
        }
      }
      
      res.send(formatMemcheckOutput(report));
    } finally {
      // Clean up temporary files
      tmpDir.removeCallback();
    }
  } catch (error) {
    res.status(500).send(`Error: ${error.message || error}`);
  }
});

module.exports = router; 