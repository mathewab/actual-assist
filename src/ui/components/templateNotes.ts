export type TemplateEntry = {
  type?: string;
  line?: string;
};

export type TemplateReplacement = string | null | undefined;

export const templateLinePattern = /^\s*#(template|goal)/i;

const isErrorTemplate = (template: TemplateEntry | undefined) =>
  template?.type === 'error' && typeof template.line === 'string';

const isManagedTemplate = (template: TemplateEntry | undefined) => template?.type !== 'error';

export const extractTemplateComments = (note: string | null, templates: TemplateEntry[]) => {
  const comments: string[] = [];
  if (!note) {
    return comments;
  }

  const lines = note.split('\n');
  let templateCursor = 0;

  for (let i = 0; i < lines.length && templateCursor < templates.length; i += 1) {
    const line = lines[i];
    if (!templateLinePattern.test(line.trim())) {
      continue;
    }

    const template = templates[templateCursor];
    templateCursor += 1;

    if (!isManagedTemplate(template)) {
      continue;
    }

    const commentLines: string[] = [];
    let cursor = i - 1;
    while (cursor >= 0 && !templateLinePattern.test(lines[cursor].trim())) {
      if (lines[cursor].trim() === '') {
        break;
      }
      commentLines.unshift(lines[cursor]);
      cursor -= 1;
    }

    comments.push(commentLines.join('\n'));
  }

  return comments;
};

export const getTemplateLineIndexes = (note: string) =>
  note
    .split('\n')
    .map((line, index) => (templateLinePattern.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0);

export const getTemplateLinesFromNote = (note: string) => {
  const lines = note.split('\n');
  return getTemplateLineIndexes(note).map((index) => lines[index]);
};

export const buildTemplateLinesFromTemplates = (
  templates: TemplateEntry[],
  renderedValue: string,
  renderedFallback?: string[]
) => {
  const renderedLines = renderedValue ? renderedValue.split('\n') : (renderedFallback ?? []);
  let renderedCursor = 0;

  return templates.map((template) => {
    if (isErrorTemplate(template)) {
      return template?.line || '';
    }
    const line = renderedLines[renderedCursor] ?? '';
    renderedCursor += 1;
    return line;
  });
};

export const buildNoteFromExisting = (
  note: string,
  templates: TemplateEntry[],
  comments: string[],
  replacements: TemplateReplacement[],
  appendedBlocks: Array<{ comment: string; line: string }>
) => {
  const lines = note.split('\n');
  const templateIndexes = getTemplateLineIndexes(note);

  if (templateIndexes.length === 0) {
    const mergedBlocks: string[] = [];
    appendedBlocks.forEach((block, index) => {
      if (block.comment) {
        mergedBlocks.push(...block.comment.split('\n'));
      }
      if (block.line) {
        mergedBlocks.push(block.line);
      }
      if (index < appendedBlocks.length - 1) {
        mergedBlocks.push('');
      }
    });

    if (mergedBlocks.length === 0) {
      return note.trimEnd();
    }

    const separator = note.trimEnd().length > 0 ? '\n\n' : '';
    return `${note.trimEnd()}${separator}${mergedBlocks.join('\n').trimEnd()}`;
  }

  const output: string[] = [];
  let cursor = 0;
  let templateCursor = 0;
  let commentCursor = 0;

  templateIndexes.forEach((templateIndex) => {
    const template = templates[templateCursor];
    const replacement = replacements[templateCursor];

    let commentStart = templateIndex;
    while (
      commentStart - 1 >= cursor &&
      !templateLinePattern.test(lines[commentStart - 1].trim()) &&
      lines[commentStart - 1].trim() !== ''
    ) {
      commentStart -= 1;
    }

    output.push(...lines.slice(cursor, commentStart));

    if (replacement === undefined) {
      output.push(...lines.slice(commentStart, templateIndex + 1));
    } else if (replacement !== null) {
      const comment = comments[commentCursor] ?? '';
      if (comment) {
        output.push(...comment.split('\n'));
      }
      if (replacement) {
        output.push(replacement);
      }
    }

    if (isManagedTemplate(template)) {
      commentCursor += 1;
    }
    templateCursor += 1;
    cursor = templateIndex + 1;
  });

  output.push(...lines.slice(cursor));

  if (lines[0]?.trim() !== '') {
    while (output.length > 0 && output[0].trim() === '') {
      output.shift();
    }
  }

  if (appendedBlocks.length > 0) {
    if (output.length > 0 && output[output.length - 1].trim() !== '') {
      output.push('');
    }
    appendedBlocks.forEach((block, index) => {
      if (block.comment) {
        output.push(...block.comment.split('\n'));
      }
      if (block.line) {
        output.push(block.line);
      }
      if (index < appendedBlocks.length - 1) {
        output.push('');
      }
    });
  }

  return output.join('\n').trimEnd();
};
