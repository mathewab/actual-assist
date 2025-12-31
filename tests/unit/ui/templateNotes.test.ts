import { describe, it, expect } from 'vitest';
import {
  buildNoteFromExisting,
  buildTemplateLinesFromTemplates,
  extractTemplateComments,
  getTemplateLinesFromNote,
  type TemplateEntry,
} from '../../../src/ui/components/templateNotes';

describe('templateNotes helpers', () => {
  it('extracts comments directly above templates until a blank line', () => {
    const note = ['Intro', '', 'Disney', '#template 5', 'Netflix', '#template 6'].join('\n');
    const templates: TemplateEntry[] = [{ type: 'simple' }, { type: 'simple' }];

    const comments = extractTemplateComments(note, templates);

    expect(comments).toEqual(['Disney', 'Netflix']);
  });

  it('skips error templates when extracting comments', () => {
    const note = ['#goal 500', '#template not-correct', 'Disney', '#template 12'].join('\n');
    const templates: TemplateEntry[] = [
      { type: 'goal' },
      { type: 'error', line: '#template not-correct' },
      { type: 'simple' },
    ];

    const comments = extractTemplateComments(note, templates);

    expect(comments).toEqual(['', 'Disney']);
  });

  it('builds template lines while preserving error lines', () => {
    const templates: TemplateEntry[] = [
      { type: 'goal' },
      { type: 'error', line: '#template not-correct' },
      { type: 'simple' },
    ];

    const rendered = ['#goal 500', '#template 20'].join('\n');

    const lines = buildTemplateLinesFromTemplates(templates, rendered);

    expect(lines).toEqual(['#goal 500', '#template not-correct', '#template 20']);
  });

  it('extracts template lines from a note in order', () => {
    const note = ['Intro', '#goal 500', 'Text', '#template 20'].join('\n');
    expect(getTemplateLinesFromNote(note)).toEqual(['#goal 500', '#template 20']);
  });

  it('keeps error line placement when first managed template is removed', () => {
    const note = ['#template not-correct', '#template 20', '#template 12'].join('\n');
    const templates: TemplateEntry[] = [
      { type: 'error', line: '#template not-correct' },
      { type: 'simple' },
      { type: 'simple' },
    ];
    const replacements = [undefined, null, '#template 12'];

    const rebuilt = buildNoteFromExisting(note, templates, ['', ''], replacements, []);

    expect(rebuilt).toEqual('#template not-correct\n#template 12');
  });

  it('preserves unknown template lines and comments when rebuilding notes', () => {
    const note = [
      '#goal 500',
      '#cleanup source',
      '',
      '#template not-correct',
      '#template 20',
      'Disney',
      '#template 12',
    ].join('\n');

    const templates: TemplateEntry[] = [
      { type: 'goal' },
      { type: 'error', line: '#template not-correct' },
      { type: 'simple' },
      { type: 'simple' },
    ];

    const rendered = ['#goal 500', '#template 20', '#template 12'].join('\n');
    const templateLines = buildTemplateLinesFromTemplates(templates, rendered);
    const comments = extractTemplateComments(note, templates);
    const replacements = templateLines.map((line, index) =>
      templates[index]?.type === 'error' ? undefined : line
    );

    const rebuilt = buildNoteFromExisting(note, templates, comments, replacements, []);

    expect(rebuilt).toEqual(note);
  });

  it('removes template blocks when all templates are removed', () => {
    const note = ['Disney', '#template 12', '', 'Other note'].join('\n');
    const templates: TemplateEntry[] = [{ type: 'simple' }];
    const replacements = [null];

    const rebuilt = buildNoteFromExisting(note, templates, [], replacements, []);

    expect(rebuilt).toEqual('Other note');
  });
});
