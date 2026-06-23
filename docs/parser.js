/**
 * RetroSpec Parser - Client-side ProGuard/R8 Mapping Parser and Stack Trace Retracer.
 */
class ProGuardMapParser {
  constructor() {
    this.classesByObfuscated = new Map();
    this.classesByOriginal = new Map();
    this.totalClasses = 0;
    this.totalMethods = 0;
    this.totalFields = 0;
  }

  /**
   * Resets the parsed database.
   */
  clear() {
    this.classesByObfuscated.clear();
    this.classesByOriginal.clear();
    this.totalClasses = 0;
    this.totalMethods = 0;
    this.totalFields = 0;
  }

  /**
   * Parses ProGuard mapping text line by line.
   * Uses chunked parsing or simple split based on performance.
   * @param {string} mappingText
   * @param {function} onProgress Callback for loading progress (percentage)
   */
  parse(mappingText, onProgress) {
    this.clear();
    if (!mappingText) return;

    const lines = mappingText.split(/\r?\n/);
    let currentClass = null;

    // RegEx patterns
    const classRegex = /^([^#\s]+)\s+->\s+([^#\s:]+):$/;
    const fieldRegex = /^\s+([^#\s]+)\s+([^#\s]+)\s+->\s+([^#\s]+)$/;
    
    // RegEx to match methods. Supports:
    //   12:15:void myMethod(int) -> a
    //   12:15:void myMethod(int):25 -> a
    //   12:15:void myMethod(int):25:28 -> a
    //   void myMethod(int) -> a
    const methodRegex = /^\s+(?:(\d+):(\d+):)?([^#\s]+)\s+([^#\s]+)\(([^#\s]*)\)(?::(\d+)(?::(\d+))?)?\s+->\s+([^#\s]+)$/;

    const totalLines = lines.length;
    
    for (let i = 0; i < totalLines; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;

      // Class mappings: original.package.Class -> obfuscated.package.a:
      const classMatch = line.match(classRegex);
      if (classMatch) {
        const originalName = classMatch[1];
        const obfuscatedName = classMatch[2];
        
        currentClass = {
          originalName,
          obfuscatedName,
          fields: new Map(),
          methods: [],
          fieldsList: [],
          methodsList: []
        };
        
        this.classesByObfuscated.set(obfuscatedName, currentClass);
        this.classesByOriginal.set(originalName, currentClass);
        this.totalClasses++;
        continue;
      }

      if (!currentClass) continue;

      // Method mappings
      const methodMatch = line.match(methodRegex);
      if (methodMatch) {
        const startLine = methodMatch[1] ? parseInt(methodMatch[1], 10) : null;
        const endLine = methodMatch[2] ? parseInt(methodMatch[2], 10) : null;
        const returnType = methodMatch[3];
        const originalName = methodMatch[4];
        const paramTypes = methodMatch[5];
        const originalStartLine = methodMatch[6] ? parseInt(methodMatch[6], 10) : null;
        const originalEndLine = methodMatch[7] ? parseInt(methodMatch[7], 10) : null;
        const obfuscatedName = methodMatch[8];

        const methodObj = {
          obfuscatedName,
          originalName,
          returnType,
          paramTypes,
          startLine,
          endLine,
          originalStartLine: originalStartLine !== null ? originalStartLine : (startLine !== null ? startLine : null),
          originalEndLine: originalEndLine !== null ? originalEndLine : (originalStartLine !== null ? originalStartLine : (endLine !== null ? endLine : null))
        };

        currentClass.methods.push(methodObj);
        currentClass.methodsList.push(methodObj);
        this.totalMethods++;
        continue;
      }

      // Field mappings
      const fieldMatch = line.match(fieldRegex);
      if (fieldMatch) {
        const fieldType = fieldMatch[1];
        const originalName = fieldMatch[2];
        const obfuscatedName = fieldMatch[3];

        currentClass.fields.set(obfuscatedName, originalName);
        currentClass.fieldsList.push({
          fieldType,
          originalName,
          obfuscatedName
        });
        this.totalFields++;
        continue;
      }

      // Periodic progress callbacks if requested
      if (onProgress && i % 10000 === 0) {
        onProgress(Math.round((i / totalLines) * 100));
      }
    }

    if (onProgress) {
      onProgress(100);
    }
  }

  /**
   * De-obfuscate class name
   * @param {string} obfuscatedClassName
   * @returns {string} Original class name or input if not found
   */
  retraceClass(obfuscatedClassName) {
    const classObj = this.classesByObfuscated.get(obfuscatedClassName);
    return classObj ? classObj.originalName : obfuscatedClassName;
  }

  /**
   * Retraces obfuscated field name
   * @param {string} obfuscatedClassName
   * @param {string} obfuscatedFieldName
   * @returns {string} Original field name or input if not found
   */
  retraceField(obfuscatedClassName, obfuscatedFieldName) {
    const classObj = this.classesByObfuscated.get(obfuscatedClassName);
    if (!classObj) return obfuscatedFieldName;
    return classObj.fields.get(obfuscatedFieldName) || obfuscatedFieldName;
  }

  /**
   * De-obfuscates method name (and maps stack line numbers to source lines)
   * @param {string} obfuscatedClassName
   * @param {string} obfuscatedMethodName
   * @param {number|null} obfuscatedLineNumber
   * @returns {object} Retraced method payload
   */
  retraceMethod(obfuscatedClassName, obfuscatedMethodName, obfuscatedLineNumber = null) {
    const classObj = this.classesByObfuscated.get(obfuscatedClassName);
    if (!classObj) {
      return {
        className: obfuscatedClassName,
        methodName: obfuscatedMethodName,
        lineNumber: obfuscatedLineNumber,
        matched: false
      };
    }

    const cleanClassName = classObj.originalName;

    // Filter methods matching the obfuscated name
    const candidates = classObj.methods.filter(m => m.obfuscatedName === obfuscatedMethodName);
    if (candidates.length === 0) {
      return {
        className: cleanClassName,
        methodName: obfuscatedMethodName,
        lineNumber: obfuscatedLineNumber,
        matched: false
      };
    }

    // Try to match based on the line number
    if (obfuscatedLineNumber !== null) {
      const lineNum = parseInt(obfuscatedLineNumber, 10);
      const exactMatch = candidates.find(
        m => m.startLine !== null && m.endLine !== null && lineNum >= m.startLine && lineNum <= m.endLine
      );

      if (exactMatch) {
        let mappedLine = exactMatch.originalStartLine;
        if (exactMatch.startLine !== null && exactMatch.originalStartLine !== null) {
          mappedLine = exactMatch.originalStartLine + (lineNum - exactMatch.startLine);
        }
        return {
          className: cleanClassName,
          methodName: exactMatch.originalName,
          lineNumber: mappedLine,
          info: exactMatch,
          matched: true
        };
      }
    }

    // If no line number matches or no line numbers are in mapping, fallback to first matching method
    const firstCandidate = candidates[0];
    return {
      className: cleanClassName,
      methodName: firstCandidate.originalName,
      lineNumber: obfuscatedLineNumber,
      info: firstCandidate,
      matched: true
    };
  }

  /**
   * Retraces a full stack trace text line-by-line.
   * Returns line objects with metadata for visualization.
   * @param {string} stackTraceText
   * @returns {Array<object>}
   */
  retraceStackTrace(stackTraceText) {
    if (!stackTraceText) return [];

    const lines = stackTraceText.split(/\r?\n/);
    const retracedLines = [];

    // Matches standard stack trace frames:
    // e.g. "  at com.example.a.a(Unknown Source)" or "at a.b.c.a.a(a.java:15)"
    // Captures:
    // 1: Prefix before class name (e.g. "    at ")
    // 2: Class name (e.g. "a.b.c.a")
    // 3: Method name (e.g. "a" or "<init>" or "<clinit>")
    // 4: Location / file (e.g. "a.java" or "SourceFile" or "Unknown Source")
    // 5: Line number (optional, e.g. "15")
    // 6: Suffix (e.g. " (native)" or anything after line number bracket)
    const frameRegex = /^(\s*at\s+)([a-zA-Z0-9$_.]+)\.([a-zA-Z0-9$_<>]+)\(([^:]+)(?::(\d+))?\)(.*)$/;

    // Matches exception headings: "Caused by: a.b.c.a: Exception Message"
    const causedByRegex = /^(\s*(?:Caused by:|Exception in thread "[^"]+":)\s+)([a-zA-Z0-9$_.]+)(:.*)?$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Try frame regex
      const frameMatch = line.match(frameRegex);
      if (frameMatch) {
        const prefix = frameMatch[1];
        const obfuscatedClass = frameMatch[2];
        const obfuscatedMethod = frameMatch[3];
        const fileName = frameMatch[4];
        const lineNumberStr = frameMatch[5];
        const suffix = frameMatch[6] || '';
        const lineNum = lineNumberStr ? parseInt(lineNumberStr, 10) : null;

        const retraced = this.retraceMethod(obfuscatedClass, obfuscatedMethod, lineNum);
        
        let cleanFileName = fileName;
        if (retraced.matched || this.classesByObfuscated.has(obfuscatedClass)) {
          const originalClass = this.retraceClass(obfuscatedClass);
          const simpleName = originalClass.substring(originalClass.lastIndexOf('.') + 1);
          // Replace obfuscated filenames (e.g., "SourceFile" or "a.java") with mapped class name
          if (fileName === 'SourceFile' || fileName.endsWith('.java') || fileName.includes('.')) {
            // Strip nested class identifier from filename
            cleanFileName = simpleName.split('$')[0] + '.java';
          }
        }

        const linePart = retraced.lineNumber !== null ? `:${retraced.lineNumber}` : '';

        retracedLines.push({
          type: 'frame',
          originalLine: line,
          retracedLine: `${prefix}${retraced.className}.${retraced.methodName}(${cleanFileName}${linePart})${suffix}`,
          metadata: {
            obfuscatedClass,
            obfuscatedMethod,
            obfuscatedLine: lineNum,
            retracedClass: retraced.className,
            retracedMethod: retraced.methodName,
            retracedLineNum: retraced.lineNumber,
            matched: retraced.matched || this.classesByObfuscated.has(obfuscatedClass)
          }
        });
        continue;
      }

      // Try "Caused by" exception match
      const causedByMatch = line.match(causedByRegex);
      if (causedByMatch) {
        const prefix = causedByMatch[1];
        const obfuscatedClass = causedByMatch[2];
        const suffix = causedByMatch[3] || '';
        const retracedClass = this.retraceClass(obfuscatedClass);

        retracedLines.push({
          type: 'caused-by',
          originalLine: line,
          retracedLine: `${prefix}${retracedClass}${suffix}`,
          metadata: {
            obfuscatedClass,
            retracedClass,
            matched: this.classesByObfuscated.has(obfuscatedClass)
          }
        });
        continue;
      }

      // Text line fallback: Scan for any fully-qualified class names and replace them
      let retracedLine = line;
      const classPattern = /\b([a-zA-Z0-9$_]+\.[a-zA-Z0-9$_.]+)\b/g;
      let match;
      const replacedClasses = [];

      while ((match = classPattern.exec(line)) !== null) {
        const word = match[1];
        if (this.classesByObfuscated.has(word)) {
          replacedClasses.push({
            obfuscated: word,
            original: this.retraceClass(word)
          });
        }
      }

      // Replace from longest to shortest obfuscated class names to avoid partial match issues
      replacedClasses.sort((a, b) => b.obfuscated.length - a.obfuscated.length);
      for (const replacement of replacedClasses) {
        // Use regex search with word boundaries or string replace to de-obfuscate class
        retracedLine = retracedLine.split(replacement.obfuscated).join(replacement.original);
      }

      retracedLines.push({
        type: 'text',
        originalLine: line,
        retracedLine: retracedLine,
        metadata: {
          replacedClasses
        }
      });
    }

    return retracedLines;
  }
}

// Export parser class globally for browser scripts
window.ProGuardMapParser = ProGuardMapParser;
